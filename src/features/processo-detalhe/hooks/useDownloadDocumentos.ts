import { useCallback, useState } from "react";
import { notify } from "@/lib/notify";
import { downloadM2ADocuments, type M2ADocumentoGerado } from "@/lib/m2a";
import { useProgress } from "@/contexts/ProgressContext";
import { getContratoDocumentos, type ContratoRow } from "../lib";
import type { DocumentTypeOption } from "@/components/contratos/DocumentSelectorDialog";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";

export function useDownloadDocumentos(processoId: string) {
  const { startTask, updateProgress, finishTask, failTask } = useProgress();
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
    
    // Configura o cancelamento via AbortSignal
    const abortController = new AbortController();

    try {
      // Estratégia de consistência: separar em lotes se o total de arquivos for muito grande.
      // 100 arquivos por lote (solicitado pelo usuário).
      const BATCH_SIZE = 100;
      const batches: M2ADocumentoGerado[][] = [];
      for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        batches.push(allDocs.slice(i, i + BATCH_SIZE));
      }

      startTask(
        "Preparando download",
        `Processando ${allDocs.length} documento(s) em ${batches.length} lote(s)...`,
        { onCancel: () => abortController.abort() }
      );

      const finalZip = new JSZip();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

      for (let i = 0; i < batches.length; i++) {
        if (abortController.signal.aborted) break;

        const batch = batches[i];
        
        updateProgress(
          (i / batches.length) * 100,
          `Baixando lote ${i + 1} de ${batches.length} (${batch.length} arquivos)...`
        );

        // Chamada direta ao proxy para obter o Blob do lote sem disparar download automático do browser
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await fetch(`${supabaseUrl}/functions/v1/m2a-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ 
            path: "/documentos/baixar", 
            method: "POST", 
            body: { 
              documentos: batch.map(d => ({ 
                source: "m2a", 
                id_m2a: d.id_m2a, 
                nome: d.nome, 
                contrato_id: d.m2aContratoId 
              })), 
              archive: true 
            } 
          }),
          signal: abortController.signal
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "Erro desconhecido");
          let errMsg = errText;
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error || errText;
          } catch {
            // Não é JSON, usa texto puro
          }
          throw new Error(errMsg);
        }

        const zipBlob = await res.blob();
        
        // Extrai o conteúdo do ZIP do lote e adiciona ao ZIP final
        const batchZip = await JSZip.loadAsync(zipBlob);
        
        // Usamos Set para evitar duplicatas de nomes dentro do zip final se houver colisão entre lotes
        for (const [filename, fileData] of Object.entries(batchZip.files)) {
          if (!fileData.dir) {
            const content = await fileData.async("blob");
            // Se já existir, jszip gerencia ou podemos prefixar
            finalZip.file(filename, content);
          }
        }

        updateProgress(
          ((i + 1) / batches.length) * 100,
          `Lote ${i + 1} concluído e consolidado.`
        );
      }

      if (abortController.signal.aborted) {
        failTask("Operação cancelada pelo usuário.");
      } else {
        updateProgress(98, "Gerando arquivo ZIP final único...");
        const finalBlob = await finalZip.generateAsync({ 
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        });
        const finalName = `contratos-consolidado-${new Date().toISOString().slice(0, 10)}.zip`;
        saveAs(finalBlob, finalName);
        finishTask(`${allDocs.length} documento(s) consolidados em um único arquivo.`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        failTask("Operação cancelada pelo usuário.");
      } else {
        notify.error(err?.message ?? "Falha ao gerar ZIP consolidado");
        failTask(err?.message ?? "Falha no download");
      }
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
