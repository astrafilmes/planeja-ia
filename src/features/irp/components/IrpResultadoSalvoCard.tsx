import { formatBRL, formatNumber } from "@/lib/utils/normalize";
import type { IrpJob } from "../lib";

export interface IrpResultadoSalvoCardProps {
  job: IrpJob;
  temZip: boolean;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

export function IrpResultadoSalvoCard({
  job,
  temZip,
}: IrpResultadoSalvoCardProps) {
  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Unidades"
          value={formatNumber(job.total_secretarias ?? 0)}
        />
        <Metric
          label="Com itens"
          value={`${formatNumber(job.secretarias_com_itens ?? 0)}/${formatNumber(job.total_secretarias ?? 0)}`}
        />
        <Metric label="Itens" value={formatNumber(job.total_linhas ?? 0)} />
        <Metric
          label="Valor estimado"
          value={formatBRL(Number(job.total_valor ?? 0))}
        />
      </div>

      {!temZip && (
        <p className="mt-3 text-xs text-muted-foreground">
          Processamentos antigos podem ter apenas o resumo salvo. Novas
          importações gravam os arquivos para download posterior.
        </p>
      )}
    </div>
  );
}
