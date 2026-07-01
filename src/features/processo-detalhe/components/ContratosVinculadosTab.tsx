import { Link } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  FileSignature,
  Megaphone,
  Printer,
} from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BRL, formatDateBR, type ContratoRow } from "../lib";
import { M2AStatusBadge } from "./M2AStatusBadge";
import { ContratosBulkActionsBar } from "./ContratosBulkActionsBar";

export interface ContratosVinculadosTabProps {
  contratos: ContratoRow[];
  selected: Set<string>;
  batchStatus: Record<string, string>;
  sending: boolean;
  connected: boolean;
  deletePending: boolean;
  selectionStats: { count: number; total: number };
  statsTotal: number;
  onToggleAll: (checked: boolean) => void;
  onToggleOne: (id: string, checked: boolean) => void;
  onDownloadSelected: () => void;
  onOpenSendDialog: () => void;
  onConfirmDeleteSelected: () => void;
  onDownloadContrato: (c: ContratoRow) => void;
  onToggleImpresso: (c: ContratoRow) => void;
  onTogglePublicado: (c: ContratoRow) => void;
}

export function ContratosVinculadosTab({
  contratos,
  selected,
  batchStatus,
  sending,
  connected,
  deletePending,
  selectionStats,
  statsTotal,
  onToggleAll,
  onToggleOne,
  onDownloadSelected,
  onOpenSendDialog,
  onConfirmDeleteSelected,
  onDownloadContrato,
  onToggleImpresso,
  onTogglePublicado,
}: ContratosVinculadosTabProps) {
  const allChecked = contratos.length > 0 && selected.size === contratos.length;
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <Card>
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle>Contratos vinculados</CardTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Selecione contratos para enviar ao portal, baixar documentos ou
              excluir em lote.
            </p>
          </div>
          <div className="flex-1" />
          <ContratosBulkActionsBar
            selectedCount={selected.size}
            sending={sending}
            connected={connected}
            deletePending={deletePending}
            onDownload={onDownloadSelected}
            onOpenSend={onOpenSendDialog}
            onConfirmDelete={onConfirmDeleteSelected}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {contratos.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="Nenhum contrato vinculado"
            description="Os contratos associados a este processo aparecerão aqui após importação ou cadastro manual."
          />
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={
                        allChecked
                          ? true
                          : someChecked
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => onToggleAll(v === true)}
                    />
                  </TableHead>
                  <TableHead className="w-44">Contrato</TableHead>
                  <TableHead className="w-32">Início vigência</TableHead>
                  <TableHead className="w-72">Empresa</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-right">
                    Valor
                  </TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap">
                    Status
                  </TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-center">
                    Marcadores
                  </TableHead>
                  <TableHead className="text-right pr-4 w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((c) => {
                  const effectiveStatus =
                    batchStatus[c.id] ?? c.status_envio_m2a;
                  const isSelected = selected.has(c.id);
                  return (
                    <TableRow
                      key={c.id}
                      data-state={isSelected ? "selected" : undefined}
                      className="hover:bg-muted/40 dark:hover:bg-slate-800/40"
                    >
                      <TableCell className="pl-4 py-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => onToggleOne(c.id, v === true)}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="w-fit font-mono"
                        >
                          <Link to="/contratos/$id" params={{ id: c.id }}>
                            {c.numero_contrato}
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="py-2 text-[13px] tabular-nums text-muted-foreground">
                        {formatDateBR(c.data ?? c.data_texto_legado)}
                      </TableCell>
                      <TableCell
                        className="min-w-0"
                        title={c.fornecedor_nome || undefined}
                      >
                        <div className="line-clamp-2 text-sm font-medium text-foreground">
                          {c.fornecedor_nome || "Sem fornecedor"}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-0" title={c.objeto}>
                        <div className="line-clamp-2 text-sm text-foreground/85">
                          {c.objeto}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums font-medium whitespace-nowrap">
                        {BRL.format(c.valor_total)}
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap">
                        <M2AStatusBadge status={effectiveStatus} />
                      </TableCell>
                      <TableCell className="py-2 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`size-7 ${
                              c.impresso_assinado
                                ? "text-emerald-600 hover:text-emerald-700"
                                : "text-muted-foreground/50 hover:text-foreground"
                            }`}
                            title={
                              c.impresso_assinado
                                ? "Impresso/Assinado — clique para desmarcar"
                                : "Marcar como impresso/assinado"
                            }
                            onClick={() => onToggleImpresso(c)}
                          >
                            <Printer className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`size-7 ${
                              c.publicado
                                ? "text-emerald-600 hover:text-emerald-700"
                                : "text-muted-foreground/50 hover:text-foreground"
                            }`}
                            title={
                              c.publicado
                                ? "Publicado — clique para desmarcar"
                                : "Marcar como publicado"
                            }
                            onClick={() => onTogglePublicado(c)}
                          >
                            <Megaphone className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Baixar convocação e contrato"
                            onClick={() => onDownloadContrato(c)}
                          >
                            <Download className="size-3.5" />
                          </Button>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            title="Abrir contrato"
                          >
                            <Link to="/contratos/$id" params={{ id: c.id }}>
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="pl-4 py-2 text-xs text-muted-foreground"
                  >
                    {selectionStats.count > 0 ? (
                      <>
                        <b className="text-foreground">{selectionStats.count}</b>{" "}
                        selecionado(s) de {contratos.length}
                      </>
                    ) : (
                      <>
                        {contratos.length} contrato(s) — clique para selecionar
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2 tabular-nums font-semibold">
                    {BRL.format(
                      selectionStats.count > 0
                        ? selectionStats.total
                        : statsTotal,
                    )}
                  </TableCell>
                  <TableCell
                    colSpan={3}
                    className="py-2 pr-4 text-right text-[13px] text-muted-foreground"
                  >
                    {selectionStats.count > 0 ? "Soma da seleção" : "Soma total"}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
