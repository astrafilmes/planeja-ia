import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ActionBarProps = {
  backAction?: ReactNode;
  secondaryActions?: ReactNode;
  destructiveAction?: ReactNode;
  primaryAction?: ReactNode;
  className?: string;
};

export function ActionBar({
  backAction,
  secondaryActions,
  destructiveAction,
  primaryAction,
  className,
}: ActionBarProps) {
  const hasTrailingActions =
    secondaryActions || destructiveAction || primaryAction;

  if (!backAction && !hasTrailingActions) return null;

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-nowrap",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">{backAction}</div>
      {hasTrailingActions && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {secondaryActions}
          {destructiveAction}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
