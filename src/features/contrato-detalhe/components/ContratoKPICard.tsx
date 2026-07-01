import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { M2AStatusBadge } from "@/features/processo-detalhe/components/M2AStatusBadge";
import { BRL, formatDateBR, type ContratoFull } from "../lib";

export interface ContratoKPICardProps {
  contrato: ContratoFull;
  valorTotal: number;
  itensCount: number;
  documentosCount: number;
  statusM2A: string;
}

export const ContratoKPICard = memo(function ContratoKPICard({
  contrato,
  valorTotal,
  itensCount,
  documentosCount,
  statusM2A,
}: ContratoKPICardProps) {
  const c = contrato.contrato;
  const contratoDataLabel = formatDateBR(c.data ?? c.data_texto_legado);

  return (
    <Card className="mb-3 overflow-hidden border-border/60">
      <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-2 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Número do contrato
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="truncate font-mono text-2xl font-semibold tracking-tight text-foreground">
                  {c.numero_contrato}
                </p>
                {contrato.processo && (
                  <Link
                    to="/processos/$id"
                    params={{ id: contrato.processo.id }}
                    className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    title="Abrir processo"
                  >
                    Processo {contrato.processo.numero_processo ?? ""}
                  </Link>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
              <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Início vigência
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {contratoDataLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <M2AStatusBadge status={statusM2A} />
          </div>
          <p className="text-[13px] text-muted-foreground">
            Preposto: <span className="text-foreground">{c.preposto}</span> ·
            Fiscal: <span className="text-foreground">{c.fiscal}</span>
          </p>
        </div>
        <div className="grid grid-cols-3 border-t border-border/60 bg-muted/40 dark:bg-muted/30 lg:grid-cols-3 lg:border-l lg:border-t-0">
          <div className="border-r border-border/60 px-4 py-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Valor
            </p>
            <p className="text-base font-semibold tabular-nums">
              {BRL.format(valorTotal)}
            </p>
          </div>
          <div className="border-r border-border/60 px-4 py-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Itens
            </p>
            <p className="text-base font-semibold tabular-nums">{itensCount}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Anexos
            </p>
            <p className="text-base font-semibold tabular-nums">
              {documentosCount}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
});
