import { formatBRL, formatNumber } from "@/lib/utils/normalize";

export interface IrpMetricItem {
  label: string;
  value: string;
}

export interface IrpAnaliseSummaryProps {
  totalUnidades: number;
  comItens: number;
  totalItens: number;
  totalQuantidade: number;
  totalValor: number;
}

function Metric({ label, value }: IrpMetricItem) {
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
}

export function IrpAnaliseSummary({
  totalUnidades,
  comItens,
  totalItens,
  totalQuantidade,
  totalValor,
}: IrpAnaliseSummaryProps) {
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Unidades" value={formatNumber(totalUnidades)} />
      <Metric label="Com itens" value={formatNumber(comItens)} />
      <Metric label="Itens" value={formatNumber(totalItens)} />
      <Metric label="Qtd. total" value={formatNumber(totalQuantidade)} />
      <Metric label="Valor estimado" value={formatBRL(totalValor)} />
    </div>
  );
}
