import { memo } from "react";
import { Search, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusFilter } from "../lib";

export type SecretariasToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  duplicateCount: number;
};

function SecretariasToolbarImpl({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onExpandAll,
  onCollapseAll,
  duplicateCount,
}: SecretariasToolbarProps) {
  return (
    <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_320px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] max-w-xl flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar secretaria, dotação, fiscal, gestor ou código..."
            className="h-9 pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="inativa">Inativas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onExpandAll}>
          Expandir
        </Button>
        <Button variant="ghost" size="sm" onClick={onCollapseAll}>
          Recolher
        </Button>
      </div>

      <Card className="border-border/60 bg-card p-3 text-[13px]">
        <div className="flex items-center gap-2 font-medium">
          <UsersRound className="size-3.5 text-muted-foreground" />
          Nomes repetidos no catálogo
        </div>
        <div className="mt-1 text-muted-foreground">
          {duplicateCount === 0
            ? "Nenhum duplicado encontrado."
            : `${duplicateCount} nome(s) ainda possuem mais de um código externo.`}
        </div>
      </Card>
    </div>
  );
}

export const SecretariasToolbar = memo(SecretariasToolbarImpl);
