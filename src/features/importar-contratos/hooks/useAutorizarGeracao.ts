import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import { getNextContratoNumbers } from "@/lib/contrato-numbering";
import { logAudit } from "@/lib/audit";
import { normalizeContratoBase } from "@/lib/utils/normalize";
import type { ContratoPreliminar } from "@/lib/contratoImport";
import {
  compactNumber,
  hasM2AActors,
  resolveFornecedorKey,
  resolveFornecedorNome,
  resolveSecretariaForContrato,
  UNKNOWN_SUPPLIER_KEY,
  type FornecedorPrepostoTarget,
  type M2AItemRow,
  type SecretariaM2A,
} from "../lib";

type JobDetail = {
  job: any;
  itens: any[];
  dotacoes: any[];
};

/**
 * Fluxo completo de autorização/geração de contratos em lote a partir de um
 * `contrato_import_job` em preview. Preserva 100% da lógica original:
 *  - Todas as validações (fornecedores sem preposto, contratos sem ata, cadastro incompleto)
 *  - Numeração automática atômica via `getNextContratoNumbers`
 *  - Upsert de prepostos por fornecedor
 *  - Rollback manual em caso de falha na persistência
 *  - Auditoria e invalidações de cache
 *  - Redirecionamento final para /processos/$id
 *  - Telemetria completa (console.group/time/table)
 */
