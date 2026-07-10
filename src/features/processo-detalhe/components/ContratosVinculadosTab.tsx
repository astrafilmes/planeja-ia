import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpDown,
  Download,
  ExternalLink,
  FileSignature,
  Megaphone,
  Printer,
  Search,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  onToggleAll: (checked: boolean, ids?: string[]) => void;
  onToggleOne: (id: string, checked: boolean) => void;
  onDownloadSelected: () => void;
  onOpenSendDialog: () => void;
  onConfirmDeleteSelected: () => void;
  onDownloadContrato: (c: ContratoRow) => void;
  onToggleImpresso: (c: ContratoRow) => void;
  onTogglePublicado: (c: ContratoRow) => void;
}

type SortKey =
  | "numero_asc"
  | "numero_desc"
  | "valor_desc"
  | "valor_asc"
  | "secretaria"
  | "status";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "sucesso", label: "Sucesso" },
  { value: "erro", label: "Erro" },
  { value: "processando", label: "Processando" },
  { value: "pendente", label: "Pendente" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "numero_asc", label: "Número (crescente)" },
  { value: "numero_desc", label: "Número (decrescente)" },
  { value: "valor_desc", label: "Maior valor" },
  { value: "valor_asc", label: "Menor valor" },
  { value: "secretaria", label: "Secretaria (A–Z)" },
  { value: "status", label: "Status de envio" },
];

function normalizeStatus(effective: string | null | undefined) {
  const s = String(effective ?? "pendente").toLowerCase();
  if (s === "sucesso" || s === "erro" || s === "processando") return s;
  return "pendente";
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
  const [search, setSearch] = useState("");
  const [secretariaFilter, setSecretariaFilter] = useState("all");
  const [ataFilter, setAtaFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("numero_asc");

  const secretariaOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contratos) {
      const key = c.secretaria_sigla || c.secretaria_nome || "—";
      if (!map.has(key)) map.set(key, key);
    }
    return [...map.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contratos]);

  const ataOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contratos) {
      if (c.m2a_ata_numero) set.add(c.m2a_ata_numero);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [contratos]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = contratos.filter((c) => {
      if (secretariaFilter !== "all") {
        const key = c.secretaria_sigla || c.secretaria_nome || "—";
        if (key !== secretariaFilter) return false;
      }
      if (ataFilter !== "all" && c.m2a_ata_numero !== ataFilter) return false;
      if (statusFilter !== "all") {
        const eff = normalizeStatus(batchStatus[c.id] ?? c.status_envio_m2a);
        if (eff !== statusFilter) return false;
      }
      if (q) {
        const hay = [
          c.numero_contrato,
          c.fornecedor_nome,
          c.objeto,
          c.secretaria_sigla,
          c.secretaria_nome,
          c.m2a_ata_numero,
          c.preposto,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const cmp = (a: ContratoRow, b: ContratoRow) => {
      switch (sortKey) {
        case "numero_desc":
          return b.numero_contrato.localeCompare(a.numero_contrato, "pt-BR", {
            numeric: true,
          });
        case "valor_desc":
          return (b.valor_total ?? 0) - (a.valor_total ?? 0);
        case "valor_asc":
          return (a.valor_total ?? 0) - (b.valor_total ?? 0);
        case "secretaria":
          return (a.secretaria_sigla || "").localeCompare(
            b.secretaria_sigla || "",
            "pt-BR",
          );
        case "status": {
          const order = ["erro", "processando", "pendente", "sucesso"];
          const ai = order.indexOf(
            normalizeStatus(batchStatus[a.id] ?? a.status_envio_m2a),
          );
          const bi = order.indexOf(
            normalizeStatus(batchStatus[b.id] ?? b.status_envio_m2a),
          );
          return ai - bi;
        }
        case "numero_asc":
        default:
          return a.numero_contrato.localeCompare(b.numero_contrato, "pt-BR", {
            numeric: true,
          });
      }
    };
    return [...list].sort(cmp);
  }, [contratos, search, secretariaFilter, ataFilter, statusFilter, sortKey, batchStatus]);

  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  );
  const allChecked =
    visible.length > 0 && visibleSelectedCount === visible.length;
  const someChecked = visibleSelectedCount > 0 && !allChecked;

  const visibleTotal = useMemo(
    () => visible.reduce((s, c) => s + (c.valor_total ?? 0), 0),
    [visible],
  );

  const filtersActive =
    !!search ||
    secretariaFilter !== "all" ||
    ataFilter !== "all" ||
    statusFilter !== "all";

  const {
    paginated: paginatedVisible,
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    total,
  } = usePaginatedRows(visible, 25);

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

        {contratos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por contrato, empresa, objeto..."
                className="h-9 pl-8"
              />
            </div>

            <Select value={secretariaFilter} onValueChange={setSecretariaFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Secretaria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as secretarias</SelectItem>
                {secretariaOptions.map((sig) => (
                  <SelectItem key={sig} value={sig}>
                    {sig}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ataFilter} onValueChange={setAtaFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Ata" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as atas</SelectItem>
                {ataOptions.map((n) => (
                  <SelectItem key={n} value={n}>
                    Ata {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sortKey}
              onValueChange={(v) => setSortKey(v as SortKey)}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <ArrowUpDown className="mr-1 size-3.5" />
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setSearch("");
                  setSecretariaFilter("all");
                  setAtaFilter("all");
                  setStatusFilter("all");
                }}
              >
                <X className="mr-1 size-3.5" />
                Limpar
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {contratos.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="Nenhum contrato vinculado"
            description="Os contratos associados a este processo aparecerão aqui após importação ou cadastro manual."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="Nenhum contrato corresponde aos filtros"
            description="Ajuste os filtros ou limpe a busca para ver os contratos deste processo."
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
                      onCheckedChange={(v) =>
                        onToggleAll(v === true, visibleIds)
                      }
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
                {visible.map((c) => {
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
                        selecionado(s)
                        {filtersActive
                          ? ` — ${visible.length} visível(is) de ${contratos.length}`
                          : ` de ${contratos.length}`}
                      </>
                    ) : filtersActive ? (
                      <>
                        {visible.length} de {contratos.length} contrato(s)
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
                        : filtersActive
                          ? visibleTotal
                          : statsTotal,
                    )}
                  </TableCell>
                  <TableCell
                    colSpan={3}
                    className="py-2 pr-4 text-right text-[13px] text-muted-foreground"
                  >
                    {selectionStats.count > 0
                      ? "Soma da seleção"
                      : filtersActive
                        ? "Soma filtrada"
                        : "Soma total"}
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
