// Helpers para "Confiar neste dispositivo (token longo)".
// Token bruto fica no localStorage e nunca trafega salvo para o edge function.

import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "pj_trusted_token";

export function getTrustedToken(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function clearTrustedToken() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* noop */
  }
}

export async function issueTrustedDevice(label?: string) {
  const { data, error } = await supabase.functions.invoke("trusted-device", {
    body: { action: "issue", label: label || navigator.userAgent.slice(0, 80) },
  });
  if (error) throw error;
  const token = (data as { token?: string } | null)?.token;
  if (!token) throw new Error("Token não retornado");
  try {
    localStorage.setItem(LS_KEY, token);
  } catch {
    /* noop */
  }
  return token;
}

/**
 * Tenta restabelecer a sessão usando o token confiável.
 * Retorna true se uma sessão válida foi instalada.
 */
export async function tryRestoreFromTrustedDevice(): Promise<boolean> {
  const token = getTrustedToken();
  if (!token) return false;
  try {
    const { data, error } = await supabase.functions.invoke("trusted-device", {
      body: { action: "validate", token },
    });
    if (error) {
      console.warn("[trusted-device] validate falhou:", error.message);
      return false;
    }
    const payload = data as {
      valid?: boolean;
      email?: string;
      hashed_token?: string;
      action_link?: string;
    } | null;
    if (!payload?.valid || !payload.email) {
      console.info("[trusted-device] token inválido/expirado, limpando.");
      clearTrustedToken();
      return false;
    }

    // Token hash pode vir direto, ou ser extraído do action_link.
    const tokenHash =
      payload.hashed_token ||
      (payload.action_link
        ? new URL(payload.action_link).searchParams.get("token") ?? undefined
        : undefined);

    if (!tokenHash) {
      console.warn("[trusted-device] resposta sem token_hash/action_link.");
      return false;
    }

    // Supabase JS v2: { token_hash, type }. Testa magiclink e cai em email.
    for (const type of ["magiclink", "email"] as const) {
      const { error: vErr } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!vErr) {
        console.info(`[trusted-device] sessão restaurada (type=${type}).`);
        return true;
      }
      console.warn(
        `[trusted-device] verifyOtp (type=${type}) falhou:`,
        vErr.message,
      );
    }
    return false;
  } catch (e) {
    console.warn("[trusted-device] erro inesperado:", e);
    return false;
  }
}

export async function revokeCurrentTrustedDevice() {
  const token = getTrustedToken();
  if (!token) return;
  try {
    await supabase.functions.invoke("trusted-device", {
      body: { action: "revoke", token },
    });
  } finally {
    clearTrustedToken();
  }
}

export async function revokeAllTrustedDevices() {
  await supabase.functions.invoke("trusted-device", {
    body: { action: "revoke-all" },
  });
  clearTrustedToken();
}
