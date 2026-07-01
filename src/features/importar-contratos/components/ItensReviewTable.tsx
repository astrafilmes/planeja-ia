import { memo } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ValorUnitInput } from "@/components/importar/ImportarHelpers";
import { formatNumber } from "@/lib/utils/normalize";
import type { M2AAtaRow } from "../lib";

type Props = {
  itens: any[];
  dotacoes: any[];
  m2aAtas: M2AAtaRow[];
  isAutorizado: boolean;
  onAtualizarItem: (
    id: string,
    patch: { valor_unitario?: number; excluido?: boolean },
  ) => void;
  onAtualizarAtaItem: (item: any, ataId: string) => void;
  onAlternarDotacao: (id: string, ignorar: boolean) => void;
};

/**
 * Duas tabelas empilhadas: Itens da planilha (editáveis) e Dotações (ativar/ignorar).
 * A edição inline usa `ValorUnitInput` para persistir apenas ao blur/enter.
 */
export const ItensReviewTable = memo(function ItensReviewTable({
  itens,
  dotacoes,
  m2aAtas,
  isAutorizado,
  onAtualizarItem,
  onAtualizarAtaItem,
  onAlternarDotacao,
}: Props) {
  return (
    <>
      <Card className="overflow-hidden border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Nº item</TableHead>
              <TableHead className="w-16">Lote</TableHead>
              <TableHead className="w-64">Ata</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Especificação</TableHead>
              <TableHead className="w-20">Unidade</TableHead>
              <TableHead className="w-44 text-right">Valor unit. (R$)</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i: any) => (
              <TableRow key={i.id} className={i.excluido ? "opacity-40" : ""}>
                <TableCell className="text-xs font-mono">
                  {i.ordem_item || "—"}
                </TableCell>
                <TableCell className="text-[13px]">{i.lote || "—"}</TableCell>
                <TableCell>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-[13px] transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
                    value={i.m2a_ata_id ?? "__none__"}
                    disabled={isAutorizado}
                    onChange={(event) => onAtualizarAtaItem(i, event.target.value)}
                  >
                    <option value="__none__">Sem ata</option>
                    {m2aAtas.map((ata) => (
                      <option key={ata.m2a_ata_id} value={ata.m2a_ata_id}>
                        {ata.numero_ata} · {ata.fornecedor_nome ?? "Fornecedor"}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
                    <span>{i.m2a_match_status ?? "pendente"}</span>
                    {i.m2a_item_id && (
                      <span className="font-mono">item {i.m2a_item_id}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[13px]">
                  <div className="line-clamp-2">{i.descricao}</div>
                </TableCell>
                <TableCell className="text-[13px]">
                  <div className="line-clamp-2 text-muted-foreground">
                    {i.especificacao || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-[13px]">{i.unidade}</TableCell>
                <TableCell className="text-right">
                  <ValorUnitInput
                    disabled={isAutorizado}
                    initial={Number(i.valor_unitario ?? 0)}
                    onSave={async (v) => {
                      await onAtualizarItem(i.id, { valor_unitario: v });
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={isAutorizado}
                    onClick={() =>
                      onAtualizarItem(i.id, { excluido: !i.excluido })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="mt-4 border-border/60">
        <CardHeader className="pb-2">
          <CardTitle>Dotações ({dotacoes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Secretaria</TableHead>
                  <TableHead>Dotação</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dotacoes.map((d: any) => {
                  const item = itens.find((i: any) => i.id === d.item_id);
                  return (
                    <TableRow
                      key={d.id}
                      className={d.ignorado ? "opacity-40" : ""}
                    >
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {d.secretaria_sigla}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.dotacao}</TableCell>
                      <TableCell className="text-xs truncate max-w-xs">
                        {item?.descricao ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {formatNumber(d.quantidade)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={d.ignorado ? "outline" : "ghost"}
                          className="h-6 text-[10px]"
                          disabled={isAutorizado}
                          onClick={() => onAlternarDotacao(d.id, !d.ignorado)}
                        >
                          {d.ignorado ? "Reativar" : "Ignorar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
});
