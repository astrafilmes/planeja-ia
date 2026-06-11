import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/layout/ActionBar";

type PageHeaderProps = {
  breadcrumb?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  topRightIndicators?: ReactNode;
  statusBadge?: ReactNode;
  secondaryActions?: ReactNode;
  destructiveAction?: ReactNode;
  primaryAction?: ReactNode;
  onBack?: () => void;
};

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  topRightIndicators,
  statusBadge,
  secondaryActions,
  destructiveAction,
  primaryAction,
  onBack,
}: PageHeaderProps) {
  const backAction = onBack ? (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="shrink-0"
      onClick={onBack}
    >
      <ArrowLeft className="size-4" />
      Voltar
    </Button>
  ) : null;

  return (
    <div className="mx-auto mb-7 flex w-full flex-col gap-4">
      {(breadcrumb || topRightIndicators) && (
        <div className="flex min-h-7 items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            {breadcrumb && (
              <div className="min-w-0 truncate rounded-full bg-muted/70 px-2.5 py-1 font-medium text-foreground/70">
                {breadcrumb}
              </div>
            )}
          </div>
          {topRightIndicators && (
            <div className="shrink-0">{topRightIndicators}</div>
          )}
        </div>
      )}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-[28px] font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {statusBadge}
          </div>
          {subtitle && (
            <p className="mt-2 line-clamp-2 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        <ActionBar
          backAction={backAction}
          secondaryActions={secondaryActions}
          destructiveAction={destructiveAction}
          primaryAction={primaryAction}
          className="sm:shrink-0"
        />
      </div>
    </div>
  );
}
