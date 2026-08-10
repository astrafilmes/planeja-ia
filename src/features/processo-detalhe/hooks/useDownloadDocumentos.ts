import { useCallback } from "react";
import { notify } from "@/lib/notify";
import { downloadM2ADocuments } from "@/lib/m2a";
import { useProgress } from "@/contexts/ProgressContext";
import { getContratoDocumentos, type ContratoRow } from "../lib";
import { useRef, useEffect } from "react";

export function useDownloadDocumentos(processoId: string, contratos: ContratoRow[] = []) {
  const { startTask, finishTask, failTask } = useProgress();
  const contratosRef = useRef(contratos);

  useEffect(() => {
    contratosRef.current = contratos;
  }, [contratos]);

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

  const handleDownloadSelectedDocs = useCallback(
    async (contractIds: string[]) => {
      const selectedContracts = (contratosRef.current || []).filter(c => contractIds.includes(c.id));
      const docs = selectedContracts.flatMap(getContratoDocumentos);
      if (!selectedContracts.length) return;
      if (!docs.length) {
        notify.error(
          "Nenhuma convocação ou contrato encontrado nos contratos selecionados.",
        );
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
            filename: `processo-${processoId}-documentos.zip`,
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
    [processoId, startTask, finishTask, failTask],
  );

  return { handleDownloadContratoDocs, handleDownloadSelectedDocs };
}
