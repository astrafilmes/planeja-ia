import { memo, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePaginatedRows } from "@/components/ui/table-pagination";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { BRL, calcQuantidadeTotal, type ItemActionKind, type ItemRow } from "../lib";

export interface ContratoItensTabProps {
  itens: ItemRow[];
  valorTotal: number;
  onItemAction: (kind: ItemActionKind, item: ItemRow) => void;
}

export const ContratoItensTab = memo(function ContratoItensTab({
  itens,
  valorTotal,
  onItemAction,
}: ContratoItensTabProps) {
  const quantidadeTotal = useMemo(() => calcQuantidadeTotal(itens), [itens]);
  const {
    paginated: paginatedItens,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    total,
  } = usePaginatedRows(itens, 25);

  if (itens.length === 0) {
    return (
      <Card className="overflow-hidden border-border/60">
        <EmptyState
          icon={FileText}
          title="Nenhum item cadastrado"
          description="Importe os itens via planilha para preencher este contrato."
          action={
            <Link to="/importar-contratos">
              <Button size="sm" variant="outline">
                Importar contratos
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/60">
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">#</TableHead>
              <TableHead className="hidden w-20 sm:table-cell">Lote</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="hidden w-20 sm:table-cell">Unid.</TableHead>
              <TableHead className="w-24 text-right">Qtd</TableHead>
              <TableHead className="hidden w-32 text-right sm:table-cell">
                Vlr unit.
              </TableHead>
              <TableHead className="hidden w-32 text-right sm:table-cell">
                Vlr total
              </TableHead>
              <TableHead className="w-20 pr-4 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItens.map((it, i) => {
              const displayIndex = page * pageSize + i;
              const total = Number(
                it.valor_total ??
                  Number(it.quantidade ?? 0) * Number(it.valor_unitario ?? 0),
              );
              return (
                <TableRow key={it.id} className="hover:bg-muted/40">
                  <TableCell className="pl-4 py-2 font-mono text-xs text-muted-foreground">
                    {it.numero_item ?? displayIndex + 1}
                  </TableCell>
                  <TableCell className="hidden py-2 text-xs sm:table-cell">
                    {it.lote ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    <div className="line-clamp-2 font-medium leading-tight">
                      {it.descricao}
                    </div>
                    {it.especificacao && (
                      <div
                        className="line-clamp-2 max-w-2xl text-[13px] text-muted-foreground"
                        title={String(it.especificacao)}
                      >
                        {it.especificacao}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground sm:hidden">
                      <span>Lote {it.lote ?? "—"}</span>
                      <span>Unid. {it.unidade ?? "—"}</span>
                      <span>{BRL.format(total)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-2 text-xs sm:table-cell">
                    {it.unidade ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 text-right text-xs tabular-nums">
                    {Number(it.quantidade ?? 0).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="hidden py-2 text-right text-xs tabular-nums sm:table-cell">
                    {BRL.format(Number(it.valor_unitario ?? 0))}
                  </TableCell>
                  <TableCell className="hidden py-2 text-right text-xs tabular-nums font-medium sm:table-cell">
                    {BRL.format(total)}
                  </TableCell>
                  <TableCell className="py-2 pr-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title="Editar item"
                        onClick={() => onItemAction("edit", it)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-destructive hover:text-destructive"
                        title="Excluir item"
                        onClick={() => onItemAction("delete", it)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="sm:hidden">
              <TableCell
                colSpan={3}
                className="px-4 py-3 text-xs text-muted-foreground"
              >
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <b className="text-foreground">{itens.length}</b> item(ns)
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {BRL.format(valorTotal)}
                  </span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="hidden sm:table-row">
              <TableCell
                colSpan={4}
                className="pl-4 py-2 text-xs text-muted-foreground"
              >
                <b className="text-foreground">{itens.length}</b> item(ns)
              </TableCell>
              <TableCell className="text-right py-2 text-xs tabular-nums text-muted-foreground">
                {quantidadeTotal.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="py-2 text-right text-[11px] text-muted-foreground">
                Total
              </TableCell>
              <TableCell className="text-right py-2 tabular-nums font-semibold">
                {BRL.format(valorTotal)}
              </TableCell>
              <TableCell className="pr-4" />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </Card>
  );
});
