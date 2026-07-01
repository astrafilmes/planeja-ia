import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Read-only compact calendar with dots on flagged dates.
 * @param markedDates - ISO date strings (YYYY-MM-DD) to render a dot under.
 */
export function MiniCalendar({
  markedDates = [],
  onDayClick,
}: {
  markedDates?: string[];
  onDayClick?: (date: Date) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const marked = useMemo(() => new Set(markedDates), [markedDates]);

  const { weeks, monthName } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = first.getDay(); // 0=Sun
    const daysInMonth = last.getDate();

    const cells: Array<{ day: number | null; iso?: string }> = [];
    for (let i = 0; i < startDow; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, iso });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null });
    const weeks: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthName = first.toLocaleDateString("pt-BR", { month: "long" });
    return { weeks, monthName };
  }, [year, month]);

  const dows = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const todayIso = `${year}-${String(month + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="rounded-lg border border-border/50 bg-surface-elevated p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {today.toLocaleDateString("pt-BR", { weekday: "long" })}
          </div>
          <div className="text-[20px] font-semibold tracking-tight">
            {monthName.charAt(0).toUpperCase() + monthName.slice(1)}, {today.getDate()}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground">{year}</div>
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {dows.map((d) => (
          <div
            key={d}
            className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((cell, i) => {
          const isToday = cell.iso === todayIso;
          const isMarked = cell.iso ? marked.has(cell.iso) : false;
          const clickable = cell.day !== null && !!onDayClick;
          return (
            <div
              key={i}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (!clickable || !cell.day) return;
                const d = new Date(year, month, cell.day);
                onDayClick?.(d);
              }}
              onKeyDown={(e) => {
                if (!clickable || !cell.day) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDayClick?.(new Date(year, month, cell.day));
                }
              }}
              className={cn(
                "flex flex-col items-center rounded-md py-0.5 transition-colors",
                clickable &&
                  "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50",
                cell.day === null && "pointer-events-none",
              )}
            >
              <div
                className={cn(
                  "grid size-7 place-items-center rounded-full text-[12px]",
                  cell.day === null && "opacity-0",
                  isToday
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-foreground/80",
                )}
              >
                {cell.day ?? ""}
              </div>
              <div
                className={cn(
                  "mt-0.5 size-1 rounded-full",
                  isMarked && !isToday ? "bg-accent" : "bg-transparent",
                )}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
