// Cliente do worker M2A via edge function `m2a-proxy`.
// O navegador nunca fala direto com a VPS nem com o portal M2A.

import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { M2aSyncPayload } from "@/lib/m2a";

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
    let details = error.message || "Falha ao chamar m2a-proxy";
    if (error instanceof FunctionsHttpError) {
      try {
        const raw = await error.context.text();
        try {
          const parsed = JSON.parse(raw);
          details =
            (parsed?.error as string) ||
            (parsed?.message as string) ||
            raw ||
            details;
        } catch {
          if (raw) details = raw;
        }
      } catch {
        /* ignore */
      }
    }
    console.error(`[m2a-proxy] ${method} ${path} falhou:`, details);
    throw new Error(`m2a-proxy ${path}: ${details}`);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}


export interface WorkerProcessoResponse extends M2aSyncPayload {
  processo_id: string;
  trace?: Array<Record<string, unknown>>;
  resumo?: {
    qtd_atas: number;
    qtd_itens_mestre?: number;
    qtd_itens: number;
    qtd_contratos: number;
    ultimo_numero_por_secretaria: Record<string, number>;
  };
  itens_mestre?: Array<Record<string, unknown>>;
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

