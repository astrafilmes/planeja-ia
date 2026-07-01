import { useEffect, useState } from "react";
import { useProgress } from "@/contexts/ProgressContext";
import { notify } from "@/lib/notify";
import { carregarResultadoSalvo, type ResultadoSalvoIRP } from "../lib";

export interface UseIrpDetalheOptions {
  jobSearchParam: string | undefined;
  onLoadStart: () => void;
  onLoadSuccess: (jobId: string) => void;
}

export interface UseIrpDetalheResult {
  resultadoSalvo: ResultadoSalvoIRP | null;
  setResultadoSalvo: (r: ResultadoSalvoIRP | null) => void;
  loading: boolean;
}

/**
 * Carrega o resultado salvo de um job IRP a partir do search param `?job=`.
 * Preserva o cleanup por `cancelled` para evitar setState em unmount.
 */
export function useIrpDetalhe({
  jobSearchParam,
  onLoadStart,
  onLoadSuccess,
}: UseIrpDetalheOptions): UseIrpDetalheResult {
  const { startTask, finishTask, failTask } = useProgress();
  const [resultadoSalvo, setResultadoSalvo] =
    useState<ResultadoSalvoIRP | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobSearchParam) {
      setResultadoSalvo(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    onLoadStart();
    startTask("Carregando IRP", "Abrindo resultado salvo...");

    carregarResultadoSalvo(jobSearchParam)
      .then((resultado) => {
        if (cancelled) return;
        setResultadoSalvo(resultado);
        onLoadSuccess(jobSearchParam);
        finishTask("Resultado IRP carregado.");
      })
      .catch((e: any) => {
        if (cancelled) return;
        failTask(e?.message ?? "Falha ao carregar resultado IRP.");
        notify.error("Falha ao carregar resultado", {
          description: e?.message,
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSearchParam]);

  return { resultadoSalvo, setResultadoSalvo, loading };
}
