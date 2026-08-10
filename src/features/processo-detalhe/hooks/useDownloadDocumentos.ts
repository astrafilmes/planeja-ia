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
        notify.error("Este contrato ainda não possui convocação ou contrato.");
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
    
    // O "robô" percorre cada contrato e usa a mesma lógica de extração (getContratoDocumentos)
    // agora parametrizada com as posições escolhidas no seletor.
    const docs = targetContracts.flatMap(contrato => 
      getContratoDocumentos(contrato, positions)
    );

    if (!docs.length) {
      notify.error("Nenhum documento do tipo selecionado foi encontrado nos contratos.");
      setSelectorOpen(false);
      return;
    }

    setIsDownloading(true);
    startTask(
      "Compactando documentos",
      `Compactando ${docs.length} documento(s) no servidor...`,
    );

    try {
      await downloadM2ADocuments(
        docs,
        {
          archive: true,
          filename: `contratos-lote-${new Date().toISOString().slice(0, 10)}.zip`,
        },
        (e) => {
          if (e.status === "concluido") {
            finishTask(`${e.total} documento(s) compactado(s).`);
            setIsDownloading(false);
            setSelectorOpen(false);
          }
          if (e.status === "erro") {
            failTask(e.mensagem ?? "Falha ao gerar ZIP");
            setIsDownloading(false);
          }
        },
      );
    } catch (err: any) {
      notify.error(err?.message ?? "Falha ao gerar ZIP");
      setIsDownloading(false);
    }
  }, [targetContracts, startTask, finishTask, failTask]);

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
