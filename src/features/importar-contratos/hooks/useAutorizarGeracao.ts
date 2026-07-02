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

function traceText(value: unknown, max = 140) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function traceTable(label: string, rows: unknown[], limit = 500) {
  const list = Array.isArray(rows) ? rows : [];
  console.log(`${label}: ${list.length} registro(s)`);
  if (!list.length) return;
  console.table(list.slice(0, limit));
  if (list.length > limit) {
    console.log(`${label}: ${list.length - limit} registro(s) omitidos`);
  }
}

function countBy<T>(rows: T[], getKey: (row: T) => string | null | undefined) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getKey(row) || "NÃO_IDENTIFICADO";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

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
  dataBatchOverride?: string;
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
    dataBatchOverride,
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
    const dataBatch =
      (dataBatchOverride && dataBatchOverride.trim()) ||
      procRow.data_abertura;
    if (!dataBatch || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataBatch))) {
      console.timeEnd("ProcessoGeracaoLote");
      console.groupEnd();
      return notify.error("Informe a data base do lote (formato AAAA-MM-DD).");
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
      console.groupCollapsed("[m2a-geracao] entrada da geração");
      console.log("Job/processo:", {
        activeJobId,
        jobId: jobDetail.job.id,
        processoIdFinal,
        statusJob: jobDetail.job.status,
        numeroBaseContrato,
        dataBatch,
      });
      traceTable(
        "[m2a-geracao] contratos selecionados pela UI",
        contratosSelecionados.map((c) => ({
          key: c.key,
          ata: c.m2aAtaNumero ?? c.m2aAtaId ?? "SEM_ATA",
          m2aAtaId: c.m2aAtaId,
          secretaria: c.secretariaSigla,
          dotacao: c.dotacao,
          fornecedor: traceText(resolveFornecedorNome(c), 70),
          itens: c.itens.length,
          totalValor: c.totalValor,
        })),
      );
      if (contratosDesmarcados.size > 0) {
        console.warn(
          "[m2a-geracao] contratos desmarcados na UI:",
          Array.from(contratosDesmarcados),
        );
      }
      traceTable(
        "[m2a-geracao] itens brutos do job",
        (jobDetail.itens ?? []).map((item: any) => ({
          id: item.id,
          linha: item.source_row,
          lote: item.lote,
          numero_item: item.numero_item,
          ordem_item: item.ordem_item,
          m2a_ata_numero: item.m2a_ata_numero,
          m2a_ata_id: item.m2a_ata_id,
          m2a_item_id: item.m2a_item_id,
          match_status: item.m2a_match_status,
          match_score: item.m2a_match_score,
          excluido: item.excluido,
          valor_unitario: item.valor_unitario,
          empresa: traceText(item.empresa, 50),
          descricao: traceText(item.descricao, 160),
        })),
      );
      traceTable(
        "[m2a-geracao] dotações brutas do job",
        (jobDetail.dotacoes ?? []).map((dot: any) => ({
          item_id: dot.item_id,
          secretaria_sigla: dot.secretaria_sigla,
          dotacao: dot.dotacao,
          ref_coluna: dot.ref_coluna,
          quantidade: dot.quantidade,
          ignorado: dot.ignorado,
        })),
      );
      console.groupEnd();

      updateProgress(18, "Reservando numeração automática...");
      const preliminaresResolvidos = contratosSelecionados
        .map((contrato) => ({
          contrato,
          secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
        }))
        // Ordena por secretaria → ata → fornecedor para que a numeração
        // reservada em lote seja atribuída de forma agrupada (todos os
        // contratos de um fornecedor recebem números consecutivos antes
        // do próximo fornecedor da mesma secretaria).
        .sort((a, b) => {
          const secA = a.secretaria?.sigla ?? a.contrato.secretariaSigla ?? "";
          const secB = b.secretaria?.sigla ?? b.contrato.secretariaSigla ?? "";
          if (secA !== secB) return secA.localeCompare(secB);
          const ataA = a.contrato.m2aAtaNumero ?? a.contrato.m2aAtaId ?? "";
          const ataB = b.contrato.m2aAtaNumero ?? b.contrato.m2aAtaId ?? "";
          if (ataA !== ataB) return ataA.localeCompare(ataB);
          const fornA = resolveFornecedorNome(a.contrato) ?? "";
          const fornB = resolveFornecedorNome(b.contrato) ?? "";
          if (fornA !== fornB) return fornA.localeCompare(fornB);
          return (a.contrato.key ?? "").localeCompare(b.contrato.key ?? "");
        });

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
      traceTable(
        "[m2a-geracao] itens que serão distribuídos por contrato",
        preliminaresResolvidos.flatMap(({ contrato }) =>
          contrato.itens.map((item) => ({
            contratoKey: contrato.key,
            ata: contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "SEM_ATA",
            m2aAtaId: contrato.m2aAtaId,
            secretaria: contrato.secretariaSigla,
            dotacao: contrato.dotacao,
            fornecedor: traceText(resolveFornecedorNome(contrato), 70),
            itemId: item.itemId,
            m2aItemId: item.m2aItemId,
            ordemItem: item.ordemItem,
            numeroItem: item.numeroItem,
            lote: item.lote,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            subtotal: item.subtotal,
            descricao: traceText(item.descricao, 160),
          })),
        ),
      );
      console.log(
        "[m2a-geracao] itens por ata/secretaria:",
        countBy(
          preliminaresResolvidos.flatMap(({ contrato }) =>
            contrato.itens.map((item) => ({ contrato, item })),
          ),
          ({ contrato }) => `${contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "SEM_ATA"} / ${contrato.secretariaSigla}`,
        ),
      );
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

      traceTable(
        "[m2a-geracao] payload contratos antes do insert",
        inserts.map((row, index) => ({
          index,
          numero_contrato: row.numero_contrato,
          secretaria_sigla: row.secretaria_sigla,
          secretaria_num: row.secretaria_num,
          dotacao: row.dotacao,
          m2a_ata_numero: row.m2a_ata_numero,
          m2a_ata_id: row.m2a_ata_id,
          fornecedor_nome: traceText(row.fornecedor_nome, 70),
          itens_previstos: preliminarPorIndex[index]?.itens.length ?? 0,
          data: row.data,
        })),
      );

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

          console.groupCollapsed(
            `[m2a-geracao] contrato ${i + 1}/${contratosInseridosIds.length} ${inserts[i]?.numero_contrato} → ${itensPayload.length} item(ns)`,
          );
          console.log("Contrato origem:", {
            contratoId,
            contratoKey: c.key,
            ata: c.m2aAtaNumero ?? c.m2aAtaId,
            m2aAtaId: c.m2aAtaId,
            secretaria: c.secretariaSigla,
            dotacao: c.dotacao,
            fornecedor: resolveFornecedorNome(c),
          });
          traceTable(
            "[m2a-geracao] contrato_itens payload",
            itensPayload.map((item) => ({
              ordem_item: item.ordem_item,
              numero_item: item.numero_item,
              lote: item.lote,
              quantidade: item.quantidade,
              valor_unitario: item.valor_unitario,
              valor_total: item.valor_total,
              m2a_item_id: item.m2a_item_id,
              descricao: traceText(item.descricao, 160),
            })),
          );

          if (itensPayload.length === 0) {
            console.warn("[m2a-geracao] contrato sem itensPayload; pulando insert", {
              contratoId,
              contratoKey: c.key,
            });
            console.groupEnd();
            continue;
          }
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
          console.log("[m2a-geracao] contrato_itens inseridos:", itensIns?.length ?? 0);

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
          traceTable("[m2a-geracao] contrato_item_dotacoes payload", dotPayload);
          console.groupEnd();
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
    dataBatchOverride,
  ]);

  return { autorizarGeracao };
}
