import { memo } from "react";
import { Badge } from "@/components/ui/badge";

export type SecretariasStatsBarProps = {
  groupCount: number;
  filteredCount: number;
  totalCount: number;
};

function SecretariasStatsBarImpl({
  groupCount,
  filteredCount,
  totalCount,
}: SecretariasStatsBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
      <Badge variant="secondary">{groupCount} grupo(s)</Badge>
      <Badge variant="outline">
        {filteredCount} de {totalCount} dotação(ões)
      </Badge>
      <span>
        A edição do grupo aplica Unidade Gestora, Fiscal e Gestor em todas as
        dotações vinculadas.
      </span>
    </div>
  );
}

export const SecretariasStatsBar = memo(SecretariasStatsBarImpl);
