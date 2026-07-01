import { useCallback, useState } from "react";
import JSZip from "jszip";
import * as FileSaver from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "@/contexts/ProgressContext";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { gerarPlanilhaSecretaria, type AnaliseIRP } from "@/lib/irp";
import type { AppFile, ResultadoSalvoIRP } from "../lib";

// file-saver interop (default/CJS/ESM)
const saveAs =
  (FileSaver as any).saveAs ??
  (FileSaver as any).default?.saveAs ??
  (FileSaver as any).default;

export interface UseIrpDownloadsOptions {
  analise: AnaliseIRP | null;
  resultadoSalvo: ResultadoSalvoIRP | null;
  jobId: string | null;
}

export interface UseIrpDownloadsResult {
  busy: boolean;
  baixarUm: (index: number) => Promise<void>;
  baixarZip: () => Promise<void>;
  baixarArquivoSalvo: (arquivo?: AppFile | null) => Promise<void>;
}

export function useIrpDownloads({
  analise,
  resultadoSalvo,
  jobId,
}: UseIrpDownloadsOptions): UseIrpDownloadsResult {
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
  const [busy, setBusy] = useState(false);

  const baixarArquivoSalvo = useCallback(
    async (arquivo?: AppFile | null) => {
      if (!arquivo) {
        notify.error("Arquivo nao encontrado no historico.");
        return;
      }
      setBusy(true);
      try {
        const { data, error } = await supabase.storage
          .from(arquivo.bucket)
          .createSignedUrl(arquivo.storage_path, 60);
        if (error || !data) throw error ?? new Error("Falha ao assinar URL.");
        const response = await fetch(data.signedUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ao baixar arquivo.`);
        }
        saveAs(await response.blob(), arquivo.original_name);
      } catch (e: any) {
        notify.error("Falha ao baixar arquivo", { description: e?.message });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const baixarUm = useCallback(
    async (index: number) => {
      if (!analise) return;
      const r = analise.resultados[index];
      if (!r || r.itens.length === 0) return;
      const { filename, blob } = await gerarPlanilhaSecretaria(r);
      saveAs(blob, filename);
    },
    [analise],
  );

  const baixarZip = useCallback(async () => {
    if (resultadoSalvo && !analise) {
      await baixarArquivoSalvo(resultadoSalvo.zipFile);
      return;
    }
    if (!analise) return;
    setBusy(true);
    startTask("Gerando ZIP IRP", "Preparando arquivos por secretaria...");
    try {
      const zip = new JSZip();
      const resultadosComItens = analise.resultados.filter(
        (resultado) => resultado.itens.length > 0,
      );
      for (const [index, r] of resultadosComItens.entries()) {
        if (r.itens.length === 0) continue;
        const { filename, blob } = await gerarPlanilhaSecretaria(r);
        zip.file(filename, await blob.arrayBuffer());
        updateProgress(
          ((index + 1) / resultadosComItens.length) * 90,
          `Gerando arquivo ${index + 1} de ${resultadosComItens.length}...`,
        );
      }
      updateProgress(95, "Compactando arquivos...");
      const out = await zip.generateAsync({ type: "blob" });
      saveAs(out, `IRP_${new Date().toISOString().slice(0, 10)}.zip`);
      if (jobId) {
        await logAudit({
          action: "irp_export_zip",
          entityType: "irp_job",
          entityId: jobId,
        });
      }
      finishTask("Arquivo .zip gerado com sucesso.");
      notify.success("Arquivo .zip gerado");
    } catch (e: any) {
      failTask(e?.message ?? "Falha ao gerar zip IRP.");
      notify.error("Falha ao gerar zip", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }, [
    analise,
    baixarArquivoSalvo,
    failTask,
    finishTask,
    jobId,
    resultadoSalvo,
    startTask,
    updateProgress,
  ]);

  return { busy, baixarUm, baixarZip, baixarArquivoSalvo };
}
