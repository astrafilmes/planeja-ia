import { notify } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";

/**
 * Classificador central de erros para o React Query.
 *
 * Filosofia:
 *   - Toda query/mutation que falha passa aqui via QueryCache/MutationCache.
 *   - Hooks que já exibem toasts locais devem marcar `meta: { silent: true }`
 *     para evitar duplicação.
 *   - Erros 401/403 com JWT expirado disparam signOut + redirect graceful.
 *   - Erros de rede/5xx exibem toast genérico.
 *   - Erros 4xx (payload/validação) são silenciados por padrão — o hook
 *     costuma renderizar mensagem contextual.
 */

type Meta = { silent?: boolean; errorMessage?: string } | undefined;

interface NormalizedError {
  status?: number;
  code?: string;
  message: string;
  isAuthExpired: boolean;
  isNetwork: boolean;
  isServer: boolean;
  isClient: boolean;
}

const AUTH_EXPIRED_CODES = new Set([
  "PGRST301", // JWT expired (PostgREST)
  "PGRST302", // JWT invalid
  "401",
  "invalid_token",
  "token_expired",
]);

function normalizeError(error: unknown): NormalizedError {
  const anyErr = error as any;
  const status: number | undefined =
    typeof anyErr?.status === "number"
      ? anyErr.status
      : typeof anyErr?.statusCode === "number"
        ? anyErr.statusCode
        : undefined;
  const code: string | undefined = anyErr?.code ?? anyErr?.error_code;
  const message: string =
    anyErr?.message ??
    anyErr?.error_description ??
    (typeof error === "string" ? error : "Erro desconhecido");

  const isAuthExpired =
    status === 401 ||
    (typeof code === "string" && AUTH_EXPIRED_CODES.has(code)) ||
    /jwt (expired|invalid)/i.test(message);

  const isNetwork =
    !status &&
    (anyErr?.name === "TypeError" ||
      /network|fetch|failed to fetch/i.test(message));

  const isServer = typeof status === "number" && status >= 500;
  const isClient =
    typeof status === "number" && status >= 400 && status < 500 && !isAuthExpired;

  return { status, code, message, isAuthExpired, isNetwork, isServer, isClient };
}

let handlingAuthExpired = false;

async function handleAuthExpired() {
  if (handlingAuthExpired) return;
  handlingAuthExpired = true;
  try {
    notify.warning("Sua sessão expirou. Faça login novamente para continuar.", {
      duration: 6000,
    });
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop — segue para o redirect mesmo se o signOut falhar */
    }
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
  } finally {
    // Libera após pequeno atraso para permitir que outras queries em curso
    // reaproveitem o mesmo bloqueio em vez de disparar novo redirect.
    setTimeout(() => {
      handlingAuthExpired = false;
    }, 2000);
  }
}

export function handleGlobalError(error: unknown, meta: Meta, kind: "query" | "mutation") {
  const info = normalizeError(error);

  // Telemetria estruturada para observabilidade futura (Sentry/Datadog).
  console.error(`[queryClient] ${kind} failure`, {
    kind,
    status: info.status,
    code: info.code,
    message: info.message,
    silent: !!meta?.silent,
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
    timestamp: new Date().toISOString(),
  });

  if (info.isAuthExpired) {
    void handleAuthExpired();
    return;
  }

  if (meta?.silent) return;

  const customMessage = meta?.errorMessage;

  if (info.isNetwork) {
    notify.error(
      customMessage ??
        "Não foi possível conectar ao servidor. Verifique sua conexão.",
    );
    return;
  }

  if (info.isServer) {
    notify.error(
      customMessage ??
        "Falha de comunicação com o servidor. Tente novamente em instantes.",
    );
    return;
  }

  // Mutations 4xx merecem toast (validação/permissão). Queries 4xx silenciam
  // por padrão — o componente costuma renderizar estado de erro contextual.
  if (info.isClient && kind === "mutation") {
    notify.error(customMessage ?? info.message);
    return;
  }

  // Fallback: erro sem status (ex.: throw manual em queryFn).
  if (!info.status && kind === "mutation") {
    notify.error(customMessage ?? info.message);
  }
}
