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
            contratos: workerSnapshot.contratos_existentes?.length ?? 0,
          },
        );
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
        for (const item of parsed.itens) {
          const match = resolveM2AItemMatch(item, syncedItems);
          itemMatches.set(item.sourceRow, match);
          assignments.set(
            item.sourceRow,
            match?.status === "auto" ? match.item.id_ata : null,
          );
        }
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
        const { data: insertedItens, error: itErr } = await supabase
          .from("contrato_import_itens")
          .insert(itensInsert)
          .select("id, source_row");

        if (itErr) throw itErr;

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
        if (dotInsert.length) {
          updateProgress(90, "Salvando dotações e quantidades...");
          const { error: dErr } = await supabase
            .from("contrato_import_dotacoes")
            .insert(dotInsert);
          if (dErr) throw dErr;
        }

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
