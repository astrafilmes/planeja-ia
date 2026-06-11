import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  id?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Standardized section block for long forms (processos/contratos detail).
 * Provides consistent header + scroll anchor + elevated card surface.
 */
export function FormSection({
  id,
  title,
  description,
  icon,
  action,
  children,
  className,
}: FormSectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <Card variant="elevated" className="overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <div
                aria-hidden
                className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft/40 text-accent-strong"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
        <div className="px-5 py-5">{children}</div>
      </Card>
    </section>
  );
}
