import { memo, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePaginatedRows } from "@/components/ui/table-pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/layout/AppShell";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import { IrpSecretariaRowActions } from "./IrpSecretariaRowActions";

/**
 * Linha normalizada usada pela tabela — o orquestrador é responsável por
 * mapear tanto `analise.resultados` quanto `resultadoSalvo.secretarias`
 * para este formato antes de repassar.
 */
export interface IrpSecretariaTableRow {
  key: string;
  numero: number;
  nome: string;
  cabecalhoColuna?: string | null;
  itens: number;
  quantidade?: number;
  valor: number;
  status: string;
  selectable: boolean;
  downloadable: boolean;
}

export interface IrpSecretariasTableProps {
  rows: IrpSecretariaTableRow[];
  selectedKeys: string[];
  allSelected: boolean;
  showQuantidade?: boolean;
  showCabecalho?: boolean;
  onToggleRow: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onDownload: (key: string) => void;
  downloadDisabled?: boolean;
}

interface RowProps {
  row: IrpSecretariaTableRow;
  selected: boolean;
  showQuantidade: boolean;
  showCabecalho: boolean;
  onToggleRow: (key: string, checked: boolean) => void;
  onDownload: (key: string) => void;
  downloadDisabled: boolean;
}

/**
 * Linha isolada + memoizada. Só re-renderiza quando muda seu próprio row/
 * selected/downloadDisabled. Callbacks vêm estáveis do pai (useCallback).
 */
const IrpSecretariasTableRow = memo(function IrpSecretariasTableRow({
  row,
  selected,
  showQuantidade,
  showCabecalho,
  onToggleRow,
  onDownload,
  downloadDisabled,
}: RowProps) {
  const handleToggle = useCallback(
    (checked: boolean | "indeterminate") => {
      onToggleRow(row.key, checked === true);
    },
    [onToggleRow, row.key],
  );

  return (
    <TableRow>
      <TableCell className="w-10">
        <Checkbox
          checked={selected}
          disabled={!row.selectable}
          onCheckedChange={handleToggle}
          aria-label={`Selecionar ${row.nome}`}
        />
      </TableCell>
      <TableCell className="w-12 font-mono text-xs">{row.numero}</TableCell>
      <TableCell className="text-[13px]">
        <div>{row.nome}</div>
        {showCabecalho && row.cabecalhoColuna ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {row.cabecalhoColuna}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="w-20 text-right font-mono text-xs">
        {formatNumber(row.itens)}
      </TableCell>
      {showQuantidade ? (
        <TableCell className="w-28 text-right font-mono text-xs">
          {formatNumber(row.quantidade ?? 0)}
        </TableCell>
      ) : null}
      <TableCell className="w-32 text-right font-mono text-xs">
        {formatBRL(row.valor)}
      </TableCell>
      <TableCell className="w-28 text-right">
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="w-24 text-right">
        <IrpSecretariaRowActions
          rowKey={row.key}
          disabled={!row.downloadable || downloadDisabled}
          onDownload={onDownload}
          ariaLabel={`Baixar planilha de ${row.nome}`}
        />
      </TableCell>
    </TableRow>
  );
});

export const IrpSecretariasTable = memo(function IrpSecretariasTable({
  rows,
  selectedKeys,
  allSelected,
  showQuantidade = false,
  showCabecalho = false,
  onToggleRow,
  onToggleAll,
  onDownload,
  downloadDisabled = false,
}: IrpSecretariasTableProps) {
  const selectedSet = new Set(selectedKeys);

  const handleToggleAll = useCallback(
    (checked: boolean | "indeterminate") => {
      onToggleAll(checked === true);
    },
    [onToggleAll],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={handleToggleAll}
                aria-label="Selecionar todas as planilhas"
              />
            </TableHead>
            <TableHead className="w-12">Nº</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead className="w-20 text-right">Itens</TableHead>
            {showQuantidade ? (
              <TableHead className="w-28 text-right">Qtd. total</TableHead>
            ) : null}
            <TableHead className="w-32 text-right">Valor est.</TableHead>
            <TableHead className="w-28 text-right">Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <IrpSecretariasTableRow
              key={row.key}
              row={row}
              selected={selectedSet.has(row.key)}
              showQuantidade={showQuantidade}
              showCabecalho={showCabecalho}
              onToggleRow={onToggleRow}
              onDownload={onDownload}
              downloadDisabled={downloadDisabled}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
});
