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
 * Autorização/geração de contratos a partir de um job em preview.
 * O processo vinculado (definido no upload) é a fonte de verdade para
 * numeroBase, objeto e data. Não há mais criação de processo aqui.
 */
export function useAutorizarGeracao(options: {
  jobDetail: JobDetail | undefined;
  activeJobId: string | null;
  contratosSelecionados: ContratoPreliminar[];
  contratosSemAtaM2A: ContratoPreliminar[];
  contratosSemCadastroM2A: Array<{
    contrato: ContratoPreliminar;
    secretaria?: SecretariaM2A | null;
  }>;
  contratosDesmarcados: Set<string>;
  fornecedoresPrepostoTargets: FornecedorPrepostoTarget[];
  fornecedoresSemPreposto: FornecedorPrepostoTarget[];
  prepostosByFornecedor: Record<string, string>;
  secretariasM2A: SecretariaM2A[];
  m2aItens: M2AItemRow[];
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
    setBusy,
  } = options;

  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const autorizarGeracao = useCallback(async () => {
    if (!jobDetail) return;
    console.group("M2A: Geração de Contratos em Lote");
    console.time("ProcessoGeracaoLote");

    const processoIdFinal: string | null =
      ((jobDetail.job as any).processo_id as string | null) || null;
    if (!processoIdFinal) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error(
        "Este job não está vinculado a um processo. Reimporte a planilha.",
      );
    }

    // Buscar processo — fonte de verdade para nº base, objeto, data
    const { data: procRow, error: procErr } = await supabase
      .from("processos")
      .select("id, numero_processo, objeto, data_abertura, m2a_url, m2a_processo_id")
      .eq("id", processoIdFinal)
      .is("deleted_at", null)
      .single();
    if (procErr || !procRow) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Falha ao carregar processo vinculado.");
    }

    const numeroBaseContrato = normalizeContratoBase(
      procRow.numero_processo ?? "",
    );
    if (!numeroBaseContrato) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error(
        "Processo sem nº base válido (ex.: 026/2025). Edite-o em /processos.",
      );
    }
    const objetoBatch = procRow.objeto?.trim() ?? "";
    if (!objetoBatch) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Processo sem objeto definido.");
    }
    const dataBatch = procRow.data_abertura;
    if (!dataBatch || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataBatch))) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Processo sem data de abertura definida.");
    }

    if (fornecedoresSemPreposto.length > 0) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Preposto pendente por fornecedor.", {
        description:
          "Preencha o nome do preposto para cada fornecedor listado.",
      });
    }
    if (contratosSelecionados.length === 0) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Nenhum contrato a gerar (todos desmarcados).");
    }
    if (contratosSemAtaM2A.length > 0) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Há contratos sem ata definida.", {
        description:
          "Revise a aba Itens e selecione a ata correta para os itens sem vínculo.",
      });
    }
    if (contratosSemCadastroM2A.length > 0) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Cadastro externo incompleto", {
        description:
          "Complete Unidade Gestora, Órgão da Dotação, UO, Dotação, Fiscal e Gestor em /secretarias.",
      });
    }

    startTask(
      "Gerando contratos",
      `Preparando ${contratosSelecionados.length} contrato(s)...`,
    );
    setBusy(true);
    try {
      updateProgress(18, "Reservando numeração automática...");
      const preliminaresResolvidos = contratosSelecionados.map((contrato) => ({
        contrato,
        secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
      }));

      const planoPorAta = new Map<
        string,
        { ata: string; contratos: number; itens: number }
      >();
      for (const { contrato } of preliminaresResolvidos) {
        const ata = contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "SEM_ATA";
        const atual = planoPorAta.get(ata) ?? { ata, contratos: 0, itens: 0 };
        atual.contratos += 1;
        atual.itens += contrato.itens.length;
        planoPorAta.set(ata, atual);
      }
      console.groupCollapsed(
        `[m2a-geracao] plano: ${preliminaresResolvidos.length} contrato(s), ${preliminaresResolvidos.reduce(
          (total, { contrato }) => total + contrato.itens.length,
          0,
        )} item(ns)`,
      );
      console.table(Array.from(planoPorAta.values()));
      console.groupEnd();

      const semSecretaria = preliminaresResolvidos.filter(
        ({ secretaria }) => !secretaria,
      );
      if (semSecretaria.length > 0) {
        throw new Error(
          "Há contratos sem secretaria correspondente. Confira sigla + dotação no cadastro.",
        );
      }
      const semM2A = preliminaresResolvidos.filter(
        ({ secretaria }) => !hasM2AActors(secretaria),
      );
      if (semM2A.length > 0) {
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

        inserts.push({
          numero_contrato: nextNumber.numeroContrato,
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

      if (inserts.length !== contratosSelecionados.length) {
        throw new Error(
          `Falha ao preparar todos os contratos: ${inserts.length}/${contratosSelecionados.length} preparados.`,
        );
      }

      const expectedItensGerados = preliminarPorIndex.reduce(
        (total, contrato) => total + contrato.itens.length,
        0,
      );
      let totalItensInseridos = 0;

      let contratosInseridosIds: string[] = [];

      try {
        updateProgress(50, `Criando ${inserts.length} contrato(s)...`);
        const { data: contratosInseridos, error: insErr } = await supabase
          .from("contratos")
          .insert(inserts)
          .select("id");
        if (insErr) throw insErr;
        contratosInseridosIds = (contratosInseridos ?? []).map(
          (r: any) => r.id,
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
          const m2aValorById = new Map(
            m2aItens.map((item) => [item.m2a_item_id, Number(item.valor_unitario ?? 0)]),
          );

          const itensPayload = c.itens.map((it, idx) => {
            const fallbackValor = it.m2aItemId
              ? (m2aValorById.get(it.m2aItemId) ?? 0)
              : 0;
            const valorUnitario =
              it.valorUnitario && it.valorUnitario > 0
                ? it.valorUnitario
                : fallbackValor;
            const subtotal =
              it.valorUnitario && it.valorUnitario > 0
                ? it.subtotal
                : it.quantidade * fallbackValor;
            return {
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
              valor_unitario: valorUnitario,
              valor_total: subtotal,
              m2a_item_id: it.m2aItemId,
            };
          });

          if (itensPayload.length === 0) continue;
          const { data: itensIns, error: itensErr } = await supabase
            .from("contrato_itens")
            .insert(itensPayload)
            .select("id");
          if (itensErr) throw itensErr;

          if ((itensIns ?? []).length !== itensPayload.length) {
            throw new Error(
              `Falha ao inserir todos os itens do contrato ${i + 1}: ${(itensIns ?? []).length}/${itensPayload.length}.`,
            );
          }
          totalItensInseridos += itensIns?.length ?? 0;

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
          if (dotErr) throw dotErr;
        }

        if (totalItensInseridos !== expectedItensGerados) {
          throw new Error(
            `Falha de conferência: ${totalItensInseridos}/${expectedItensGerados} item(ns) foram gravados.`,
          );
        }
      } catch (innerErr) {
        console.error("FALHA CRÍTICA. Rollback manual...");
        if (contratosInseridosIds.length > 0) {
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
          await supabase
            .from("contrato_itens")
            .delete()
            .in("contrato_id", contratosInseridosIds);
          await supabase
            .from("contratos")
            .update({ deleted_at: new Date().toISOString() })
            .in("id", contratosInseridosIds);
        }
        throw innerErr;
      }

      updateProgress(94, "Finalizando lote de contratos...");
      await supabase
        .from("contrato_import_jobs")
        .update({
          status: "autorizado",
          authorized_at: new Date().toISOString(),
        })
        .eq("id", jobDetail.job.id);

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

      notify.success(`${inserts.length} contratos gerados`);
      finishTask(`${inserts.length} contrato(s) gerado(s) com sucesso.`);
      qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
      qc.invalidateQueries({ queryKey: ["cij-list"] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
      qc.invalidateQueries({ queryKey: ["processos"] });
      qc.invalidateQueries({ queryKey: ["processos-min"] });
      qc.invalidateQueries({ queryKey: ["numeracao"] });
      navigate({ to: "/processos/$id", params: { id: processoIdFinal } });
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
