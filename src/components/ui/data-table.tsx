import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Componente genérico `DataTable<T>` — tabela padronizada para o app.
 *
 * Objetivos:
 *  - Única fonte de estilo/densidade/hover para todas as listas
 *  - Suporte a sort local, seleção múltipla, paginação client-side, ação por linha
 *  - Slots controlados (empty/loading) para consistência de mensagens
 *  - Zero dependência de business logic — cada tela plugga suas colunas
 */

export type DataTableColumn<T> = {
  /** Chave estável — usada em sort/keys internas. */
  id: string;
  /** Cabeçalho renderizado no <th>. String ou nó. */
  header: React.ReactNode;
  /** Como extrair/renderizar o valor da célula. */
  cell: (row: T, rowIndex: number) => React.ReactNode;
  /** Valor usado no sort local (default: texto renderizado). */
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  /** Habilita sort local nesta coluna. */
  sortable?: boolean;
  /** Alinhamento do conteúdo da célula. */
  align?: "left" | "center" | "right";
  /** Classes extras aplicadas em <th> e <td>. */
  className?: string;
  /** Classes só no <th>. */
  headerClassName?: string;
  /** Classes só no <td>. */
  cellClassName?: string;
  /** Esconde a coluna em breakpoints menores (`hidden md:table-cell` etc.). */
  responsive?: string;
  /** Largura fixa (`w-12`, `w-32`...). */
  width?: string;
};

type SortState = { columnId: string; dir: "asc" | "desc" } | null;

export type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  /** Chave estável por linha (id, uuid). */
  getRowId: (row: T, index: number) => string;
  /** Estado de carregamento. Mostra skeleton no corpo. */
  isLoading?: boolean;
  /** Mensagem/nó customizado quando `data` está vazio. */
  emptyState?: React.ReactNode;
  /** Habilita coluna de checkbox e seleção múltipla. */
  selection?: {
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    /** Rótulo aria por linha (default: "Selecionar linha"). */
    getRowAriaLabel?: (row: T) => string;
  };
  /** Renderiza ação(ões) na coluna final à direita (ex.: dropdown, editar/excluir). */
  rowActions?: (row: T) => React.ReactNode;
  /** Rótulo da coluna de ações (default: "Ações"). */
  actionsHeader?: React.ReactNode;
  /** Habilita paginação local client-side. */
  pagination?: {
    pageSize: number;
    /** default: [10, 25, 50, 100] */
    pageSizeOptions?: number[];
  };
  /** Classes extras no wrapper externo. */
  className?: string;
  /** Densidade da linha. */
  density?: "compact" | "normal";
};

export function DataTable<T>({
  data,
  columns,
  getRowId,
  isLoading,
  emptyState,
  selection,
  rowActions,
  actionsHeader = "Ações",
  pagination,
  className,
  density = "normal",
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<SortState>(null);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(pagination?.pageSize ?? 25);

  // Reset página quando o dataset muda
  React.useEffect(() => {
    setPage(0);
  }, [data]);

  const sortedData = React.useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col?.sortAccessor) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const va = col.sortAccessor!(a);
      const vb = col.sortAccessor!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [data, sort, columns]);

  const totalPages = pagination ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;
  const pagedData = pagination
    ? sortedData.slice(page * pageSize, page * pageSize + pageSize)
    : sortedData;

  const visibleIds = React.useMemo(
    () => pagedData.map((row, i) => getRowId(row, i)),
    [pagedData, getRowId],
  );

  const allVisibleSelected =
    !!selection && visibleIds.length > 0 && visibleIds.every((id) => selection.selected.has(id));
  const someVisibleSelected =
    !!selection && visibleIds.some((id) => selection.selected.has(id)) && !allVisibleSelected;

  function toggleAll(checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) visibleIds.forEach((id) => next.add(id));
    else visibleIds.forEach((id) => next.delete(id));
    selection.onChange(next);
  }

  function toggleOne(id: string, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(id);
    else next.delete(id);
    selection.onChange(next);
  }

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortable || !col.sortAccessor) return;
    setSort((current) => {
      if (!current || current.columnId !== col.id) return { columnId: col.id, dir: "asc" };
      if (current.dir === "asc") return { columnId: col.id, dir: "desc" };
      return null;
    });
  }

  const alignClass = (a?: "left" | "center" | "right") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  const rowPad = density === "compact" ? "[&_td]:py-1.5" : "";

  const totalColSpan =
    columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <Table>
          <TableHeader>
            <TableRow className={rowPad}>
              {selection && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                    }
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Selecionar todas as linhas visíveis"
                  />
                </TableHead>
              )}
              {columns.map((col) => {
                const isSorted = sort?.columnId === col.id;
                return (
                  <TableHead
                    key={col.id}
                    className={cn(
                      alignClass(col.align),
                      col.responsive,
                      col.width,
                      col.className,
                      col.headerClassName,
                    )}
                  >
                    {col.sortable && col.sortAccessor ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        className="inline-flex items-center gap-1 text-inherit hover:text-foreground"
                      >
                        {col.header}
                        {isSorted ? (
                          sort!.dir === "asc" ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
              {rowActions && (
                <TableHead className="w-32 text-right">{actionsHeader}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={totalColSpan}
                  className="py-10 text-center text-[13px] text-muted-foreground"
                >
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              pagedData.map((row, i) => {
                const id = getRowId(row, i);
                const isSelected = selection?.selected.has(id) ?? false;
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    className={rowPad}
                  >
                    {selection && (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => toggleOne(id, v === true)}
                          aria-label={
                            selection.getRowAriaLabel?.(row) ?? "Selecionar linha"
                          }
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        className={cn(
                          alignClass(col.align),
                          col.responsive,
                          col.width,
                          col.className,
                          col.cellClassName,
                        )}
                      >
                        {col.cell(row, i)}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">{rowActions(row)}</div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            {!isLoading && pagedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalColSpan} className="p-0">
                  {emptyState ?? (
                    <div className="py-10 text-center text-[13px] text-muted-foreground">
                      Nenhum registro encontrado.
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && sortedData.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[12px] text-muted-foreground">
          <div>
            {sortedData.length === 0
              ? "0 registros"
              : `Mostrando ${page * pageSize + 1}–${Math.min(
                  (page + 1) * pageSize,
                  sortedData.length,
                )} de ${sortedData.length}`}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span>Linhas:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {(pagination.pageSizeOptions ?? [10, 25, 50, 100]).map((opt) => (
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
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
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Próxima página"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
