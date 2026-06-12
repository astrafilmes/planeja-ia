// Edge Function: m2a-proxy
// Assina HMAC e encaminha a chamada pra VPS do worker M2A.
// O front NUNCA fala direto com a VPS — só com esta função.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: exige usuário logado.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } =
    await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const workerUrl = Deno.env.get("M2A_WORKER_URL");
  const sharedSecret = Deno.env.get("M2A_WORKER_SHARED_SECRET");
  if (!workerUrl || !sharedSecret) {
    return jsonResponse(500, {
      error:
        "Worker não configurado: defina M2A_WORKER_URL e M2A_WORKER_SHARED_SECRET.",
    });
  }

  let payload: { path?: string; method?: string; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido" });
  }
  const path = String(payload.path ?? "");
  const method = String(payload.method ?? "GET").toUpperCase();
  if (!path.startsWith("/")) {
    return jsonResponse(400, { error: "path deve começar com /" });
  }

  const hasBody = payload.body !== undefined && payload.body !== null;
  const rawBody = hasBody ? JSON.stringify(payload.body) : "";
  const ts = String(Date.now());
  const signature = await hmacHex(sharedSecret, `${ts}.${rawBody}`);

  const target = workerUrl.replace(/\/+$/, "") + path;
  let workerRes: Response;
  try {
    workerRes = await fetch(target, {
      method,
      headers: {
        "X-Timestamp": ts,
        "X-Signature": signature,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? rawBody : undefined,
    });
  } catch (e) {
    return jsonResponse(502, {
      error: `Falha ao contatar o worker: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const respContentType =
    workerRes.headers.get("content-type") ?? "application/json";
  const respContentDisposition = workerRes.headers.get("content-disposition");
  const isJson = respContentType.toLowerCase().includes("application/json");

  // JSON / text → repassa como string. Binário (pdf, zip, etc.) → repassa o stream.
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": respContentType,
  };
  if (respContentDisposition) {
    headers["Content-Disposition"] = respContentDisposition;
    headers["Access-Control-Expose-Headers"] = "Content-Disposition";
  }

  if (isJson) {
    const text = await workerRes.text();
    return new Response(text, { status: workerRes.status, headers });
  }
  // Binário (pdf, zip, etc.): repassa o body como stream para evitar
  // estourar memória e o erro "error reading a body from connection"
  // quando o worker envia chunked transfer-encoding (zip streaming).
  return new Response(workerRes.body, { status: workerRes.status, headers });
});
