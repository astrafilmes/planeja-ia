import { memo } from "react";

export interface IrpMetricProps {
  label: string;
  value: string;
}

/**
 * Cartão de métrica reutilizado nos resumos IRP (análise e resultado salvo).
 * Puro, sem estado — memoizado para evitar re-renders desnecessários quando
 * usado em grids com muitas métricas.
 */
export const IrpMetric = memo(function IrpMetric({ label, value }: IrpMetricProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
      <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
});
