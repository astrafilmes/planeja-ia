import { memo, useCallback } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface IrpSecretariaRowActionsProps {
  rowKey: string;
  disabled?: boolean;
  onDownload: (rowKey: string) => void;
  ariaLabel?: string;
}

/**
 * Ações inline por linha da tabela de secretarias.
 * Memoizado + callback estável para não disparar re-render em toda a árvore
 * quando o pai atualiza estados não relacionados (ex.: seleção).
 */
export const IrpSecretariaRowActions = memo(function IrpSecretariaRowActions({
  rowKey,
  disabled,
  onDownload,
  ariaLabel,
}: IrpSecretariaRowActionsProps) {
  const handleClick = useCallback(() => {
    onDownload(rowKey);
  }, [onDownload, rowKey]);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={handleClick}
      aria-label={ariaLabel ?? "Baixar planilha"}
    >
      <Download className="size-4" />
    </Button>
  );
});