export function useAutorizarGeracao(options: {
  jobDetail: JobDetail | undefined;
  activeJobId: string | null;
  contratosSelecionados: ContratoPreliminar[];
  contratosSemAtaM2A: ContratoPreliminar[];
  contratosSemCadastroM2A: Array<{ contrato: ContratoPreliminar; secretaria?: SecretariaM2A | null }>;
  contratosDesmarcados: Set<string>;
  fornecedoresPrepostoTargets: FornecedorPrepostoTarget[];
  fornecedoresSemPreposto: FornecedorPrepostoTarget[];
  prepostosByFornecedor: Record<string, string>;
  secretariasM2A: SecretariaM2A[];
  m2aItens: M2AItemRow[];
  numeroProcessoBase: string;
  objetoBatch: string;
  dataBatch: string;
  criarProcesso: boolean;
  processoId: string;
  setBusy: (value: boolean) => void;
}) {
  const {
    jobDetail,
    activeJobId,
    contratosSelecionados,
    contratosSemAtaM2A,
    contratosSemCadastroM2A,
    contratosDesmarcados,
    fornecedoresPrepostoTargets,
    fornecedoresSemPreposto,
    prepostosByFornecedor,
    secretariasM2A,
    m2aItens,
    numeroProcessoBase,
    objetoBatch,
    dataBatch,
    criarProcesso,
    processoId,
    setBusy,
  } = options;

  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const autorizarGeracao = useCallback(async () => {
    if (!jobDetail) return;
    console.group("M2A: Geração de Contratos em Lote");
    console.time("ProcessoGeracaoLote");

    // Validações de UI antes de prosseguir
    console.log("Passo 1: Validando informações do lote...");
    const numeroBaseContrato = normalizeContratoBase(numeroProcessoBase);
    if (!numeroBaseContrato) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Informe o nº base do processo (ex.: 026/2025)");
    }
    if (fornecedoresSemPreposto.length > 0) {
      console.table(
        fornecedoresSemPreposto.map((target) => ({
          fornecedor: target.fornecedorNome,
          contratos: target.contratos,
        })),
      );
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Preposto pendente por fornecedor.", {
        description:
          "Preencha o nome do preposto para cada fornecedor listado na aba Autorizar geração.",
      });
    }
    if (!objetoBatch.trim()) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Informe o objeto desta geração de contratos");
    }
    if (!dataBatch || !/^\d{4}-\d{2}-\d{2}$/.test(dataBatch)) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Informe a data dos contratos.");
    }
    if (contratosSelecionados.length === 0) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Nenhum contrato a gerar (todos desmarcados).");
    }
    if (contratosSemAtaM2A.length > 0) {
      console.table(
        contratosSemAtaM2A.map((contrato) => ({
          fornecedor: contrato.empresa,
          secretaria: contrato.secretariaSigla,
          dotacao: contrato.dotacao,
          itens: contrato.itens.map((item) => item.numeroItem).join(","),
        })),
      );
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Há contratos sem ata definida.", {
        description:
          "Revise a aba Itens e selecione a ata correta para os itens sem vínculo.",
      });
    }
    if (contratosSemCadastroM2A.length > 0) {
      console.table(
        contratosSemCadastroM2A.map(({ contrato, secretaria }) => ({
          sigla: contrato.secretariaSigla,
          dotacao: contrato.dotacao,
          secretaria: secretaria?.nome ?? "não encontrada",
          unidade_gestora: secretaria?.m2a_orgao_id,
          orgao_dotacao: secretaria?.m2a_dot_orgao_id,
          unidade_orcamentaria: secretaria?.m2a_uo_id,
          despesa_projeto_atividade: secretaria?.m2a_dot_id,
          fiscal_id: secretaria?.m2a_fiscal_codigo,
          gestor_id: secretaria?.m2a_gestor_codigo,
        })),
      );
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Cadastro externo incompleto", {
        description:
          "Complete Unidade Gestora, Órgão da Dotação, UO, Dotação, Fiscal e Gestor em /secretarias antes de gerar os contratos.",
      });
    }

    console.log("Dados validados:", {
      objeto: objetoBatch,
      qtdContratos: contratosSelecionados.length,
      desmarcados: contratosDesmarcados.size,
    });

    startTask(
      "Gerando contratos",
      `Preparando ${contratosSelecionados.length} contrato(s)...`,
    );
    setBusy(true);
    try {
      // Resolve processo: usar selecionado OU criar um novo agrupando o lote.
      let processoIdFinal: string | null =
        ((jobDetail.job as any).processo_id as string | null) ||
        processoId ||
        null;
      let processoCriadoNestaGeracao = false;
      if (!processoIdFinal && criarProcesso) {
        updateProgress(8, "Criando processo administrativo...");
        console.log(
          "Passo 2: Criando novo processo administrativo para o lote...",
        );
        const { data: novoProc, error: procErr } = await supabase
          .from("processos")
          .insert({
            numero_processo: numeroProcessoBase || null,
            objeto: objetoBatch,
            data_abertura: dataBatch,
            status: "em_andamento",
            m2a_url: (jobDetail.job as any).m2a_url ?? null,
            m2a_processo_id: (jobDetail.job as any).m2a_processo_id ?? null,
          })
          .select("id")
          .single();

        if (procErr) {
          console.error("Falha ao criar processo:", procErr);
          throw procErr;
        }
        processoIdFinal = novoProc.id;
        processoCriadoNestaGeracao = true;
        console.log("Processo criado com ID:", novoProc.id);
        await logAudit({
          action: "create",
          entityType: "processo",
          entityId: novoProc.id,
          payload: { origem: "importar-contratos", objeto: objetoBatch },
        });
      } else {
        updateProgress(8, "Vinculando processo administrativo existente...");
        console.log(
          "Passo 2: Utilizando processo administrativo existente. ID:",
          processoIdFinal,
        );
        if (processoIdFinal) {
          await supabase
            .from("processos")
            .update({
              numero_processo: numeroProcessoBase || null,
              objeto: objetoBatch,
              status: "em_andamento",
              m2a_url: (jobDetail.job as any).m2a_url ?? null,
              m2a_processo_id: (jobDetail.job as any).m2a_processo_id ?? null,
            })
            .eq("id", processoIdFinal);
        }
      }

      // Para cada contrato preliminar, alocar nº na secretaria de forma ATÔMICA via RPC em lote.
      console.log("Passo 3: Reservando numeração sequencial automática...");
      updateProgress(18, "Reservando numeração automática...");
      const preliminaresResolvidos = contratosSelecionados.map((contrato) => ({
        contrato,
        secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
      }));

      const semSecretaria = preliminaresResolvidos.filter(
        ({ secretaria }) => !secretaria,
      );
      if (semSecretaria.length > 0) {
        console.table(
          semSecretaria.map(({ contrato }) => ({
            sigla: contrato.secretariaSigla,
            dotacao: contrato.dotacao,
          })),
        );
        throw new Error(
          "Há contratos sem secretaria correspondente. Confira sigla + dotação no cadastro de secretarias.",
        );
      }

      const semM2A = preliminaresResolvidos.filter(
        ({ secretaria }) => !hasM2AActors(secretaria),
      );
      if (semM2A.length > 0) {
        console.table(
          semM2A.map(({ contrato, secretaria }) => ({
            sigla: contrato.secretariaSigla,
            dotacao: contrato.dotacao,
            secretaria: secretaria?.nome,
            unidade_gestora: secretaria?.m2a_orgao_id,
            orgao_dotacao: secretaria?.m2a_dot_orgao_id,
            unidade_orcamentaria: secretaria?.m2a_uo_id,
            despesa_projeto_atividade: secretaria?.m2a_dot_id,
            fiscal_id: secretaria?.m2a_fiscal_codigo,
            gestor_id: secretaria?.m2a_gestor_codigo,
          })),
        );
        throw new Error(
          "Há secretarias sem Unidade Gestora, Órgão da Dotação, UO, Dotação, Fiscal ou Gestor cadastrados.",
        );
      }

      const porSecretaria = new Map<
        string,
        { secretaria: SecretariaM2A; qtd: number }
      >();
      for (const { secretaria } of preliminaresResolvidos) {
        const sec = secretaria!;
        const key = `${sec.numero}:${sec.sigla}`;
        const atual = porSecretaria.get(key) ?? { secretaria: sec, qtd: 0 };
        atual.qtd += 1;
        porSecretaria.set(key, atual);
      }

      const proximoPorSec = new Map<
        string,
        Awaited<ReturnType<typeof getNextContratoNumbers>>
      >();
      for (const [secKey, { secretaria: sec, qtd }] of porSecretaria) {
        console.log(
          `[Numeracao] Reservando bloco de ${qtd} números para ${sec.sigla} / ${sec.nome}...`,
        );

        const numeros = await getNextContratoNumbers(supabase, {
          numeroBase: numeroBaseContrato,
          secretariaSigla: sec.sigla,
          quantidade: qtd,
        });
        const ultimoNumero = numeros.at(-1);
        if (!ultimoNumero) {
          throw new Error(`Falha ao reservar numeração para ${sec.sigla}.`);
        }

        const { error: numeracaoError } = await supabase
          .from("numeracao")
          .upsert(
            {
              secretaria_num: sec.numero,
              contador: ultimoNumero.sequencia,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "secretaria_num" },
          );
        if (numeracaoError) {
          throw new Error(
            `Falha ao atualizar contador de ${sec.sigla}: ${numeracaoError.message}`,
          );
        }
        proximoPorSec.set(secKey, numeros);
        console.log(
          `Reserva para ${sec.sigla} OK. Bloco: ${numeros.map((item) => item.numeroContrato).join(",")}`,
        );
      }

      const fornecedoresPersistiveis = fornecedoresPrepostoTargets
        .filter((target) => target.key !== UNKNOWN_SUPPLIER_KEY)
        .map((target) => ({
          fornecedor_nome: target.fornecedorNome,
          fornecedor_nome_norm: target.key,
          preposto_nome: prepostosByFornecedor[target.key].trim(),
          ativo: true,
        }));

      if (fornecedoresPersistiveis.length > 0) {
        updateProgress(30, "Atualizando prepostos por fornecedor...");
        const { error: fornecedorErr } = await supabase
          .from("fornecedores_prepostos")
          .upsert(fornecedoresPersistiveis, {
            onConflict: "fornecedor_nome_norm",
          });
        if (fornecedorErr) {
          throw new Error(
            `Falha ao salvar prepostos por fornecedor: ${fornecedorErr.message}`,
          );
        }
        qc.invalidateQueries({ queryKey: ["fornecedores-prepostos-ativos"] });
      }

      console.log("Passo 4: Preparando payload de inserção massiva...");
      updateProgress(40, "Preparando contratos para gravação...");
      const inserts: any[] = [];
      const preliminarPorIndex: ContratoPreliminar[] = [];
      for (const { contrato: c, secretaria } of preliminaresResolvidos) {
        const sec = secretaria!;
        const fornecedorKey = resolveFornecedorKey(c);
        const prepostoContrato =
          prepostosByFornecedor[fornecedorKey]?.trim() ?? "";
        if (!prepostoContrato) {
          throw new Error(
            `Preposto não informado para fornecedor: ${resolveFornecedorNome(c)}`,
          );
        }

        const secKey = `${sec.numero}:${sec.sigla}`;
        const nextNumber = proximoPorSec.get(secKey)?.shift();
        if (!nextNumber) continue;

        const numero = nextNumber.numeroContrato;
        inserts.push({
          numero_contrato: numero,
          secretaria_num: sec.numero,
          secretaria_id: sec.id,
          secretaria_nome: sec.nome,
          secretaria_sigla: sec.sigla,
          preposto: prepostoContrato,
          fiscal: sec.m2a_fiscal_nome ?? "",
          objeto: objetoBatch,
          data: dataBatch,
          link_contrato: jobDetail.job.original_filename,
          status: "ativo",
          import_job_id: jobDetail.job.id,
          dotacao: c.dotacao,
          m2a_ata_id: c.m2aAtaId,
          m2a_ata_numero: c.m2aAtaNumero,
          fornecedor_nome: c.fornecedorNome,
          processo_id: processoIdFinal,
        });
        preliminarPorIndex.push(c);
      }

      // Rastreia o que foi inserido para rollback em caso de falha posterior.
      let contratosInseridosIds: string[] = [];
      const processoCriadoId: string | null = processoCriadoNestaGeracao
        ? processoIdFinal
        : null;

      try {
        console.log(
          `Passo 5: Persistindo ${inserts.length} cabeçalhos de contratos...`,
        );
        updateProgress(50, `Criando ${inserts.length} contrato(s)...`);
        const { data: contratosInseridos, error: insErr } = await supabase
          .from("contratos")
          .insert(inserts)
          .select("id");

        if (insErr) {
          console.error("Falha na inserção massiva de cabeçalhos:", insErr);
          throw insErr;
        }
        contratosInseridosIds = (contratosInseridos ?? []).map(
          (r: any) => r.id,
        );
        console.log("Cabeçalhos criados.");

        // Para cada contrato inserido, criar contrato_itens + contrato_item_dotacoes
        console.log(
          "Passo 6: Gerando itens e dotações subordinadas (sequencial)...",
        );
        for (let i = 0; i < contratosInseridosIds.length; i++) {
          updateProgress(
            55 + ((i + 1) / Math.max(contratosInseridosIds.length, 1)) * 35,
            `Gerando contrato ${i + 1} de ${contratosInseridosIds.length}...`,
          );
          const contratoId = contratosInseridosIds[i];
          const c = preliminarPorIndex[i];
          const m2aNumeroItemById = new Map(
            m2aItens.map((item) => [item.m2a_item_id, item.numero_item]),
          );
          console.log(
            `[Contrato ${i + 1}/${contratosInseridosIds.length}] Gerando itens para ID ${contratoId}...`,
          );

          const itensPayload = c.itens.map((it, idx) => ({
            contrato_id: contratoId,
            ordem_item: it.ordemItem ?? idx + 1,
            numero_item:
              compactNumber(it.numeroItem) ||
              compactNumber(m2aNumeroItemById.get(it.m2aItemId ?? "")) ||
              null,
            lote: it.lote || null,
            descricao: it.descricao,
            especificacao: it.especificacao || null,
            unidade: it.unidade,
            quantidade: it.quantidade,
            valor_unitario: it.valorUnitario,
            valor_total: it.subtotal,
            m2a_item_id: it.m2aItemId,
          }));

          if (itensPayload.length === 0) continue;
          const { data: itensIns, error: itensErr } = await supabase
            .from("contrato_itens")
            .insert(itensPayload)
            .select("id");

          if (itensErr) {
            console.error(
              `Erro nos itens do contrato ${contratoId}:`,
              itensErr,
            );
            throw itensErr;
          }
          const dotPayload = (itensIns ?? []).map((row) => ({
            item_id: row.id,
            secretaria_sigla: c.secretariaSigla,
            dotacao: c.dotacao,
            quantidade_alocada: 0,
          }));
          c.itens.forEach((it, idx) => {
            if (dotPayload[idx])
              dotPayload[idx].quantidade_alocada = it.quantidade;
          });
          const { error: dotErr } = await supabase
            .from("contrato_item_dotacoes")
            .insert(dotPayload);

          if (dotErr) {
            console.error(
              `Erro nas dotações do contrato ${contratoId}:`,
              dotErr,
            );
            throw dotErr;
          }
        }
        console.log("Geração de itens subordinados finalizada.");
      } catch (innerErr) {
        // Rollback: apaga contratos parcialmente inseridos.
        console.error(
          "FALHA CRÍTICA DURANTE PERSISTÊNCIA. Iniciando Rollback manual...",
        );
        if (contratosInseridosIds.length > 0) {
          console.log("[Rollback] Removendo dotações...");
          await supabase
            .from("contrato_item_dotacoes")
            .delete()
            .in(
              "item_id",
              (
                (
                  await supabase
                    .from("contrato_itens")
                    .select("id")
                    .in("contrato_id", contratosInseridosIds)
                ).data ?? []
              ).map((r: any) => r.id),
            );
          console.log("[Rollback] Removendo itens...");
          await supabase
            .from("contrato_itens")
            .delete()
            .in("contrato_id", contratosInseridosIds);
          const rollbackDeletedAt = new Date().toISOString();
          console.log("[Rollback] Ocultando cabeçalhos...");
          await supabase
            .from("contratos")
            .update({ deleted_at: rollbackDeletedAt })
            .in("id", contratosInseridosIds);
        }
        if (processoCriadoId) {
          console.log(
            "[Rollback] Ocultando processo criado. ID:",
            processoCriadoId,
          );
          await supabase
            .from("processos")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", processoCriadoId);
        }
        console.log("[Rollback] Limpeza finalizada.");
        throw innerErr;
      }

      console.log("Passo 7: Finalizando Job de importação...");
      updateProgress(94, "Finalizando lote de contratos...");
      await supabase
        .from("contrato_import_jobs")
        .update({
          status: "autorizado",
          authorized_at: new Date().toISOString(),
        })
        .eq("id", jobDetail.job.id);

      console.log("Passo 8: Registrando auditoria final...");
      await logAudit({
        action: "contrato_import_autorizar",
        entityType: "contrato_import_job",
        entityId: jobDetail.job.id,
        payload: {
          contratos_gerados: inserts.length,
          processo_id: processoIdFinal,
          objeto: objetoBatch,
        },
      });

      notify.success(
        `${inserts.length} contratos gerados${processoIdFinal && !processoId ? " e processo criado" : ""}`,
      );
      finishTask(`${inserts.length} contrato(s) gerado(s) com sucesso.`);
      qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
      qc.invalidateQueries({ queryKey: ["cij-list"] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
      qc.invalidateQueries({ queryKey: ["processos"] });
      qc.invalidateQueries({ queryKey: ["processos-min"] });
      qc.invalidateQueries({ queryKey: ["numeracao"] });
      console.log("Lote processado com sucesso.");
      if (processoIdFinal) {
        navigate({ to: "/processos/$id", params: { id: processoIdFinal } });
      }
    } catch (e: any) {
      console.error("ERRO NO PROCESSO DE GERAÇÃO:", e);
      failTask(e?.message ?? "Falha ao gerar contratos.");
      notify.error("Falha ao gerar contratos (alterações revertidas)", {
        description: e?.message,
      });
    } finally {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      setBusy(false);
    }
  }, [
    jobDetail,
    activeJobId,
    contratosSelecionados,
    contratosSemAtaM2A,
    contratosSemCadastroM2A,
    contratosDesmarcados,
    fornecedoresPrepostoTargets,
    fornecedoresSemPreposto,
    prepostosByFornecedor,
    secretariasM2A,
    m2aItens,
    numeroProcessoBase,
    objetoBatch,
    dataBatch,
    criarProcesso,
    processoId,
    qc,
    navigate,
    startTask,
    updateProgress,
    finishTask,
    failTask,
    setBusy,
  ]);

  return { autorizarGeracao };
}
