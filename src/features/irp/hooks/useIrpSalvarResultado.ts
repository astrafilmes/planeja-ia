import { useCallback } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "@/contexts/ProgressContext";
import { gerarPlanilhaSecretaria, type AnaliseIRP } from "@/lib/irp";
import { uploadIrpFile, XLSX_MIME, ZIP_MIME } from "../lib";

export interface UseIrpSalvarResultadoResult {
  persistirArquivosResultado: (
    jobId: string,
    arquivoOriginal: File,
    resultado: AnaliseIRP,
  ) => Promise<void>;
}

/**
 * Faz upload do XLSX original, gera cada planilha por secretaria,
 * empacota em .zip e marca o job como `completed`.
 */
export function useIrpSalvarResultado(): UseIrpSalvarResultadoResult {
  const { updateProgress } = useProgress();

  const persistirArquivosResultado = useCallback(
    async (jobId: string, arquivoOriginal: File, resultado: AnaliseIRP) => {
      updateProgress(76, "Salvando arquivo original...");
      const uploadFile = await uploadIrpFile({
        jobId,
        folder: "upload",
        filename: arquivoOriginal.name,
        blob: arquivoOriginal,
        fileKind: "irp_upload",
        mimeType: arquivoOriginal.type || XLSX_MIME,
      });

      const { error: uploadJobError } = await supabase
        .from("irp_jobs")
        .update({ upload_file_id: uploadFile.id })
        .eq("id", jobId);
      if (uploadJobError) throw uploadJobError;

      const zip = new JSZip();
      const resultadosComItens = resultado.resultados.filter(
        (r) => r.itens.length > 0,
      );

      for (const [index, r] of resultadosComItens.entries()) {
        updateProgress(
          78 + (index / Math.max(resultadosComItens.length, 1)) * 16,
          `Salvando planilha ${index + 1} de ${resultadosComItens.length}...`,
        );
        const { filename, blob } = await gerarPlanilhaSecretaria(r);
        zip.file(filename, await blob.arrayBuffer());
        const outputFile = await uploadIrpFile({
          jobId,
          folder: "exports",
          filename,
          blob,
          fileKind: "irp_export",
          mimeType: XLSX_MIME,
        });
        const { error: secUpdateError } = await supabase
          .from("irp_job_secretarias")
          .update({
            output_file_id: outputFile.id,
            output_filename: filename,
            status: "exportado",
          })
          .eq("job_id", jobId)
          .eq("unidade_id", r.unidade.id)
          .eq("ref_coluna", r.unidade.ref_coluna);
        if (secUpdateError) throw secUpdateError;
      }

      if (resultadosComItens.length > 0) {
        updateProgress(96, "Salvando pacote .zip...");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        await uploadIrpFile({
          jobId,
          folder: "zip",
          filename: `IRP_${new Date().toISOString().slice(0, 10)}.zip`,
          blob: zipBlob,
          fileKind: "zip_export",
          mimeType: ZIP_MIME,
        });
      }

      const { error: completedError } = await supabase
        .from("irp_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (completedError) throw completedError;
    },
    [updateProgress],
  );

  return { persistirArquivosResultado };
}
