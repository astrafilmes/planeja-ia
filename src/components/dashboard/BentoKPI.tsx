import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "neutral" | "accent" | "dark";

/**
 * Bento-style KPI card inspired by the editorial dashboard pattern:
 * one card is solid/accent for hierarchy, the rest stay neutral.
 */
export function BentoKPI({
  label,
  value,
  hint,
  icon,
  variant = "neutral",
  className,
  size = "sm",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  variant?: Variant;
  className?: string;
  size?: "sm" | "lg";
}) {
  const surface =
    variant === "accent"
      ? "bg-warning text-warning-foreground border-transparent"
      : variant === "dark"
        ? "bg-foreground text-background border-transparent"
        : "bg-surface-elevated text-foreground border-border/60";

  const labelTone =
    variant === "neutral"
      ? "text-muted-foreground"
      : "opacity-80";

  const hintTone =
    variant === "neutral"
      ? "text-muted-foreground/70"
      : "opacity-70";

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-lg border p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5",
        surface,
        size === "lg" ? "min-h-[180px]" : "min-h-[128px]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("text-[11.5px] font-medium uppercase tracking-[0.08em]", labelTone)}>
          {label}
        </div>
        {icon && (
          <div className={cn("shrink-0 opacity-90", variant === "neutral" && "text-accent-strong")}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div
          className={cn(
            "font-semibold leading-none tracking-tight",
            size === "lg" ? "text-[44px]" : "text-[32px]",
          )}
        >
          {value}
        </div>
        {hint && (
          <div className={cn("mt-2 text-[11.5px]", hintTone)}>{hint}</div>
        )}
      </div>
    </div>
  );
}
