import { CheckCircle, Loader2, XCircle, X } from"lucide-react";

import { Button } from"@/components/ui/button";
import { Progress } from"@/components/ui/progress";
import { useProgress } from"@/contexts/ProgressContext";

export function GlobalProgressTracker() {
 const {
 isVisible,
 title,
 statusText,
 progress,
 isIndeterminate,
 status,
 closeTracker,
 } = useProgress();

 if (!isVisible) return null;

 const isDone = status ==="success" || status ==="error";

 return (
 <section
 aria-live="polite"
 aria-label="Progresso de tarefa"
 className="fixed inset-x-4 bottom-4 z-50 overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-md transition-all sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80"
 >
 <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 ">
 <div className="flex min-w-0 items-center gap-2">
 {status ==="success" ? (
 <CheckCircle className="size-4 shrink-0 text-emerald-500" />
 ) : status ==="error" ? (
 <XCircle className="size-4 shrink-0 text-destructive" />
 ) : (
 <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
 )}
 <h2 className="truncate text-sm font-semibold text-foreground">
 {title ||"Processando tarefa"}
 </h2>
 </div>
 {isDone && (
 <Button
 type="button"
 variant="ghost"
 size="icon"
 className="size-7 shrink-0"
 onClick={closeTracker}
 aria-label="Fechar progresso"
 >
 <X className="size-4" />
 </Button>
 )}
 </div>

 <div className="flex flex-col gap-3 px-4 py-4">
 <p className="line-clamp-2 text-[13px] text-muted-foreground">
 {statusText ||"Aguardando atualização..."}
 </p>
 {isIndeterminate ? (
 <div className="relative h-2 overflow-hidden rounded-full bg-primary/20">
 <div className="h-full w-1/3 rounded-full bg-primary transition-all animate-progress-indeterminate" />
 </div>
 ) : (
 <Progress value={progress} className="h-2" />
 )}
 </div>
 </section>
 );
}
