import { memo } from "react";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface IrpProcessoM2AProgressProps {
  visible: boolean;
  etapa?: string | null;
  mensagem?: string | null;
  percent: number;
}

/**
 * Barra de progresso inline para o envio de processo ao M2A.
 * Renderiza null quando `visible` é false — evita ocupar espaço fora do fluxo.
 */
export const IrpProcessoM2AProgress = memo(function IrpProcessoM2AProgress({
  visible,
  etapa,
  mensagem,
  percent,
}: IrpProcessoM2AProgressProps) {
  if (!visible) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        <span>Enviando processo ao M2A…</span>
        <span className="ml-auto font-mono text-[12px] text-muted-foreground">
          {clamped}%
        </span>
      </div>
      <Progress value={clamped} />
      {(etapa || mensagem) && (
        <div className="mt-2 text-[12px] text-muted-foreground">
          {etapa ? <span className="font-semibold">{etapa}</span> : null}
          {etapa && mensagem ? " · " : ""}
          {mensagem}
        </div>
      )}
    </div>
  );
});
