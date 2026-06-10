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
    <div className="mx-auto mb-6 flex w-full flex-col gap-4">
      {(breadcrumb || topRightIndicators) && (
        <div className="flex min-h-7 items-center justify-between gap-3 text-[13px] text-slate-500 dark:text-slate-400">
          <div className="flex min-w-0 items-center gap-2">
            {breadcrumb && <div className="min-w-0 truncate">{breadcrumb}</div>}
          </div>
          {topRightIndicators && (
            <div className="shrink-0">{topRightIndicators}</div>
          )}
        </div>
      )}
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {statusBadge}
          </div>
          {subtitle && (
            <p className="mt-1 line-clamp-2 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
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
