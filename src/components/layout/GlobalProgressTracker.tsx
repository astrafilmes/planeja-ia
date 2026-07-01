import { useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  StopCircle,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProgress } from "@/contexts/ProgressContext";

export function GlobalProgressTracker() {
  const {
    isVisible,
    title,
    statusText,
    progress,
    isIndeterminate,
    status,
    logs,
    cancellable,
    cancelTask,
    closeTracker,
  } = useProgress();

  const [expanded, setExpanded] = useState(false);

  if (!isVisible) return null;

  const isDone =
    status === "success" || status === "error" || status === "cancelled";

  return (
    <section
      aria-live="polite"
      aria-label="Progresso de tarefa"
      className="fixed inset-x-4 bottom-4 z-50 overflow-hidden rounded-lg border border-border/60 bg-card/95 shadow-lg backdrop-blur-md transition-all sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {status === "success" ? (
            <CheckCircle className="size-4 shrink-0 text-emerald-500" />
          ) : status === "error" ? (
            <XCircle className="size-4 shrink-0 text-destructive" />
          ) : status === "cancelled" ? (
            <StopCircle className="size-4 shrink-0 text-amber-500" />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          )}
          <h2 className="truncate text-sm font-semibold text-foreground">
            {title || "Processando tarefa"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {logs.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Recolher passos" : "Expandir passos"}
            >
              {expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </Button>
          )}
          {isDone && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={closeTracker}
              aria-label="Fechar progresso"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          {statusText || "Aguardando atualização..."}
        </p>
        {isIndeterminate ? (
          <div className="relative h-2 overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-1/3 rounded-full bg-primary transition-all animate-progress-indeterminate" />
          </div>
        ) : (
          <Progress value={progress} className="h-2" />
        )}

        {cancellable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-end gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400"
            onClick={cancelTask}
          >
            <StopCircle className="size-3.5" />
            Cancelar envio
          </Button>
        )}

        {expanded && logs.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
            <ol className="space-y-0.5">
              {logs.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70">
                    {new Date(l.at).toLocaleTimeString("pt-BR", {
                      hour12: false,
                    })}
                  </span>
                  {l.etapa && (
                    <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] uppercase text-primary">
                      {l.etapa}
                    </span>
                  )}
                  <span className="text-foreground/90">{l.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
