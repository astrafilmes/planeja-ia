import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  createM2aProcessoSyncRequestId,
  listenM2aProcessoSync,
  postM2aProcessoSync,
  type M2aSyncPayload,
} from "@/lib/m2a-sync";
import { persistM2ASnapshot } from "@/lib/m2a-snapshot";

interface UseM2aSyncOpts {
  processoId: string;
  m2aProcessoUrl: string | null | undefined;
}

interface UseM2aSyncReturn {
  sync: () => Promise<void>;
  isSyncing: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  abrindo: "[PROD-SYNC] Iniciando varredura no portal…",
  atas: "Mapeando Atas e Fornecedores…",
  itens: "Coletando itens das atas…",
  contratos: "Extraindo histórico de contratos…",
  concluido: "Sincronização concluída!",
  erro: "Falha na sincronização",
};

export function useM2ASync({
  processoId,
  m2aProcessoUrl,
}: UseM2aSyncOpts): UseM2aSyncReturn {
  const qc = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const persistSnapshot = useCallback(
    (payload: M2aSyncPayload) => persistM2ASnapshot(processoId, payload),
    [processoId],
  );

  useEffect(() => {
    if (!requestId) return;

    const off = listenM2aProcessoSync(requestId, async (evt) => {
      if (evt.type === "M2A_SYNC_PROCESSO_PROGRESS") {
        toast.loading(STAGE_LABELS[evt.etapa] ?? evt.mensagem, {
          id: toastIdRef.current ?? undefined,
        });
        return;
      }

      if (evt.type === "M2A_SYNC_PROCESSO_COMPLETE") {
        off();
        setRequestId(null);
        setIsSyncing(false);

        try {
          if (evt.erro || !evt.payload) {
            toast.error(
              `Falha ao sincronizar: ${evt.erro ?? "payload vazio"}`,
              { id: toastIdRef.current ?? undefined },
            );
          } else {
            await persistSnapshot(evt.payload);
            toast.success(`Sincronização concluída!`, {
              id: toastIdRef.current ?? undefined,
            });
            qc.invalidateQueries({ queryKey: ["m2a-snapshot", processoId] });
            qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`Falha ao salvar snapshot: ${msg}`, {
            id: toastIdRef.current ?? undefined,
          });
        }
      }
    });

    // timeout de segurança (90s)
    const timeout = setTimeout(() => {
      if (isSyncing) {
        off();
        toast.error("Tempo esgotado aguardando a extensão.", {
          id: toastIdRef.current ?? undefined,
        });
        setIsSyncing(false);
        setRequestId(null);
      }
    }, 90_000);

    return () => {
      off();
      clearTimeout(timeout);
    };
  }, [requestId, isSyncing, persistSnapshot, processoId, qc]);

  const sync = useCallback(() => {
    if (!m2aProcessoUrl) {
      toast.error(
        "Configure a URL do processo no portal antes de sincronizar.",
      );
      return Promise.resolve();
    }

    const rid = createM2aProcessoSyncRequestId();
    setRequestId(rid);
    setIsSyncing(true);

    toastIdRef.current = toast.loading(STAGE_LABELS.abrindo);
    window.setTimeout(() => postM2aProcessoSync(rid, m2aProcessoUrl), 0);

    return Promise.resolve();
  }, [m2aProcessoUrl]);

  useEffect(
    () => () => {
      toastIdRef.current = null;
    },
    [],
  );

  return { sync, isSyncing };
}
