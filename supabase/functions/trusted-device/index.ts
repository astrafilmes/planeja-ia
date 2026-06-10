// Edge function: trusted-device
// Implementa "Confiar neste dispositivo (token longo)".
//
// Endpoints (POST com body { action: 'issue'|'validate'|'revoke'|'revoke-all', token?, label? }):
//  - issue       (auth): gera token aleatório, grava hash, devolve token bruto.
//  - validate    (público): valida token e devolve um magic link (action_link)
//                            que o cliente abre para restabelecer a sessão.
//  - revoke      (auth ou via token): revoga o token atual.
//  - revoke-all  (auth): revoga todos os tokens do usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(body?.action || "");
  const ua = req.headers.get("user-agent") || null;
  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  try {
    if (action === "issue") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "unauthenticated" }, 401);
      const token = randomToken(32);
      const hash = await sha256Hex(token);
      const label = (body?.label || "").toString().slice(0, 80) || null;
      const { error } = await admin.from("trusted_devices").insert({
        user_id: user.id,
        token_hash: hash,
        device_label: label,
        user_agent: ua,
        last_ip: ip,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ token, expires_in_days: 60 });
    }

    if (action === "validate") {
      const token = String(body?.token || "");
      if (!token) return json({ error: "missing token" }, 400);
      const hash = await sha256Hex(token);
      const { data: userIdRow, error } = await admin.rpc(
        "consume_trusted_device" as any,
        { p_token_hash: hash },
      );
      if (error) return json({ error: error.message }, 500);
      const userId = userIdRow as string | null;
      if (!userId) return json({ valid: false }, 200);
      // Recupera e-mail para gerar magic link
      const { data: u, error: uerr } = await admin.auth.admin.getUserById(userId);
      if (uerr || !u?.user?.email) return json({ valid: false }, 200);
      const { data: link, error: lerr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: u.user.email,
      });
      if (lerr) return json({ error: lerr.message }, 500);
      const hashed = (link as any)?.properties?.hashed_token ?? null;
      return json({
        valid: true,
        email: u.user.email,
        hashed_token: hashed,
        action_link: (link as any)?.properties?.action_link ?? null,
      });
    }

    if (action === "revoke") {
      const token = String(body?.token || "");
      if (token) {
        const hash = await sha256Hex(token);
        await admin
          .from("trusted_devices")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", hash);
        return json({ ok: true });
      }
      const user = await getAuthUser(req);
      if (!user) return json({ error: "unauthenticated" }, 401);
      return json({ ok: true });
    }

    if (action === "revoke-all") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "unauthenticated" }, 401);
      const { error } = await admin
        .from("trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
