import { memo, useCallback } from "react";
import {
  Building2,
  ChevronDown,
  FileSignature,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import type { ContratoPreliminar } from "@/lib/contratoImport";
import {
  resolveFornecedorKey,
  resolveFornecedorNome,
  resolveSecretariaForContrato,
  type SecretariaM2A,
} from "../lib";

type Props = {
  contratosPreliminares: ContratoPreliminar[];
  secretariasM2A: SecretariaM2A[];
  prepostosByFornecedor: Record<string, string>;
  contratosDesmarcados: Set<string>;
  isAutorizado: boolean;
  onToggleContrato: (key: string) => void;
};

/**
 * Lista de cards colapsáveis com a prévia dos contratos que serão gerados.
 * Cada card mostra secretaria, fornecedor, ata, checkbox de inclusão no lote
 * e — quando expandido — os itens.
 */
export const ContratosPreviewList = memo(function ContratosPreviewList({
  contratosPreliminares,
  secretariasM2A,
  prepostosByFornecedor,
  contratosDesmarcados,
  isAutorizado,
  onToggleContrato,
}: Props) {
  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    [],
  );

  if (contratosPreliminares.length === 0) {
    return (
      <Card className="border-border/60">
        <EmptyState
          icon={FileSignature}
          title="Nenhum contrato previsto"
          description="Todos os itens estão excluídos ou sem dotação ativa."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {contratosPreliminares.map((c) => {
        const sec = resolveSecretariaForContrato(c, secretariasM2A);
        const nomeSec = sec?.nome ?? c.secretariaSigla;
        const prepostoPreview =
          prepostosByFornecedor[resolveFornecedorKey(c)]?.trim() ?? "";
        const desmarcado = contratosDesmarcados.has(c.key);
        return (
          <Collapsible key={c.key} defaultOpen={false}>
            <Card
              className={`overflow-hidden border-border/60 transition-opacity ${
                desmarcado ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-stretch">
                <div
                  className="flex items-center justify-center px-3 border-r border-border/60 bg-muted/30"
                  onClick={stopPropagation}
                >
                  <Checkbox
                    checked={!desmarcado}
                    disabled={isAutorizado}
                    onCheckedChange={() => onToggleContrato(c.key)}
                    aria-label={
                      desmarcado
                        ? "Incluir este contrato no lote"
                        : "Excluir este contrato do lote"
                    }
                  />
                </div>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex-1 text-left transition-colors hover:bg-muted/50"
                  >
                    <CardHeader className="pb-3 pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ChevronDown className="size-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90 group-data-[state=closed]:-rotate-90" />
                          <Building2 className="size-4 text-muted-foreground shrink-0" />
                          <span
                            className={`font-semibold text-sm truncate ${
                              desmarcado ? "line-through" : ""
                            }`}
                          >
                            {nomeSec}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            · {resolveFornecedorNome(c)}
                          </span>
                          <Badge
                            variant={c.m2aAtaId ? "secondary" : "destructive"}
                            className="text-[10px]"
                          >
                            {c.m2aAtaNumero ?? "Sem ata"}
                          </Badge>
                          {desmarcado && (
                            <Badge variant="outline" className="text-[10px]">
                              não será gerado
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {c.totalItens} item(ns) ·{" "}
                          <strong className="text-foreground">
                            {formatBRL(c.totalValor)}
                          </strong>
                        </div>
                      </div>
                    </CardHeader>
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <div className="grid gap-2 border-t border-border/60 bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground dark:bg-muted/30 md:grid-cols-4">
                  <div>
                    <span className="font-medium text-foreground">Ata:</span>{" "}
                    {c.m2aAtaNumero ?? "não definida"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">UG:</span>{" "}
                    {sec?.m2a_orgao_id ?? "não cadastrada"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      Órgão Dot.:
                    </span>{" "}
                    {sec?.m2a_dot_orgao_id ?? "não cadastrado"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Fiscal:</span>{" "}
                    {sec?.m2a_fiscal_nome ?? "não cadastrado"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      Fornecedor:
                    </span>{" "}
                    {resolveFornecedorNome(c)}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Gestor:</span>{" "}
                    {sec?.m2a_gestor_nome ?? "não cadastrado"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      Preposto:
                    </span>{" "}
                    {prepostoPreview || "não informado"}
                  </div>
                </div>
                <CardContent className="border-t border-border/60 p-0 ">
                  <Table className="[&_th]:h-9 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2 text-[13px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Nº item</TableHead>
                        <TableHead className="w-16">Lote</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Especificação</TableHead>
                        <TableHead className="w-24">Unidade</TableHead>
                        <TableHead className="w-16 text-right">Qtd</TableHead>
                        <TableHead className="w-28 text-right">V. unit</TableHead>
                        <TableHead className="w-32 text-right">V. total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.itens.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="tabular-nums">
                            {it.ordemItem ?? i + 1}
                          </TableCell>
                          <TableCell>{it.lote || "—"}</TableCell>
                          <TableCell>
                            <div className="line-clamp-2">{it.descricao}</div>
                          </TableCell>
                          <TableCell>
                            <div className="line-clamp-2 text-muted-foreground">
                              {it.especificacao || "—"}
                            </div>
                          </TableCell>
                          <TableCell>{it.unidade}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(it.quantidade)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBRL(it.valorUnitario)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatBRL(it.subtotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
});
