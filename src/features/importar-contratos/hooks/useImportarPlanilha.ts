import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useProgress } from "@/contexts/ProgressContext";
import {
  extractM2AProcessoId,
  fetchProcessoFromWorker,
  persistM2ASnapshot,
} from "@/lib/m2a";
import {
  readWorkbook,
  parseContratoXlsx,
  type AllowedRefs,
} from "@/lib/contratoImport";
import { logAudit } from "@/lib/audit";
import {
  compactNumber,
  countPreviewContractsWithAta,
  resolveM2AItemMatch,
  type SecretariaM2A,
  type SyncedAtaItem,
} from "../lib";

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

export type ImportSubmitPayload =
  | {
      mode: "existing";
      file: File;
      processoId: string;
    }
  | {
      mode: "new";
      file: File;
      novo: {
        codigoM2A: string;
        numeroProcesso: string;
        objeto: string;
        dataAbertura: string;
      };
    };

/**
 * Orquestra o fluxo completo de análise/importação de uma planilha:
 *   1. Mapeia refs autorizadas do cadastro
 *   2. Lê e faz parse do XLSX
 *   3. Cria (modo novo) ou reaproveita (modo existente) processo local
 *   4. Sincroniza snapshot M2A via worker
 *      - Novo: sincronização completa
 *      - Existente: incremental — pula se não houve mudança de atas/contratos
 *   5. Faz match item↔ata e persiste job/itens/dotações
 *   6. Registra auditoria
 */
