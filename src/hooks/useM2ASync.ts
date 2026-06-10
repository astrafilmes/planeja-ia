import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { persistM2ASnapshot } from "@/lib/m2a-snapshot";
import { fetchProcessoFromWorker } from "@/lib/m2a-worker";

interface UseM2aSyncOpts {
  processoId: string;
  m2aProcessoUrl: string | null | undefined;
}

interface UseM2aSyncReturn {
  sync: () => Promise<void>;
  isSyncing: boolean;
}

export function useM2ASync({
  processoId,
  m2aProcessoUrl,
}: UseM2aSyncOpts): UseM2aSyncReturn {
  const qc = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);

  const sync = useCallback(async () => {
    if (!m2aProcessoUrl) {
      toast.error("Configure a URL do processo no portal antes de sincronizar.");
      return;
    }

    setIsSyncing(true);
    toastIdRef.current = toast.loading(
      "Conectando ao portal M2A pelo worker…",
    );

    try {
      const payload = await fetchProcessoFromWorker(m2aProcessoUrl);

      toast.loading("Salvando atas, itens e contratos…", {
        id: toastIdRef.current ?? undefined,
      });

      await persistM2ASnapshot(processoId, {
        atas: payload.atas ?? [],
        itens: payload.itens ?? [],
        contratos_existentes: payload.contratos_existentes ?? [],
      });

      toast.success(
        `Sincronização concluída! ${payload.resumo?.qtd_atas ?? 0} atas, ${
          payload.resumo?.qtd_itens ?? 0
        } itens, ${payload.resumo?.qtd_contratos ?? 0} contratos.`,
        { id: toastIdRef.current ?? undefined },
      );

      qc.invalidateQueries({ queryKey: ["m2a-snapshot", processoId] });
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao sincronizar: ${msg}`, {
        id: toastIdRef.current ?? undefined,
      });
    } finally {
      setIsSyncing(false);
      toastIdRef.current = null;
    }
  }, [m2aProcessoUrl, processoId, qc]);

  return { sync, isSyncing };
}
