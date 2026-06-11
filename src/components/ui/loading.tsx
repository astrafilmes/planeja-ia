import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSpinner({
  size = 16,
  className,
  label = "Carregando",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}
    >
      <Loader2 className="animate-spin" style={{ width: size, height: size }} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-[40vh] place-items-center"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="relative grid size-12 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
          <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-medium">{label}</span>
      </div>
    </div>
  );
}

export function StatChipSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface-elevated p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </div>
    </div>
  );
}

export function ChartSkeleton({ bars = 10 }: { bars?: number }) {
  const heights = [62, 78, 45, 92, 58, 70, 40, 84, 52, 66];
  return (
    <div
      role="status"
      aria-label="Carregando gráfico"
      className="flex h-72 items-end gap-3 px-2 pb-1"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-t-lg"
          style={{ height: `${heights[i % heights.length]}%` }}
        />
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      role="status"
      aria-label="Carregando tabela"
      className="overflow-hidden rounded-xl border border-border/60"
    >
      <div
        className="grid gap-4 border-b border-border/60 bg-muted/40 px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 rounded-md" />
        ))}
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-3.5 rounded-md"
                style={{ width: `${60 + ((r * 13 + c * 7) % 30)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
      <Skeleton className="h-4 w-1/3 rounded-md" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 rounded-md" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
