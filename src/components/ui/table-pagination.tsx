import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hook de paginação local para listas já renderizadas em <Table>.
 * Reseta a página quando o total de itens muda (ex.: filtros).
 */
export function usePaginatedRows<T>(rows: T[], defaultPageSize = 25) {
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  React.useEffect(() => {
    setPage(0);
  }, [total, pageSize]);

  const paginated = React.useMemo(
    () => rows.slice(page * pageSize, page * pageSize + pageSize),
    [rows, page, pageSize],
  );

  return { page, setPage, pageSize, setPageSize, totalPages, paginated, total };
}

export interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  className?: string;
}

export function TablePagination({
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label = "registros",
  className,
}: TablePaginationProps) {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-[12px] text-muted-foreground " +
        (className ?? "")
      }
    >
      <div>
        Mostrando {from}–{to} de {total} {label}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Linhas:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-[12px]"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-16 text-center tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            aria-label="Próxima página"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
