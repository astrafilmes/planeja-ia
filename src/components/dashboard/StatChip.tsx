import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "indigo" | "pink" | "blue" | "green" | "amber" | "slate";

const toneMap: Record<
  Tone,
  { surface: string; icon: string; ring: string }
> = {
  indigo: {
    surface: "bg-chip-teal",
    icon: "text-chip-teal-foreground",
    ring: "ring-chip-teal-foreground/20",
  },
  pink: {
    surface: "bg-chip-pink",
    icon: "text-chip-pink-foreground",
    ring: "ring-chip-pink-foreground/15",
  },
  blue: {
    surface: "bg-chip-blue",
    icon: "text-chip-blue-foreground",
    ring: "ring-chip-blue-foreground/15",
  },
  green: {
    surface: "bg-chip-green",
    icon: "text-chip-green-foreground",
    ring: "ring-chip-green-foreground/15",
  },
  amber: {
    surface: "bg-chip-amber",
    icon: "text-chip-amber-foreground",
    ring: "ring-chip-amber-foreground/15",
  },
  slate: {
    surface: "bg-muted",
    icon: "text-muted-foreground",
    ring: "ring-border/40",
  },
};

export function StatChip({
  label,
  value,
  icon,
  tone = "indigo",
  trend,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  trend?: string;
  hint?: string;
}) {
  const t = toneMap[tone];
  return (
    <div className="group relative flex flex-col gap-4 rounded-lg border border-border/60 bg-surface-elevated p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "grid size-10 place-items-center rounded-lg ring-1",
            t.surface,
            t.icon,
            t.ring,
          )}
        >
          {icon}
        </div>
        {trend && (
          <span className="text-[11px] font-medium text-success">{trend}</span>
        )}
      </div>
      <div>
        <div className="text-[28px] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-muted-foreground">
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[11px] text-muted-foreground/70">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
