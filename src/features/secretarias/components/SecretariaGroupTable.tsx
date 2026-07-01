import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { M2AServidor } from "@/hooks/useM2ACatalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { EnrichedSec, SecretariaGroup } from "../lib";

export type SecretariaGroupTableProps = {
  group: SecretariaGroup;
  onEditRow: (row: EnrichedSec) => void;
  onDeleteRow: (row: EnrichedSec) => void;
};

type ActorCellProps = {
  actor: M2AServidor | null | undefined;
  fallbackName: string | null | undefined;
};

const ActorCell = memo(function ActorCell({
  actor,
  fallbackName,
}: ActorCellProps) {
  if (!actor && !fallbackName) {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = actor?.nome ?? fallbackName ?? "";
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" title={label}>
        {label}
      </div>
    </div>
  );
});

type GroupRowProps = {
  row: EnrichedSec;
  isPrincipal: boolean;
  onEditRow: (row: EnrichedSec) => void;
  onDeleteRow: (row: EnrichedSec) => void;
};

const GroupRow = memo(function GroupRow({
  row,
  isPrincipal,
  onEditRow,
  onDeleteRow,
}: GroupRowProps) {
  return (
    <TableRow className={cn(!row.ativa && "opacity-50")}>
      <TableCell className="font-mono text-xs">{row.numero}</TableCell>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {row.sigla}
        </Badge>
      </TableCell>
      <TableCell className="min-w-[320px]">
        <div className="truncate text-sm font-medium" title={row.nome}>
          {row.nome}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {row.m2a_dotacao_default && (
            <span className="font-mono">{row.m2a_dotacao_default}</span>
          )}
          {row.m2a_dot_orgao_id && (
            <span className="font-mono">ORG DOT {row.m2a_dot_orgao_id}</span>
          )}
          {row.m2a_uo_id && (
            <span className="font-mono">UO {row.m2a_uo_id}</span>
          )}
          {row.m2a_dot_id && (
            <span className="font-mono">DOT {row.m2a_dot_id}</span>
          )}
          {isPrincipal && (
            <span className="font-medium text-foreground/85">Principal</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <ActorCell actor={row.fiscal} fallbackName={row.m2a_fiscal_nome} />
      </TableCell>
      <TableCell>
        <ActorCell actor={row.gestor} fallbackName={row.m2a_gestor_nome} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onEditRow(row)}
            aria-label="Editar dotação"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onDeleteRow(row)}
            aria-label="Remover dotação"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

function SecretariaGroupTableImpl({
  group,
  onEditRow,
  onDeleteRow,
}: SecretariaGroupTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Nº</TableHead>
          <TableHead className="w-24">Sigla</TableHead>
          <TableHead>Secretaria / dotação</TableHead>
          <TableHead className="w-64">Fiscal</TableHead>
          <TableHead className="w-64">Gestor</TableHead>
          <TableHead className="w-24 text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {group.rows.map((row) => (
          <GroupRow
            key={row.id}
            row={row}
            isPrincipal={row.id === group.principal.id}
            onEditRow={onEditRow}
            onDeleteRow={onDeleteRow}
          />
        ))}
      </TableBody>
    </Table>
  );
}

export const SecretariaGroupTable = memo(SecretariaGroupTableImpl);
