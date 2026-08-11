import { useCallback, useState } from "react";
import { notify } from "@/lib/notify";
import { downloadM2ADocuments, type M2ADocumentoGerado } from "@/lib/m2a";
import { useProgress } from "@/contexts/ProgressContext";
import { getContratoDocumentos, type ContratoRow, DOCUMENTOS_DOWNLOAD_POSICOES } from "../lib";
import type { DocumentTypeOption } from "@/components/contratos/DocumentSelectorDialog";

export function useDownloadDocumentos(processoId: string) {
  const { startTask, finishTask, failTask } = useProgress();
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [targetContracts, setTargetContracts] = useState<ContratoRow[]>([]);

  const handleDownloadContratoDocs = useCallback(
    async (contrato: ContratoRow) => {
      const docs = getContratoDocumentos(contrato);
      if (!docs.length) {
        notify.error("Nenhum documento encontrado no portal para este contrato.");
        return;
      }
      startTask(
        "Compactando documentos",
        `Compactando ${docs.length} documento(s) no servidor...`,
      );
      try {
        await downloadM2ADocuments(
          docs,
          {
            archive: true,
            filename: `${contrato.numero_contrato ?? contrato.id}-documentos.zip`,
          },
          (e) => {
            if (e.status === "concluido")
              finishTask(`${e.total} documento(s) compactado(s).`);
            if (e.status === "erro")
              failTask(e.mensagem ?? "Falha ao gerar ZIP");
          },
        );
      } catch (err: any) {
        notify.error(err?.message ?? "Falha ao gerar ZIP");
      }
    },
    [startTask, finishTask, failTask],
  );

  const startDownloadWithTypes = useCallback(async (selectedTypes: DocumentTypeOption[]) => {
    if (!targetContracts.length || !selectedTypes.length) return;

    const positions = new Set(selectedTypes.map(t => t.position));
    const allDocs = targetContracts.flatMap(contrato => 
      getContratoDocumentos(contrato, positions)
    );

    if (!allDocs.length) {
      notify.error("Nenhum documento do tipo selecionado foi encontrado nos contratos.");
      setSelectorOpen(false);
      return;
    }

    setIsDownloading(true);
    
    // Configura o cancelamento via AbortSignal se o worker suportar ou apenas para parar o loop local.
    const abortController = new AbortController();

    try {
      // Estratégia de consistência: separar em lotes se o total de arquivos for muito grande.
      // 20 arquivos por ZIP é um bom equilíbrio entre performance e risco de timeout/corrupção.
      const BATCH_SIZE = 20;
      const batches = [];
      for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        batches.push(allDocs.slice(i, i + BATCH_SIZE));
      }

      startTask(
        "Preparando download",
        `Processando ${allDocs.length} documento(s) em ${batches.length} lote(s)...`,
        { onCancel: () => abortController.abort() }
      );

      for (let i = 0; i < batches.length; i++) {
        if (abortController.signal.aborted) break;

        const batch = batches[i];
        const isLast = i === batches.length - 1;
        const batchName = batches.length > 1 
          ? `contratos-lote-${i + 1}-de-${batches.length}-${new Date().toISOString().slice(0, 10)}.zip`
          : `contratos-lote-${new Date().toISOString().slice(0, 10)}.zip`;

        updateProgress(
          (i / batches.length) * 100,
          `Gerando lote ${i + 1} de ${batches.length} (${batch.length} arquivos)...`
        );

        await downloadM2ADocuments(
          batch,
          {
            archive: true,
            filename: batchName,
          },
          (e) => {
            if (e.status === "documento") {
              updateProgress(
                (i / batches.length) * 100 + ((e.percent ?? 0) / 100) * (100 / batches.length),
                `Lote ${i + 1}: ${e.mensagem}`
              );
            }
          },
        );
      }

      if (abortController.signal.aborted) {
        failTask("Operação cancelada pelo usuário.");
      } else {
        finishTask(`${allDocs.length} documento(s) baixado(s) em ${batches.length} arquivo(s).`);
      }
    } catch (err: any) {
      notify.error(err?.message ?? "Falha ao gerar ZIP");
      failTask(err?.message ?? "Falha no download");
    } finally {
      setIsDownloading(false);
      setSelectorOpen(false);
    }
  }, [targetContracts, startTask, updateProgress, finishTask, failTask]);

  const handleDownloadSelectedDocs = useCallback(
    (selectedContracts: ContratoRow[]) => {
      if (!selectedContracts.length) return;
      setTargetContracts(selectedContracts);
      setSelectorOpen(true);
    },
    [],
  );

  return { 
    handleDownloadContratoDocs, 
    handleDownloadSelectedDocs,
    selectorProps: {
      open: selectorOpen,
      onOpenChange: setSelectorOpen,
      onConfirm: startDownloadWithTypes,
      isDownloading,
      selectedCount: targetContracts.length
    }
  };
}
