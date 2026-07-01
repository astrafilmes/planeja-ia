import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Metric } from "@/components/importar/ImportarHelpers";
import { formatBRL, formatNumber } from "@/lib/utils/normalize";

type Props = {
  fornecedoresUnicos: string[];
  fallbackEmpresa: string | null;
  itensValidosCount: number;
  contratosSelecionadosCount: number;
  contratosPreliminaresCount: number;
  contratosDesmarcadosCount: number;
  totalValor: number;
  itensSemValor: number;
};

/**
 * Barra superior com 4 métricas + banner de aviso quando existem itens sem valor.
 */
export const ImportSummaryBar = memo(function ImportSummaryBar({
  fornecedoresUnicos,
  fallbackEmpresa,
  itensValidosCount,
  contratosSelecionadosCount,
  contratosPreliminaresCount,
  contratosDesmarcadosCount,
  totalValor,
  itensSemValor,
}: Props) {
  return (
    <>
      <Card className="border-border/60">
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <Metric
            label={
              fornecedoresUnicos.length > 1
                ? `Fornecedores (${fornecedoresUnicos.length})`
                : "Fornecedor"
            }
            value={
              fornecedoresUnicos.length === 0
                ? (fallbackEmpresa ?? "—")
                : fornecedoresUnicos.length === 1
                  ? fornecedoresUnicos[0]
                  : fornecedoresUnicos.join(" · ")
            }
          />
          <Metric label="Itens válidos" value={formatNumber(itensValidosCount)} />
          <Metric
            label="Contratos a gerar"
            value={
              contratosDesmarcadosCount > 0
                ? `${formatNumber(contratosSelecionadosCount)} / ${formatNumber(contratosPreliminaresCount)}`
                : formatNumber(contratosPreliminaresCount)
            }
            highlight
          />
          <Metric label="Valor total" value={formatBRL(totalValor)} highlight />
        </CardContent>
      </Card>

      {itensSemValor > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-4 text-amber-600 mt-0.5" />
          <div>
            <strong>{itensSemValor}</strong> item(ns) sem valor unitário.
            Edite-os na aba "Itens" antes de autorizar — caso contrário ficarão
            com valor zero.
          </div>
        </div>
      )}
    </>
  );
});
