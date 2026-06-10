// Cliente do worker M2A via edge function `m2a-proxy`.
// O navegador nunca fala direto com a VPS nem com o portal M2A.

import { supabase } from "@/integrations/supabase/client";
import type { M2aSyncPayload } from "@/lib/m2a-sync";

interface ProxyArgs {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

async function callWorker<T = unknown>({
  path,
  method = "GET",
  body,
}: ProxyArgs): Promise<T> {
  const { data, error } = await supabase.functions.invoke("m2a-proxy", {
    body: { path, method, body },
  });
  if (error) {
    throw new Error(error.message || "Falha ao chamar m2a-proxy");
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export interface WorkerProcessoResponse extends M2aSyncPayload {
  processo_id: string;
  resumo?: {
    qtd_atas: number;
    qtd_itens: number;
    qtd_contratos: number;
    ultimo_numero_por_secretaria: Record<string, number>;
  };
}

/** Espelho do POST /processos/sync da VPS. */
export function fetchProcessoFromWorker(
  m2aProcessoUrlOrId: string,
): Promise<WorkerProcessoResponse> {
  return callWorker<WorkerProcessoResponse>({
    path: "/processos/sync",
    method: "POST",
    body: { m2a_processo_url: m2aProcessoUrlOrId },
  });
}

export function workerHealth(): Promise<{ ok: boolean }> {
  return callWorker<{ ok: boolean }>({ path: "/health", method: "GET" });
}
