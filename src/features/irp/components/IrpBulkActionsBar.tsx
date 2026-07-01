import { memo } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface IrpBulkActionsBarProps {
  title: string;
  selectedCount: number;
  totalCount: number;
  missingCount: number;
  onBaixarZip: () => void;
  baixarZipDisabled?: boolean;
}

/**
 * Barra fina exibida acima da tabela — mostra contagem selecionada e
 * o botão "Baixar .zip". Estado enviado 100% via props (dumb).
 */
export const IrpBulkActionsBar = memo(function IrpBulkActionsBar({
  title,
  selectedCount,
  totalCount,
  missingCount,
  onBaixarZip,
  baixarZipDisabled,
}: IrpBulkActionsBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 dark:bg-muted/30">
      <div className="flex flex-col text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground">{title}</span>
        <span>
          {selectedCount} de {totalCount} planilha(s) selecionada(s)
          {missingCount > 0
            ? ` · ${missingCount} sem cadastro M2A`
            : ""}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onBaixarZip}
        disabled={baixarZipDisabled}
      >
        <Package className="size-4" /> Baixar .zip
      </Button>
    </div>
  );
});
