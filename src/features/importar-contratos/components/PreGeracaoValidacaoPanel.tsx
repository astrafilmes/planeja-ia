import { memo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValidacaoPreGeracao, ValidacaoProgress } from "../hooks/useValidacaoPreGeracao";

const PAGE_SIZE = 25;

function PaginatedList<T>({
  items,
  renderItem,
  maxHeight = "max-h-72",
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  maxHeight?: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const start = current * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  return (
    <>
      <ul className={`mt-2 list-disc overflow-auto pl-4 text-[12px] ${maxHeight}`}>
        {slice.map((item, i) => renderItem(item, start + i))}
      </ul>
      {items.length > PAGE_SIZE && (
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, items.length)} de {items.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span className="px-1">
              {current + 1} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={current >= totalPages - 1}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

type Props = {
  busy: boolean;
  result: ValidacaoPreGeracao | null;
  progress?: ValidacaoProgress;
  onValidar: () => void;
  disabled?: boolean;
};

export const PreGeracaoValidacaoPanel = memo(function PreGeracaoValidacaoPanel({
  busy,
  result,
  progress,
  onValidar,
  disabled,
}: Props) {
  const ataUrl = (ataId?: string | number | null) =>
    ataId ? `http://precodereferencia.m2atecnologia.com.br/ata_registro_precos/${ataId}/` : null;
  const participanteUrl = (participanteId?: string | number | null) =>
    participanteId
      ? `http://precodereferencia.m2atecnologia.com.br/ata_registro_precos/unidades_participantes/unidades_gestoras/incluir/${participanteId}/`
      : null;
  const contratoUrl = (contratoId?: string | number | null) =>
    contratoId ? `http://precodereferencia.m2atecnologia.com.br/contratos/${contratoId}/` : null;
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
            <PaginatedList
              items={result.saldos.ajustados}
              renderItem={(s, i) => (
                <li key={i}>
                  <strong>{s.contratoLabel}</strong> · item {s.numero ?? "?"} ·{" "}
                  {s.quantidadeSolicitada} → <strong>{s.saldoDisponivel}</strong>
                </li>
              )}
              maxHeight="max-h-60"
            />
          </details>
        )}

        {result && result.saldos.bloqueados.length > 0 && (
          <details className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5" open>
            <summary className="cursor-pointer text-[12px] font-medium text-destructive">
              {result.saldos.bloqueados.length} item(ns) bloqueados por saldo
            </summary>
            <PaginatedList
              items={result.saldos.bloqueados}
              renderItem={(s, i) => (
                <li key={i}>
                  <strong>{s.contratoLabel}</strong> ·{" "}
                  {ataUrl(s.ataId) ? (
                    <a
                      href={ataUrl(s.ataId)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      Ata {s.ataNumero ?? s.ataId}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <>Ata {s.ataNumero ?? s.ataId}</>
                  )}{" "}
                  · item {s.numero ?? "?"} ·{" "}
                  pedido {s.quantidadeSolicitada}
                  {s.cota != null && ` · cota ${s.cota}`}
                  {s.consumido != null && ` · já contratado ${s.consumido}`}
                  {" · saldo "}
                  {s.saldoDisponivel ?? "?"}
                  {s.acao === "bloquear_manual" &&
                    " · possui múltiplas dotações — ajuste a quantidade manualmente por dotação"}
                  {s.acao === "bloquear_sem_saldo" && " · saldo esgotado"}
                  {s.contratosConsumidores && s.contratosConsumidores.length > 0 && (
                    <span className="block pl-3 pt-1 text-muted-foreground">
                      Consumo encontrado: {s.contratosConsumidores.slice(0, 4).map((c, index) => (
                        <span key={`${c.contratoId}-${index}`}>
                          {index > 0 ? ", " : ""}
                          {contratoUrl(c.contratoId) ? (
                            <a
                              href={contratoUrl(c.contratoId)!}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                            >
                              {c.numeroContrato || `Contrato ${c.contratoId}`}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            c.numeroContrato || `Contrato ${c.contratoId}`
                          )}
                          {c.quantidade != null ? ` (${c.quantidade})` : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              )}
            />
          </details>
        )}

        {result && result.saldos.avisos.length > 0 && (
          <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
            <summary className="cursor-pointer text-[12px] font-medium text-amber-900 dark:text-amber-200">
              {result.saldos.avisos.length} aviso(s) na leitura de consumo
            </summary>
            <ul className="mt-2 max-h-36 list-disc overflow-auto pl-4 text-[12px]">
              {result.saldos.avisos.slice(0, 20).map((a, i) => (
                <li key={i}>
                  {ataUrl(a.ataId) ? (
                    <a
                      href={ataUrl(a.ataId)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      Ata {a.ataNumero ?? a.ataId}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <>Ata {a.ataNumero ?? a.ataId}</>
                  )}
                  {a.contratoId && (
                    <>
                      {" · "}
                      <a
                        href={contratoUrl(a.contratoId)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        {a.numeroContrato || `Contrato ${a.contratoId}`}
                        <ExternalLink className="size-3" />
                      </a>
                    </>
                  )}
                  {" — "}{a.mensagem}
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
                  {ataUrl(p.ataId) ? (
                    <a
                      href={ataUrl(p.ataId)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Ata {p.ataNumero ?? p.ataId}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <strong>Ata {p.ataNumero ?? p.ataId}</strong>
                  )}{" "}
                  ·{" "}
                  <strong>{p.nome}</strong> · {p.status}
                  {p.mensagem ? ` — ${p.mensagem}` : ""}
                  {participanteUrl(p.participanteId) && (
                    <>
                      {" · "}
                      <a
                        href={participanteUrl(p.participanteId)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        Abrir inclusão da UG
                        <ExternalLink className="size-3" />
                      </a>
                    </>
                  )}
                </li>
              ))}

            </ul>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Corrija diretamente no M2A (cadastre a UG equivalente na ata do
              exercício) e clique em <strong>Revalidar</strong>.
            </p>
          </details>
        )}

        {busy && progress && progress.phase !== "idle" && progress.totalAtas > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-primary">
              <Loader2 className="size-3.5 animate-spin" />
              {progress.phase === "saldos"
                ? `Consultando saldos... (${progress.saldosDone}/${progress.totalAtas} atas)`
                : `Verificando participantes... (${progress.participantesDone}/${progress.totalAtas} atas)`}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.round(
                    ((progress.phase === "saldos"
                      ? progress.saldosDone
                      : progress.totalAtas + progress.participantesDone) /
                      (progress.totalAtas * 2)) *
                      100,
                  )}%`,
                }}
              />
            </div>
          </div>
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
