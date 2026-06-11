import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSkeleton } from "@/components/ui/loading";

export function ChartCard({
  title,
  description,
  icon,
  action,
  loading,
  empty,
  isEmpty,
  height = 288,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  isEmpty?: boolean;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/50 pb-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            {icon}
            <span className="truncate">{title}</span>
          </CardTitle>
          {description && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="pt-5">
        <div style={{ height }} className="animate-fade-in">
          {loading ? (
            <ChartSkeleton />
          ) : isEmpty ? (
            <div className="grid h-full place-items-center text-center">
              {empty ?? (
                <p className="text-[13px] text-muted-foreground">
                  Sem dados para exibir.
                </p>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Themed recharts tooltip content. Pass to <Tooltip content={<ChartTooltip/>} />.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color?: string }>;
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="animate-scale-in rounded-xl border border-border/60 bg-popover px-3 py-2 text-[12px] shadow-[var(--shadow-elevated)]">
      {label && (
        <div className="mb-1 font-semibold text-foreground">{label}</div>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: p.color ?? "var(--accent)" }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-medium text-foreground">
              {valueFormatter ? valueFormatter(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
