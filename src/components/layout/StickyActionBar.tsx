import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  children: ReactNode;
  status?: ReactNode;
  className?: string;
}

/**
 * Floating action bar pinned to bottom of long form pages.
 * Stays visible while scrolling; collapses to safe-area padding on mobile.
 */
export function StickyActionBar({ children, status, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/95 px-4 py-3 shadow-elevated backdrop-blur-xl supports-[backdrop-filter]:bg-card/80",
        className,
      )}
      role="region"
      aria-label="Ações da página"
    >
      <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
        {status}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

interface SectionNavProps {
  sections: { id: string; label: string }[];
  activeId?: string;
  className?: string;
}

/**
 * Sticky table-of-contents for long detail pages.
 * Pairs with FormSection's id+scroll-mt for smooth section jumps.
 */
export function SectionNav({ sections, activeId, className }: SectionNavProps) {
  return (
    <nav
      aria-label="Navegação de seções"
      className={cn(
        "sticky top-20 hidden w-56 shrink-0 self-start lg:block",
        className,
      )}
    >
      <ul className="flex flex-col gap-0.5 border-l border-border/60 pl-3 text-[13px]">
        {sections.map((s) => {
          const active = activeId === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  "relative block rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/60 hover:text-foreground",
                  active
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute -left-[13px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-strong"
                  />
                )}
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