export function useImportarPlanilha(options: {
  secretarias: SecretariaM2A[];
  setActiveJobId: (id: string | null) => void;
  onImportDone: () => void;
}) {
  const { secretarias, setActiveJobId, onImportDone } = options;
  const qc = useQueryClient();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const [busy, setBusy] = useState(false);

  const handleImportar = useCallback(
    async (payload: ImportSubmitPayload | null) => {
      if (!payload) return;
      const { file, mode } = payload;
      if (!file) return;

      // Resolve identidade M2A conforme o modo
      let m2aProcessoId: string | null = null;
      let m2aUrl = "";
      let processoImportId: string | null = null;
      let processoCriado = false;

      console.group("M2A: Iniciando Importação de Planilha");
      console.time("TempoTotalImportacao");
      console.log("Arquivo selecionado:", file.name, `(${file.size} bytes)`);
      console.log("Modo:", mode);

      const allowedRefs: AllowedRefs = new Map();
      for (const s of (secretarias ?? []) as any[]) {
        if (s.m2a_ref_coluna && s.m2a_dotacao_default) {
          allowedRefs.set(Number(s.m2a_ref_coluna), {
            sigla: s.sigla,
            dotacao: s.m2a_dotacao_default,
          });
        }
      }
      if (allowedRefs.size === 0) {
        console.timeEnd("TempoTotalImportacao");
        console.groupEnd();
        return notify.error(
          "Nenhuma secretaria cadastrada com ref. coluna + dotação. Cadastre em /secretarias antes de importar.",
        );
      }

      startTask("Analisando planilha", "Preparando leitura do arquivo...");
      setBusy(true);
      try {
        // ── Modo existente ──────────────────────────────────────────────
        if (mode === "existing") {
          const { data: proc, error: procErr } = await supabase
            .from("processos")
            .select("id, numero_processo, objeto, m2a_url, m2a_processo_id")
            .eq("id", payload.processoId)
            .is("deleted_at", null)
            .single();
          if (procErr) throw procErr;
          if (!proc?.m2a_processo_id) {
            throw new Error(
              "Processo selecionado não tem código M2A. Edite-o em /processos.",
            );
          }
          processoImportId = proc.id;
          m2aProcessoId = proc.m2a_processo_id;
          m2aUrl =
            proc.m2a_url ??
            `http://precodereferencia.m2atecnologia.com.br/processo_administrativo/${proc.m2a_processo_id}/`;
        } else {
          // ── Modo novo ─────────────────────────────────────────────────
          const rawCodigo = payload.novo.codigoM2A.trim();
          m2aProcessoId =
            extractM2AProcessoId(rawCodigo) ||
            (/^\d+$/.test(rawCodigo) ? rawCodigo : null);
          if (!m2aProcessoId) {
            throw new Error("Código do processo M2A inválido.");
          }
          m2aUrl = `http://precodereferencia.m2atecnologia.com.br/processo_administrativo/${m2aProcessoId}/`;

          // Se já existe um processo local com esse código, reutiliza (evita duplicata).
          const { data: existente, error: lookupErr } = await supabase
            .from("processos")
            .select("id")
            .eq("m2a_processo_id", m2aProcessoId)
            .is("deleted_at", null)
            .maybeSingle();
          if (lookupErr) throw lookupErr;
          if (existente?.id) {
            processoImportId = existente.id;
            await supabase
              .from("processos")
              .update({
                numero_processo: payload.novo.numeroProcesso,
                objeto: payload.novo.objeto,
                data_abertura: payload.novo.dataAbertura,
                m2a_url: m2aUrl,
                m2a_processo_id: m2aProcessoId,
              })
              .eq("id", existente.id);
          } else {
            const { data: novoProc, error: novoErr } = await supabase
              .from("processos")
              .insert({
                numero_processo: payload.novo.numeroProcesso,
                objeto: payload.novo.objeto,
                data_abertura: payload.novo.dataAbertura,
                status: "em_andamento",
                m2a_url: m2aUrl,
                m2a_processo_id: m2aProcessoId,
              })
              .select("id")
              .single();
            if (novoErr) throw novoErr;
            processoImportId = novoProc.id;
            processoCriado = true;
          }
        }

        updateProgress(8, "Lendo arquivo da planilha...");
        const matrix = await readWorkbook(file);

        updateProgress(18, "Extraindo itens, dotações e fornecedores...");
        const parsed = parseContratoXlsx(matrix, allowedRefs);
        console.groupCollapsed(
          `[m2a-import] planilha lida (${parsed.itens.length} item(ns), ${parsed.colunasDotacao.length} coluna(s) de dotação)`,
        );
        console.log("Cabeçalho/refs:", {
          linhaCabecalho: parsed.linhaCabecalho,
          empresa: parsed.empresa,
          refsIgnoradas: parsed.refsIgnoradas,
          colunasDotacao: parsed.colunasDotacao,
          totalContratosPrevistosSemAta: parsed.totalContratosPrevistos,
          totalValor: parsed.totalValor,
        });
        traceTable(
          "[m2a-import] itens extraídos da planilha",
          parsed.itens.map((item) => ({
            linha: item.sourceRow,
            lote: item.lote,
            numeroItem: item.numeroItem,
            ordemItem: item.ordemItem,
            empresa: traceText(item.empresa, 50),
            unidade: item.unidade,
            valorUnitario: item.valorUnitario,
            dotacoes: item.dotacoes
              .map((d) => `${d.secretariaSigla}/${d.dotacao}: ${d.quantidade}`)
              .join(" | "),
            descricao: traceText(item.descricao, 180),
          })),
        );
        console.log("[m2a-import] itens por lote na planilha:", countBy(parsed.itens, (i) => i.lote || "SEM_LOTE"));
        console.groupEnd();

        if (parsed.refsIgnoradas.length > 0) {
          notify.warning(
            `Aviso: ${parsed.refsIgnoradas.length} coluna(s) da planilha foram ignoradas — secretarias não encontradas no cadastro.`,
            {
              description: `Colunas ignoradas: ${parsed.refsIgnoradas.join(",")}`,
              duration: 8000,
            },
          );
        }

        // ── Sincronização com o portal ────────────────────────────────
        updateProgress(48, "Sincronizando atas e itens no portal...");
        notify.loading("Varrendo atas e itens do processo no portal...", {
          id: "m2a-import-sync",
        });
        console.groupCollapsed("[m2a-import] worker/VPS");
        const syncT0 = performance.now();
        const workerSnapshot = await fetchProcessoFromWorker(m2aUrl);
        console.log(
          `[m2a-import] ✓ worker respondeu em ${(performance.now() - syncT0).toFixed(0)}ms`,
          {
            atas: workerSnapshot.atas?.length ?? 0,
            itens: workerSnapshot.itens?.length ?? 0,
            itens_mestre: (workerSnapshot as any).itens_mestre?.length ?? 0,
            contratos: workerSnapshot.contratos_existentes?.length ?? 0,
            resumo: workerSnapshot.resumo,
          },
        );
        console.groupCollapsed("[m2a-import] snapshot detalhado vindo do VPS");
        traceTable(
          "[m2a-import] atas no snapshot",
          (workerSnapshot.atas ?? []).map((ata: any) => ({
            id_ata: ata.id_ata,
            id_lic: ata.id_licitacao_ata_contrato,
            numero_ata: ata.numero_ata,
            situacao: ata.situacao,
            cancelada: ata.cancelada,
            fornecedor: traceText(ata.fornecedor?.nome, 70),
          })),
        );
        traceTable(
          "[m2a-import] tabela mestra vinda do VPS",
          ((workerSnapshot as any).itens_mestre ?? []).map((item: any) => ({
            ordem: item.ordem,
            lote: item.lote,
            id_item_mestre: item.id_item_mestre,
            unidade: item.unidade,
            qtd_total: item.quantidade_total,
            valor_unitario: item.valor_unitario,
            descricao: traceText(item.descricao, 180),
          })),
        );
        traceTable(
          "[m2a-import] itens vinculados finais vindos do VPS",
          (workerSnapshot.itens ?? []).map((item: any) => ({
            id_item: item.id_item,
            numero_item: item.numero_item,
            id_ata: item.id_ata,
            valor_unitario: item.valor_unitario,
            unidade: item.unidade,
            descricao: traceText(item.descricao, 180),
          })),
        );
        if (Array.isArray(workerSnapshot.trace) && workerSnapshot.trace.length > 0) {
          traceTable(
            "[m2a-import] trace resumido do VPS",
            workerSnapshot.trace.map((step: any) => ({
              seq: step.seq,
              fase: step.fase,
              label: step.label,
              id_ata: step.id_ata,
              numero_ata: step.numero_ata,
              status: step.status,
              encontrados: JSON.stringify(step.encontrados ?? {}),
              erro: traceText(step.erro, 120),
            })),
          );
          const finalStep = [...workerSnapshot.trace]
            .reverse()
            .find((step: any) => step?.fase === "fim" && step?.diagnostico);
          const diagnostico = (finalStep as any)?.diagnostico;
          if (diagnostico) {
            console.groupCollapsed("[m2a-import] diagnóstico final do VPS");
            traceTable("distribuição por ata", diagnostico.distribuicao_por_ata ?? []);
            traceTable("itens da mestra sem vínculo", diagnostico.itens_sem_vinculo ?? []);
            traceTable("itens em múltiplas atas", diagnostico.itens_com_multiplas_atas ?? []);
            traceTable("payload final de itens", diagnostico.itens_payload ?? []);
            console.groupEnd();
          }
        }
        console.groupEnd();
        await persistM2ASnapshot(processoImportId!, workerSnapshot, {
          expectedM2aProcessoId: m2aProcessoId,
        });
        console.groupEnd();
        notify.success(
          `Base externa sincronizada: ${workerSnapshot.atas.length} ata(s), ${workerSnapshot.itens.length} item(ns).`,
          { id: "m2a-import-sync" },
        );

        const snapshot = workerSnapshot;
        const ataById = new Map(snapshot.atas.map((ata) => [ata.id_ata, ata]));
        const syncedItems: SyncedAtaItem[] = snapshot.itens.map((item) => ({
          ...item,
          ata: ataById.get(item.id_ata),
        }));
        const assignments = new Map<number, string | null>();
        const itemMatches = new Map<
          number,
          ReturnType<typeof resolveM2AItemMatch>
        >();
        updateProgress(66, "Relacionando itens com a base do portal...");
        console.groupCollapsed(
          `[m2a-import] matching (${parsed.itens.length} itens da planilha × ${syncedItems.length} itens do portal)`,
        );
        const matchStats = {
          auto: 0,
          ambigua: 0,
          sem_match: 0,
          por_ata: {} as Record<string, number>,
        };
        const matchDetalhe: any[] = [];
        const semMatchDetalhe: any[] = [];
        for (const item of parsed.itens) {
          let debugInfo: any = null;
          const match = resolveM2AItemMatch(
            { ...item, lote: item.lote },
            syncedItems,
            (d) => {
              debugInfo = d;
            },
          );
          itemMatches.set(item.sourceRow, match);
          assignments.set(
            item.sourceRow,
            match?.status === "auto" ? match.item.id_ata : null,
          );
          const status = match?.status ?? "sem_match";
          matchStats[status] = (matchStats[status] ?? 0) + 1;
          if (match?.status === "auto") {
            const ataNum = match.item.ata?.numero_ata ?? match.item.id_ata;
            matchStats.por_ata[ataNum] = (matchStats.por_ata[ataNum] ?? 0) + 1;
          }
          matchDetalhe.push({
            linha: item.sourceRow,
            lote: item.lote,
            numeroItem: item.numeroItem,
            ordemItem: item.ordemItem,
            status,
            score: match?.score ?? 0,
            ata: match?.item.ata?.numero_ata ?? match?.item.id_ata ?? null,
            idAta: match?.item.id_ata ?? null,
            idItemPortal: match?.item.id_item ?? null,
            fornecedorAta: traceText(match?.item.ata?.fornecedor?.nome, 50),
            empresa: traceText(item.empresa, 50),
            top1: debugInfo?.topScored?.[0]
              ? `${debugInfo.topScored[0].score} ${debugInfo.topScored[0].ataId} ${debugInfo.topScored[0].reasons?.join("+")}`
              : "",
            descricaoPlanilha: traceText(item.descricao, 160),
            descricaoPortal: traceText(match?.item.descricao, 160),
          });
          if (!match || match.status !== "auto") {
            semMatchDetalhe.push({
              linha: item.sourceRow,
              lote: item.lote,
              numeroItem: item.numeroItem,
              ordemItem: item.ordemItem,
              empresa: item.empresa,
              descricao: (item.descricao ?? "").slice(0, 60),
              debug: debugInfo,
            });
          }
        }
        console.log("[m2a-import] resumo do match:", matchStats);
        traceTable("[m2a-import] distribuição item→ata (todos os itens)", matchDetalhe);
        console.log("[m2a-import] match por lote:", countBy(matchDetalhe, (i) => `${i.lote || "SEM_LOTE"} / ${i.status}`));
        if (semMatchDetalhe.length > 0) {
          console.warn(
            `[m2a-import] ⚠ ${semMatchDetalhe.length} item(ns) da planilha SEM match automático:`,
          );
          console.table(
            semMatchDetalhe.map((d) => ({
              linha: d.linha,
              lote: d.lote,
              nº: d.numeroItem,
              ordem: d.ordemItem,
              empresa: (d.empresa ?? "").slice(0, 30),
              descricao: d.descricao,
              numCand: d.debug?.numberMatchesCount ?? 0,
              descCand: d.debug?.descMatchesCount ?? 0,
              pool: d.debug?.poolSize ?? 0,
            })),
          );
          for (const d of semMatchDetalhe) {
            console.log(
              `  → linha ${d.linha} [${d.lote}] "${d.descricao}"`,
              d.debug,
            );
          }
        }
        console.groupEnd();

        const totalContratosComAta = countPreviewContractsWithAta(
          parsed.itens,
          assignments,
        );

        updateProgress(78, "Salvando prévia de importação...");
        const { data: jobRow, error: jobErr } = await supabase
          .from("contrato_import_jobs")
          .insert({
            original_filename: file.name,
            status: "preview",
            processo_id: processoImportId,
            m2a_url: m2aUrl,
            m2a_processo_id: m2aProcessoId,
            m2a_sync_at: new Date().toISOString(),
            empresa: parsed.empresa,
            linha_cabecalho: parsed.linhaCabecalho,
            total_itens: parsed.itens.length,
            total_contratos_previstos: totalContratosComAta,
            total_valor: parsed.totalValor,
          })
          .select()
          .single();

        if (jobErr) throw jobErr;

        const itensInsert = parsed.itens.map((i) => ({
          ...(() => {
            const match = itemMatches.get(i.sourceRow);
            const canApplyMatch = match?.status === "auto";
            const ata = canApplyMatch ? match?.item.ata : null;
            return {
              m2a_ata_id: canApplyMatch ? (match?.item.id_ata ?? null) : null,
              m2a_item_id: canApplyMatch ? (match?.item.id_item ?? null) : null,
              m2a_ata_numero: ata?.numero_ata ?? null,
              m2a_fornecedor_nome: ata?.fornecedor?.nome ?? null,
              m2a_fornecedor_cnpj: ata?.fornecedor?.cnpj ?? null,
              m2a_match_status: match?.status ?? "sem_match",
              m2a_match_score: match?.score ?? 0,
            };
          })(),
          job_id: jobRow.id,
          source_row: i.sourceRow,
          empresa: i.empresa,
          lote: i.lote,
          numero_item:
            compactNumber(i.numeroItem) ||
            compactNumber(itemMatches.get(i.sourceRow)?.item.numero_item) ||
            null,
          ordem_item: i.ordemItem,
          descricao: i.descricao,
          especificacao: i.especificacao,
          unidade: i.unidade,
          valor_unitario:
            i.valorUnitario && i.valorUnitario > 0
              ? i.valorUnitario
              : (Number(itemMatches.get(i.sourceRow)?.item.valor_unitario ?? 0) || 0),
        }));
        console.groupCollapsed("[m2a-import] gravação da prévia no banco");
        traceTable(
          "[m2a-import] contrato_import_itens payload",
          itensInsert.map((item) => ({
            linha: item.source_row,
            lote: item.lote,
            numero_item: item.numero_item,
            ordem_item: item.ordem_item,
            m2a_ata_numero: item.m2a_ata_numero,
            m2a_ata_id: item.m2a_ata_id,
            m2a_item_id: item.m2a_item_id,
            m2a_match_status: item.m2a_match_status,
            m2a_match_score: item.m2a_match_score,
            valor_unitario: item.valor_unitario,
            empresa: traceText(item.empresa, 50),
            descricao: traceText(item.descricao, 160),
          })),
        );
        const { data: insertedItens, error: itErr } = await supabase
          .from("contrato_import_itens")
          .insert(itensInsert)
          .select("id, source_row");

        if (itErr) throw itErr;
        console.log("[m2a-import] itens inseridos:", insertedItens?.length ?? 0);

        const rowToId = new Map(insertedItens.map((r) => [r.source_row, r.id]));
        const dotInsert = parsed.itens.flatMap((i) =>
          i.dotacoes.map((d) => ({
            job_id: jobRow.id,
            item_id: rowToId.get(i.sourceRow)!,
            secretaria_sigla: d.secretariaSigla,
            dotacao: d.dotacao,
            ref_coluna: d.refColuna,
            quantidade: d.quantidade,
          })),
        );
        traceTable(
          "[m2a-import] contrato_import_dotacoes payload",
          dotInsert.map((dot) => ({
            item_id: dot.item_id,
            secretaria_sigla: dot.secretaria_sigla,
            dotacao: dot.dotacao,
            ref_coluna: dot.ref_coluna,
            quantidade: dot.quantidade,
          })),
        );
        if (dotInsert.length) {
          updateProgress(90, "Salvando dotações e quantidades...");
          const { error: dErr } = await supabase
            .from("contrato_import_dotacoes")
            .insert(dotInsert);
          if (dErr) throw dErr;
        }
        console.log("[m2a-import] dotações inseridas:", dotInsert.length);
        console.groupEnd();

        await logAudit({
          action: "contrato_import",
          entityType: "contrato_import_job",
          entityId: jobRow.id,
          payload: {
            filename: file.name,
            itens: parsed.itens.length,
            contratos: totalContratosComAta,
            processo_id: processoImportId,
            m2a_processo_id: m2aProcessoId,
            processo_criado: processoCriado,
          },
        });

        notify.success(
          `Planilha importada — ${parsed.itens.length} itens, ${totalContratosComAta} contratos previstos`,
        );
        finishTask("Planilha analisada com sucesso.");
        setActiveJobId(jobRow.id);
        onImportDone();
        qc.invalidateQueries({ queryKey: ["cij-list"] });
        qc.invalidateQueries({ queryKey: ["processos-min"] });
      } catch (e: any) {
        console.error("ERRO CRÍTICO NA IMPORTAÇÃO:", e);
        failTask(e?.message ?? "Falha ao importar planilha.");
        notify.error("Falha ao importar planilha", { description: e?.message });
      } finally {
        console.timeEnd("TempoTotalImportacao");
        console.groupEnd();
        setBusy(false);
      }
    },
    [
      secretarias,
      startTask,
      updateProgress,
      finishTask,
      failTask,
      qc,
      setActiveJobId,
      onImportDone,
    ],
  );

  return { busy, setBusy, handleImportar };
}
