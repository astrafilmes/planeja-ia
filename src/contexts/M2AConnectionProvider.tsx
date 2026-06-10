// Stub do antigo provider de conexão com a extensão Chrome.
// A extensão foi removida — todo o fluxo M2A passa pelo vps-worker via
// edge function `m2a-proxy`. Mantemos a API (`useM2AConnection`,
// `M2AConnectionIndicator`) para não quebrar os call-sites existentes,
// mas o estado é sempre "connected" e nada é despachado via postMessage.

import { createContext, ReactNode, useContext, useMemo } from "react";
import { CheckCircle2 } from "lucide-react";

type M2AConnectionContextValue = {
  status: "connected";
  connected: true;
  lastSeenAt: number | null;
  openHelp: () => void;
  ensureConnected: () => boolean;
};

const M2AConnectionContext = createContext<M2AConnectionContextValue | null>(
  null,
);

export function M2AConnectionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<M2AConnectionContextValue>(
    () => ({
      status: "connected",
      connected: true,
      lastSeenAt: null,
      openHelp: () => {},
      ensureConnected: () => true,
    }),
    [],
  );
  return (
    <M2AConnectionContext.Provider value={value}>
      {children}
    </M2AConnectionContext.Provider>
  );
}

export function M2AConnectionIndicator() {
  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
      title="Integração M2A via worker"
    >
      <CheckCircle2 className="size-3.5" />
      <span className="hidden lg:inline">Worker M2A</span>
    </span>
  );
}

export function useM2AConnection() {
  const context = useContext(M2AConnectionContext);
  if (!context) {
    throw new Error(
      "useM2AConnection must be used within M2AConnectionProvider",
    );
  }
  return context;
}
