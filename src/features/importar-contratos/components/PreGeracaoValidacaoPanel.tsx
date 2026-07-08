import { memo } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValidacaoPreGeracao } from "../hooks/useValidacaoPreGeracao";

type Props = {
  busy: boolean;
  result: ValidacaoPreGeracao | null;
  onValidar: () => void;
  disabled?: boolean;
};

export const PreGeracaoValidacaoPanel = memo(function PreGeracaoValidacaoPanel({
  busy,
  result,
  onValidar,
  disabled,
}: Props) {
  const totalAjustes = result?.saldos.ajustados.length ?? 0;
  const totalBloqueiosSaldo = result?.saldos.bloqueados.length ?? 0;
  const totalNaoVerificado = result?.saldos.naoVerificados.length ?? 0;
  const totalBloqueiosSecretaria = result?.participantes.bloqueadas.length ?? 0;
  const hasBlockers = result?.hasBlockers ?? false;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[15px]">
          <ShieldAlert className="size-4" /> Validação pré-geração
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-[13px]">
        <p className="text-muted-foreground">
          Consulta o saldo real de cada ata no M2A e garante que todas as
          secretarias envolvidas estão incluídas como participantes.
          Enquanto houver bloqueios, a autorização abaixo fica desabilitada.
        </p>

        {result && (
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-card p-2.5">
              <div className="text-[12px] uppercase text-muted-foreground">Saldos</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="secondary">{result.saldos.ok} OK</Badge>
                {totalAjustes > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    {totalAjustes} ajustados
                  </Badge>
                )}
                {totalBloqueiosSaldo > 0 && (
                  <Badge variant="destructive">{totalBloqueiosSaldo} bloqueados</Badge>
                )}
                {totalNaoVerificado > 0 && (
                  <Badge variant="outline">{totalNaoVerificado} não verificados</Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-2.5">
              <div className="text-[12px] uppercase text-muted-foreground">
                Unidades gestoras
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {totalBloqueiosSecretaria === 0 ? (
                  <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                    Todas OK
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    {totalBloqueiosSecretaria} bloqueadas
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card p-2.5">
              <div className="text-[12px] uppercase text-muted-foreground">Status</div>
              <div className="mt-1">
                {hasBlockers ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="size-3" /> Corrija antes de gerar
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="size-3" /> Pronto para gerar
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {result && result.saldos.ajustados.length > 0 && (
          <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <summary className="cursor-pointer text-[12px] font-medium text-amber-900 dark:text-amber-200">
              {result.saldos.ajustados.length} item(ns) serão ajustados para o saldo disponível
            </summary>
            <ul className="mt-2 max-h-40 list-disc overflow-auto pl-4 text-[12px]">
              {result.saldos.ajustados.slice(0, 30).map((s, i) => (
                <li key={i}>
                  <strong>{s.contratoLabel}</strong> · item {s.numero ?? "?"} ·{" "}
                  {s.quantidadeSolicitada} → <strong>{s.saldoDisponivel}</strong>
                </li>
              ))}
            </ul>
          </details>
        )}

        {result && result.saldos.bloqueados.length > 0 && (
          <details className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5" open>
            <summary className="cursor-pointer text-[12px] font-medium text-destructive">
              {result.saldos.bloqueados.length} item(ns) bloqueados por saldo
            </summary>
            <ul className="mt-2 max-h-48 list-disc overflow-auto pl-4 text-[12px]">
              {result.saldos.bloqueados.slice(0, 30).map((s, i) => (
                <li key={i}>
                  <strong>{s.contratoLabel}</strong> · item {s.numero ?? "?"} ·{" "}
                  pedido {s.quantidadeSolicitada}
                  {s.cota != null && ` · cota ${s.cota}`}
                  {s.consumido != null && ` · já contratado ${s.consumido}`}
                  {" · saldo "}
                  {s.saldoDisponivel ?? "?"}
                  {s.acao === "bloquear_manual" &&
                    " · possui múltiplas dotações — ajuste a quantidade manualmente por dotação"}
                  {s.acao === "bloquear_sem_saldo" && " · saldo esgotado"}
                </li>
              ))}
            </ul>
          </details>
        )}

        {result && result.participantes.bloqueadas.length > 0 && (
          <details className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5" open>
            <summary className="cursor-pointer text-[12px] font-medium text-destructive">
              {result.participantes.bloqueadas.length} secretaria(s) sem
              vinculação na ata
            </summary>
            <ul className="mt-2 max-h-40 list-disc overflow-auto pl-4 text-[12px]">
              {result.participantes.bloqueadas.slice(0, 20).map((p, i) => (
                <li key={i}>
                  <strong>{p.nome}</strong> · {p.status}
                  {p.mensagem ? ` — ${p.mensagem}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Corrija diretamente no M2A (cadastre a UG equivalente na ata do
              exercício) e clique em <strong>Revalidar</strong>.
            </p>
          </details>
        )}

        <Button
          type="button"
          variant={result ? "outline" : "default"}
          onClick={onValidar}
          disabled={busy || disabled}
          className="w-full"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {result ? "Revalidar" : "Validar antes de gerar"}
        </Button>
      </CardContent>
    </Card>
  );
});
