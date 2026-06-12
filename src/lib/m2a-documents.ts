// Download de documentos do portal M2A via VPS worker (sem extensão Chrome).
// Fluxo:
//   - 1 documento:   Browser → m2a-proxy → /documentos/baixar  (binário direto)
//   - N documentos:  Browser → m2a-proxy → /documentos/baixar/stream  (SSE de progresso)
//                    Browser → m2a-proxy → /documentos/baixar/arquivo/:jobId (ZIP pronto)

import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import type { M2ABulkDownloadDocumento, M2ABulkDownloadOptions } from "@/lib/m2a";

export interface DownloadProgress {
  status:
    | "iniciado"
    | "documento"
    | "compactando"
    | "preparado"
    | "concluido"
    | "erro";
  total: number;
  baixados: number;
  /** Posição do documento sendo processado (1..total). */
  index?: number;
  /** Nome do documento atual. */
  nome?: string;
  /** Estado granular durante "documento": baixando | ok | erro. */
  itemStatus?: "baixando" | "ok" | "erro";
  contratoId?: string | null;
  /** Texto descritivo pronto pra UI. */
  mensagem?: string;
  /** 0..100 estimado para a etapa atual (downloads concluídos / total). */
  percent?: number;
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
      const contratoId = String(
        (d as { m2aContratoId?: string }).m2aContratoId ?? "",
      ).trim();
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

async function callProxy(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Response> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const res = await fetch(`${supabaseUrl}/functions/v1/m2a-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ path, method, body }),
  });
  return res;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data?.error) return String(data.error);
  } catch {}
  try {
    const text = await res.clone().text();
    if (text) return text;
  } catch {}
  return `HTTP ${res.status}`;
}

/**
 * Lê uma resposta SSE chunked e invoca handlers por evento.
 * Compatível com a edge function m2a-proxy que repassa o body do worker.
 */
async function consumeSSE(
  res: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  if (!res.body) throw new Error("Resposta sem body para SSE.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Eventos SSE são separados por \n\n.
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      const raw = dataLines.join("\n");
      let parsed: any = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {}
      onEvent(eventName, parsed);
    }
  }
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
  const filename =
    opts?.filename || (archive ? "documentos.zip" : workerDocs[0].nome);

  // ─── Caso simples: 1 arquivo só → download direto, sem SSE. ────────────────
  if (!archive) {
    onProgress?.({ status: "iniciado", total, baixados: 0 });
    try {
      const res = await callProxy("/documentos/baixar", "POST", {
        documentos: workerDocs,
        archive: false,
        filename,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const blob = await res.blob();
      const headerName = filenameFromHeader(res.headers.get("Content-Disposition"));
      saveAs(blob, headerName || filename);
      onProgress?.({ status: "concluido", total, baixados: total, percent: 100 });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.({ status: "erro", total, baixados: 0, mensagem: message });
      throw err;
    }
  }

  // ─── Caso bulk: SSE com progresso por documento. ───────────────────────────
  onProgress?.({
    status: "iniciado",
    total,
    baixados: 0,
    mensagem: `Iniciando download de ${total} documento(s)...`,
  });

  let baixados = 0;
  let jobId: string | null = null;
  let finalFilename = filename;

  try {
    const streamRes = await callProxy("/documentos/baixar/stream", "POST", {
      documentos: workerDocs,
      filename,
    });
    if (!streamRes.ok) throw new Error(await readErrorMessage(streamRes));

    await consumeSSE(streamRes, (event, data) => {
      if (event === "progress") {
        if (data?.tipo === "inicio") {
          onProgress?.({
            status: "iniciado",
            total,
            baixados: 0,
            mensagem: `Preparando ${total} documento(s)...`,
            percent: 0,
          });
        } else if (data?.tipo === "documento") {
          const idx = Number(data.index ?? 0);
          const nome = String(data.nome ?? "");
          if (data.status === "baixando") {
            onProgress?.({
              status: "documento",
              total,
              baixados,
              index: idx,
              nome,
              itemStatus: "baixando",
              contratoId: data.contrato_id ?? null,
              percent: Math.round(((idx - 1) / Math.max(total, 1)) * 90),
              mensagem: `Baixando ${idx}/${total} — ${nome}`,
            });
          } else if (data.status === "ok") {
            baixados += 1;
            onProgress?.({
              status: "documento",
              total,
              baixados,
              index: idx,
              nome,
              itemStatus: "ok",
              contratoId: data.contrato_id ?? null,
              percent: Math.round((idx / Math.max(total, 1)) * 90),
              mensagem: `OK ${baixados}/${total} — ${nome}`,
            });
          } else if (data.status === "erro") {
            onProgress?.({
              status: "documento",
              total,
              baixados,
              index: idx,
              nome,
              itemStatus: "erro",
              contratoId: data.contrato_id ?? null,
              percent: Math.round((idx / Math.max(total, 1)) * 90),
              mensagem: `Falha em "${nome}": ${data.erro ?? "erro"}`,
            });
          }
        } else if (data?.tipo === "compactando") {
          onProgress?.({
            status: "compactando",
            total,
            baixados,
            percent: 92,
            mensagem: "Compactando arquivos em ZIP...",
          });
        }
      } else if (event === "done") {
        jobId = String(data?.jobId ?? "");
        if (data?.filename) finalFilename = String(data.filename);
        onProgress?.({
          status: "preparado",
          total,
          baixados,
          percent: 96,
          mensagem: "ZIP pronto, baixando...",
        });
      } else if (event === "error") {
        throw new Error(String(data?.error || "Falha no servidor"));
      }
    });

    if (!jobId) throw new Error("Servidor não retornou jobId do ZIP.");

    // 2ª chamada: busca o ZIP pronto.
    const zipRes = await callProxy(
      `/documentos/baixar/arquivo/${jobId}`,
      "GET",
    );
    if (!zipRes.ok) throw new Error(await readErrorMessage(zipRes));
    const blob = await zipRes.blob();
    const headerName = filenameFromHeader(zipRes.headers.get("Content-Disposition"));
    saveAs(blob, headerName || finalFilename);

    onProgress?.({
      status: "concluido",
      total,
      baixados: total,
      percent: 100,
      mensagem: `${total} documento(s) prontos.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ status: "erro", total, baixados, mensagem: message });
    throw err;
  }
}
