import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { MiniCalendar } from "./MiniCalendar";
import { ReminderDialog, ReminderPayload } from "./ReminderDialog";

export type AgendaItem = {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  time: string;
  tone: "teal" | "amber" | "rose" | "slate";
};

const toneMap: Record<AgendaItem["tone"], { bg: string; ring: string; dot: string; iconBg: string }> = {
  teal: {
    bg: "bg-accent-soft/70",
    ring: "ring-accent/20",
    dot: "bg-accent",
    iconBg: "bg-accent text-accent-foreground",
  },
  amber: {
    bg: "bg-warning/15",
    ring: "ring-warning/30",
    dot: "bg-warning",
    iconBg: "bg-warning text-warning-foreground",
  },
  rose: {
    bg: "bg-destructive/10",
    ring: "ring-destructive/20",
    dot: "bg-destructive",
    iconBg: "bg-destructive text-destructive-foreground",
  },
  slate: {
    bg: "bg-muted",
    ring: "ring-border",
    dot: "bg-muted-foreground/40",
    iconBg: "bg-foreground text-background",
  },
};

export function AgendaPanel({
  items,
  markedDates,
  loading,
}: {
  items: AgendaItem[];
  markedDates?: string[];
  loading?: boolean;
}) {
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const handleSaveReminder = (_payload: ReminderPayload) => {
    // TODO: integrar com Supabase para persistir o lembrete
    // await supabase.from("lembretes").insert({ ... });
  };

  return (
    <div className="flex h-full flex-col gap-5 rounded-3xl border border-border/50 bg-surface-elevated p-5 shadow-[var(--shadow-card)]">
      <MiniCalendar
        markedDates={markedDates}
        onDayClick={(dayDate) => {
          setSelectedDate(dayDate);
          setIsReminderModalOpen(true);
        }}
      />

      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight">Atividade recente</h3>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>

      <div className="relative flex-1">
        {/* timeline rail */}
        <div
          className="absolute left-[14px] top-1 bottom-1 w-px bg-gradient-to-b from-border via-border/60 to-transparent"
          aria-hidden="true"
        />

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="ml-8 h-16 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="ml-8 text-[12.5px] text-muted-foreground">
            Sem atividades recentes.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const t = toneMap[item.tone];
              return (
                <li key={item.id} className="relative pl-8">
                  <span
                    className={cn(
                      "absolute left-[10px] top-4 size-2 rounded-full ring-4 ring-surface-elevated",
                      t.dot,
                    )}
                    aria-hidden="true"
                  />
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3.5 py-3 ring-1",
                      t.bg,
                      t.ring,
                    )}
                  >
                    <div
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-xl",
                        t.iconBg,
                      )}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold text-foreground">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.time}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
