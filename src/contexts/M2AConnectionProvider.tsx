import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { M2AProgressEvent } from "@/lib/m2a";

type M2AConnectionStatus = "connected" | "disconnected" | "checking";

type M2AConnectionContextValue = {
  status: M2AConnectionStatus;
  connected: boolean;
  lastSeenAt: number | null;
  openHelp: () => void;
  ensureConnected: () => boolean;
};

const M2AConnectionContext = createContext<M2AConnectionContextValue | null>(
  null,
);

function isTrustedWindowEvent(event: MessageEvent) {
  if (event.source !== window) return false;
  if (event.origin && event.origin !== window.location.origin) return false;
  return true;
}

export function M2AConnectionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<M2AConnectionStatus>("checking");
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const connected = status === "connected";

  const openHelp = useCallback(() => setHelpOpen(true), []);

  const ensureConnected = useCallback(() => {
    if (status === "connected") return true;
    setHelpOpen(true);
    return false;
  }, [status]);

  useEffect(() => {
    let timeoutId: number | undefined;

    function sendPing() {
      window.postMessage({ type: "M2A_BRIDGE_PING" }, window.location.origin);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setStatus((current) =>
          current === "connected" ? "disconnected" : current,
        );
      }, 1600);
    }

    function onMessage(event: MessageEvent) {
      if (!isTrustedWindowEvent(event)) return;
      if (event.data?.type !== "M2A_BRIDGE_PONG") return;
      window.clearTimeout(timeoutId);
      setLastSeenAt(Date.now());
      setStatus("connected");
    }

    window.addEventListener("message", onMessage);
    sendPing();
    const interval = window.setInterval(sendPing, 3000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(interval);
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    async function onProgress(event: MessageEvent) {
      if (!isTrustedWindowEvent(event)) return;
      const progress = event.data as M2AProgressEvent | undefined;
      if (!progress || progress.type !== "M2A_PROGRESS") return;
      if (!progress.contratoId || progress.scope === "processo_srp") return;
      if (progress.etapa !== "concluido" && progress.status !== "concluido") {
        return;
      }

      await supabase
        .from("contratos")
        .update({
          status_envio_m2a: "sucesso",
          enviado_m2a_em: new Date().toISOString(),
          m2a_contrato_id: progress.m2a_contrato_id ?? null,
          m2a_documentos_gerados: (progress.documentosM2A ?? []) as any,
          ultimo_erro_m2a: null,
        })
        .eq("id", progress.contratoId);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contratos"] }),
        qc.invalidateQueries({
          queryKey: ["contrato-full", progress.contratoId],
        }),
        qc.invalidateQueries({ queryKey: ["processo-detail"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    }

    window.addEventListener("message", onProgress);
    return () => window.removeEventListener("message", onProgress);
  }, [qc]);

  const value = useMemo(
    () => ({ status, connected, lastSeenAt, openHelp, ensureConnected }),
    [connected, ensureConnected, lastSeenAt, openHelp, status],
  );

  return (
    <M2AConnectionContext.Provider value={value}>
      {children}
      <M2ADisconnectedDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </M2AConnectionContext.Provider>
  );
}

function M2ADisconnectedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const steps = [
    "Ative a extensão no navegador.",
    "Faça login no portal externo.",
    "Atualize esta página.",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-slate-800 bg-white dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CircleAlert className="size-4 text-amber-500" />
            Extensão Desconectada
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            O envio fica bloqueado até a extensão responder.
          </p>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step}
                className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/70"
              >
                <Badge
                  variant="outline"
                  className="mt-0.5 size-6 justify-center p-0"
                >
                  {index + 1}
                </Badge>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Entendi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function M2AConnectionIndicator() {
  const { status, lastSeenAt, openHelp } = useM2AConnection();
  const connected = status === "connected";
  const label =
    status === "checking"
      ? "Extensão Verificando"
      : connected
        ? "Extensão Conectada"
        : "Extensão Desconectada";

  return (
    <button
      type="button"
      onClick={openHelp}
      className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors ${
        connected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      }`}
      title={
        lastSeenAt
          ? `Última resposta: ${new Date(lastSeenAt).toLocaleTimeString("pt-BR")}`
          : "Aguardando resposta da extensão"
      }
    >
      {connected ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <CircleDot className="size-3.5" />
      )}
      <span className="hidden lg:inline">{label}</span>
    </button>
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
