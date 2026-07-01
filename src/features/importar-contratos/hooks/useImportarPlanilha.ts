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

/**
 * Orquestra o fluxo completo de análise/importação de uma planilha:
 *   1. Mapeia refs autorizadas do cadastro
 *   2. Lê e faz parse do XLSX
 *   3. Cria/reaproveita processo local
 *   4. Sincroniza snapshot M2A via worker
 *   5. Faz match item↔ata e persiste job/itens/dotações
 *   6. Registra auditoria
 *
 * Toda a telemetria original (console.group, console.time, console.table) e
 * IDs de notificação (`m2a-import-sync`) são preservados.
 */
export function useImportarPlanilha(options: {
  secretarias: SecretariaM2A[];
  setActiveJobId: (id: string | null) => void;
  setFile: (file: File | null) => void;
  setM2aProcessoUrl: (url: string) => void;
}) {
  const { secretarias, setActiveJobId, setFile, setM2aProcessoUrl } = options;
  const qc = useQueryClient();
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const [busy, setBusy] = useState(false);

  const handleImportar = useCallback(
    async (file: File | null, m2aProcessoUrl: string) => {
      if (!file) return;
      const m2aUrl = m2aProcessoUrl.trim();
      const m2aProcessoId = extractM2AProcessoId(m2aUrl);
      if (!m2aProcessoId) {
        return notify.error("Informe o link válido do processo no portal.");
      }

      console.group("M2A: Iniciando Importação de Planilha");
      console.time("TempoTotalImportacao");
      console.log("Arquivo selecionado:", file.name, `(${file.size} bytes)`);
      console.log("Processo M2A:", { m2aUrl, m2aProcessoId });

      const allowedRefs: AllowedRefs = new Map();
      console.log("Passo 0: Mapeando secretarias autorizadas do banco...");
      for (const s of (secretarias ?? []) as any[]) {
        if (s.m2a_ref_coluna && s.m2a_dotacao_default) {
          allowedRefs.set(Number(s.m2a_ref_coluna), {
            sigla: s.sigla,
            dotacao: s.m2a_dotacao_default,
          });
        }
      }

      if (allowedRefs.size === 0) {
        console.warn(
          "Abortando: Nenhuma secretaria configurada com ref_coluna e dotação default.",
        );
        console.timeEnd("TempoTotalImportacao");
        console.groupEnd();
        return notify.error(
          "Nenhuma secretaria cadastrada com ref. coluna + dotação. Cadastre em /secretarias antes de importar.",
        );
      }
      console.log(`Secretarias aptas encontradas: ${allowedRefs.size}`);

      startTask("Analisando planilha", "Preparando leitura do arquivo...");
      setBusy(true);
      try {
        updateProgress(8, "Lendo arquivo da planilha...");
        console.log(
          "Passo 1: Lendo arquivo binário e convertendo para matriz...",
        );
        const matrix = await readWorkbook(file);
        console.log(`Leitura concluída: ${matrix.length} linhas detectadas.`);

        updateProgress(18, "Extraindo itens, dotações e fornecedores...");
        console.log(
          "Passo 2: Executando extração de dados (Regras de Negócio)...",
        );
        const parsed = parseContratoXlsx(matrix, allowedRefs);
        console.log("Resultado do Parse:", parsed);

        if (parsed.refsIgnoradas.length > 0) {
          console.warn(
            "Colunas ignoradas por falta de vínculo no cadastro:",
            parsed.refsIgnoradas,
          );
          notify.warning(
            `Aviso: ${parsed.refsIgnoradas.length} coluna(s) da planilha foram ignoradas pois as secretarias/unidades não foram encontradas no cadastro.`,
            {
              description: `Colunas ignoradas: ${parsed.refsIgnoradas.join(",")}`,
              duration: 8000,
            },
          );
        }

        updateProgress(32, "Criando ou vinculando processo local...");
        console.log("Passo 3: Criando/reaproveitando processo local...");
        const { data: processoExistente, error: procLookupErr } = await supabase
          .from("processos")
          .select("id, numero_processo, objeto")
          .eq("m2a_processo_id", m2aProcessoId)
          .is("deleted_at", null)
          .maybeSingle();
        if (procLookupErr) throw procLookupErr;

        let processoImportId = processoExistente?.id ?? null;
        if (!processoImportId) {
          const { data: novoProc, error: novoProcErr } = await supabase
            .from("processos")
            .insert({
              numero_processo: null,
              objeto: `Importação de contratos - ${file.name}`,
              status: "em_andamento",
              m2a_url: m2aUrl,
              m2a_processo_id: m2aProcessoId,
            })
            .select("id")
            .single();
          if (novoProcErr) throw novoProcErr;
          processoImportId = novoProc.id;
        } else {
          await supabase
            .from("processos")
            .update({ m2a_url: m2aUrl, m2a_processo_id: m2aProcessoId })
            .eq("id", processoImportId);
        }
        updateProgress(48, "Sincronizando atas e itens no portal...");
        console.log("Passo 4: Sincronizando atas/itens/contratos no portal...");
        notify.loading("Varrendo atas e itens do processo no portal...", {
          id: "m2a-import-sync",
        });
        const snapshot = await (async () => {
          const syncT0 = performance.now();
          console.groupCollapsed("[m2a-import] Passo 4 — worker/VPS");
          try {
            console.log("[m2a-import] → fetchProcessoFromWorker", {
              m2aUrl,
              m2aProcessoId,
            });
            const workerSnapshot = await fetchProcessoFromWorker(m2aUrl);
            console.log(
              `[m2a-import] ✓ worker respondeu em ${(performance.now() - syncT0).toFixed(0)}ms`,
              {
                atas: workerSnapshot.atas?.length ?? 0,
                itens: workerSnapshot.itens?.length ?? 0,
                contratos: workerSnapshot.contratos_existentes?.length ?? 0,
                resumo: workerSnapshot.resumo,
              },
            );
            console.log("[m2a-import] → persistM2ASnapshot");
            await persistM2ASnapshot(processoImportId, workerSnapshot, {
              expectedM2aProcessoId: m2aProcessoId,
            });
            console.log(
              `[m2a-import] ✓ Passo 4 concluído em ${(performance.now() - syncT0).toFixed(0)}ms`,
            );
            return workerSnapshot;
          } finally {
            console.groupEnd();
          }
        })();
        notify.success(
          `Base externa sincronizada: ${snapshot.atas.length} ata(s), ${snapshot.itens.length} item(ns).`,
          { id: "m2a-import-sync" },
        );

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
        updateProgress(
          66,
          "Relacionando itens da planilha com a base do portal...",
        );
        for (const item of parsed.itens) {
          const match = resolveM2AItemMatch(item, syncedItems);
          itemMatches.set(item.sourceRow, match);
          assignments.set(
            item.sourceRow,
            match?.status === "auto" ? match.item.id_ata : null,
          );
        }
        console.groupCollapsed(
          "[Importacao] Diagnostico do match item x ata",
        );
        console.table(
          parsed.itens.map((item) => {
            const match = itemMatches.get(item.sourceRow);
            return {
              linha: item.sourceRow,
              numero_item: item.numeroItem || item.ordemItem || "",
              empresa: item.empresa,
              descricao: item.descricao,
              status: match?.status ?? "sem_match",
              score: match?.score ?? 0,
              ata_id: match?.item.id_ata ?? "",
              ata_numero: match?.item.ata?.numero_ata ?? "",
              fornecedor_ata: match?.item.ata?.fornecedor?.nome ?? "",
              item_m2a: match?.item.numero_item ?? "",
            };
          }),
        );
        console.groupEnd();
        const totalContratosComAta = countPreviewContractsWithAta(
          parsed.itens,
          assignments,
        );

        updateProgress(78, "Salvando prévia de importação...");
        console.log("Passo 5: Persistindo JOB de importação no Supabase...");
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

        if (jobErr) {
          console.error("Falha ao criar contrato_import_jobs:", jobErr);
          throw jobErr;
        }
        console.log("Job criado. ID:", jobRow.id);

        console.log(
          `Passo 6: Inserindo ${parsed.itens.length} itens para revisão...`,
        );
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
          valor_unitario: i.valorUnitario,
        }));
        const { data: insertedItens, error: itErr } = await supabase
          .from("contrato_import_itens")
          .insert(itensInsert)
          .select("id, source_row");

        if (itErr) {
          console.error("Falha ao inserir itens preliminares:", itErr);
          throw itErr;
        }
        console.log("Itens inseridos.");

        console.log("Passo 7: Vinculando dotações e quantidades aos itens...");
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
          console.log(`Inserindo ${dotInsert.length} dotações...`);
          const { error: dErr } = await supabase
            .from("contrato_import_dotacoes")
            .insert(dotInsert);
          if (dErr) {
            console.error("Falha ao inserir dotações:", dErr);
            throw dErr;
          }
          console.log("Dotações inseridas.");
        }

        console.log("Passo 8: Registrando log de auditoria...");
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
          },
        });

        notify.success(
          `Planilha importada — ${parsed.itens.length} itens, ${totalContratosComAta} contratos previstos`,
        );
        finishTask("Planilha analisada com sucesso.");
        setActiveJobId(jobRow.id);
        setFile(null);
        setM2aProcessoUrl("");
        qc.invalidateQueries({ queryKey: ["cij-list"] });
        console.log("Fluxo de importação finalizado.");
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
      setFile,
      setM2aProcessoUrl,
    ],
  );

  return { busy, setBusy, handleImportar };
}
