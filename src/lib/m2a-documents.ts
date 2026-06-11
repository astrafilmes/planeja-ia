// Download de documentos do portal M2A via VPS worker (sem extensão Chrome).
// Fluxo:  Browser → Edge Function (m2a-proxy) → VPS → M2A
// O servidor compacta múltiplos arquivos em ZIP e devolve o blob pronto.

import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import type { M2ABulkDownloadDocumento, M2ABulkDownloadOptions } from "@/lib/m2a";

export interface DownloadProgress {
  status: "iniciado" | "concluido" | "erro";
  total: number;
  baixados: number;
  mensagem?: string;
}

type WorkerDoc =
  | { source: "m2a"; id_m2a: string; nome: string; contrato_id?: string }
  | { source: "url"; url: string; nome: string };

function toWorkerDocs(documentos: M2ABulkDownloadDocumento[]): WorkerDoc[] {
  return documentos
    .map((d) => {
      if ("origem" in d && d.origem === "url") {
        return { source: "url" as const, url: d.url, nome: d.nome };
      }
      const id = String((d as { id_m2a?: string }).id_m2a ?? "").trim();
      if (!/^\d+$/.test(id)) return null;
      const contratoId = String((d as { contratoId?: string }).contratoId ?? "").trim();
      return {
        source: "m2a" as const,
        id_m2a: id,
        nome: d.nome,
        ...(contratoId ? { contrato_id: contratoId } : {}),
      };
    })
    .filter((x): x is WorkerDoc => x !== null);
}

function filenameFromHeader(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return utf8[1];
    }
  }
  const m = /filename="?([^";]+)"?/i.exec(headerValue);
  return m ? m[1] : null;
}

export async function downloadM2ADocuments(
  documentos: M2ABulkDownloadDocumento[],
  opts?: M2ABulkDownloadOptions,
  onProgress?: (e: DownloadProgress) => void,
): Promise<void> {
  const workerDocs = toWorkerDocs(documentos);
  const total = workerDocs.length;
  if (!total) {
    onProgress?.({ status: "erro", total: 0, baixados: 0, mensagem: "Nenhum documento válido." });
    throw new Error("Nenhum documento válido para download.");
  }

  const archive = Boolean(opts?.archive) || workerDocs.length > 1;
  const filename = opts?.filename || (archive ? "documentos.zip" : workerDocs[0].nome);

  onProgress?.({ status: "iniciado", total, baixados: 0 });

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    const msg = "Sessão expirada. Faça login novamente.";
    onProgress?.({ status: "erro", total, baixados: 0, mensagem: msg });
    throw new Error(msg);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/m2a-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        path: "/documentos/baixar",
        method: "POST",
        body: { documentos: workerDocs, archive, filename },
      }),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        msg = data?.error || msg;
      } catch {
        try {
          msg = (await res.text()) || msg;
        } catch {}
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const headerName = filenameFromHeader(res.headers.get("Content-Disposition"));
    saveAs(blob, headerName || filename);

    onProgress?.({ status: "concluido", total, baixados: total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ status: "erro", total, baixados: 0, mensagem: message });
    throw err;
  }
}
