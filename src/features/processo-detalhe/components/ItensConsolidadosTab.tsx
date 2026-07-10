import { FileText, Search } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePaginatedRows } from "@/components/ui/table-pagination";
import { BRL, formatQuantidade, type ItemConsolidado } from "../lib";

export interface ItensConsolidadosTabProps {
  itens: ItemConsolidado[];
  search: string;
  onSearchChange: (value: string) => void;
}

export function ItensConsolidadosTab({
  itens,
  search,
  onSearchChange,
}: ItensConsolidadosTabProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>Itens consolidados</CardTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Itens importados da ata e quantidades contratadas neste processo.
            </p>
          </div>
          <div className="flex-1" />
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-9"
              placeholder="Buscar item por código ou descrição"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24">Unidade</TableHead>
              <TableHead className="w-28 text-right">Quantidade</TableHead>
              <TableHead className="w-40 text-right">
                Valor unit. inicial
              </TableHead>
              <TableHead className="w-40 text-right">Valor contratado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={FileText}
                    title="Nenhum item encontrado"
                    description={
                      search
                        ? "Ajuste a busca para localizar outros itens."
                        : "Os itens importados da ata aparecerão aqui."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((item) => (
                <TableRow key={`${item.codigo}-${item.descricao}`}>
                  <TableCell className="text-xs">{item.codigo}</TableCell>
                  <TableCell className="min-w-0">
                    <div className="line-clamp-2 text-sm font-medium text-foreground">
                      {item.descricao}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.unidade ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {formatQuantidade(item.quantidadeConsumida)}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {BRL.format(item.valorUnitario ?? 0)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">
                    {BRL.format(item.valorUnitarioContratado ?? 0)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
