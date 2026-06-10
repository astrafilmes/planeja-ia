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
    const LOG = "[m2a-sync]";
    console.group(`${LOG} sync processo=${processoId}`);
    console.log(`${LOG} url=${m2aProcessoUrl}`);
    const tStart = performance.now();

    try {
      console.log(`${LOG} → fetchProcessoFromWorker (m2a-proxy → VPS)`);
      const tFetch = performance.now();
      const payload = await fetchProcessoFromWorker(m2aProcessoUrl);
      console.log(
        `${LOG} ✓ worker respondeu em ${(performance.now() - tFetch).toFixed(0)}ms`,
        {
          atas: payload.atas?.length ?? 0,
          itens: payload.itens?.length ?? 0,
          contratos: payload.contratos_existentes?.length ?? 0,
        },
      );

      toast.loading("Salvando atas, itens e contratos…", {
        id: toastIdRef.current ?? undefined,
      });

      console.log(`${LOG} → persistM2ASnapshot`);
      const summary = await persistM2ASnapshot(processoId, {
        atas: payload.atas ?? [],
        itens: payload.itens ?? [],
        contratos_existentes: payload.contratos_existentes ?? [],
      });

      toast.success(
        `Sincronização concluída! ${summary.atas} atas, ${summary.itens} itens, ${summary.contratos_snapshot} contratos. ` +
          `Atualizados: ${summary.contratos_atualizados} contratos / ${summary.itens_atualizados} itens. ` +
          `Duplicatas removidas: ${summary.duplicatas_removidas}.`,
        { id: toastIdRef.current ?? undefined },
      );

      console.log(
        `${LOG} ✅ TOTAL ${(performance.now() - tStart).toFixed(0)}ms`,
      );

      qc.invalidateQueries({ queryKey: ["m2a-snapshot", processoId] });
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${LOG} ❌ falhou:`, e);
      toast.error(`Falha ao sincronizar: ${msg}`, {
        id: toastIdRef.current ?? undefined,
      });
    } finally {
      setIsSyncing(false);
      toastIdRef.current = null;
      console.groupEnd();
    }
  }, [m2aProcessoUrl, processoId, qc]);

  return { sync, isSyncing };
}
