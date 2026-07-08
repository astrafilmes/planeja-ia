import { memo } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatBRL } from "@/lib/utils/normalize";
import type { ContratoPreliminar } from "@/lib/contratoImport";
import type {
  FornecedorPrepostoTarget,
  ProcessoMin,
  SecretariaM2A,
} from "../lib";

type ValidacaoContratos = {
  duplicados: Array<{
    contratoKey: string;
    contratoLabel: string;
    numero: string;
    ocorrencias: number;
  }>;
  semNumero: Array<{ contratoKey: string; contratoLabel: string; qtd: number }>;
  semDescricao: Array<{ contratoKey: string; contratoLabel: string; qtd: number }>;
  hasErros: boolean;
};

type Props = {
  isAutorizado: boolean;
  contratosPreliminaresCount: number;
  contratosSelecionados: ContratoPreliminar[];
  contratosSemAtaM2A: ContratoPreliminar[];
  contratosSemCadastroM2A: Array<{
    contrato: ContratoPreliminar;
    secretaria?: SecretariaM2A | null;
  }>;
  contratosDesmarcados: Set<string>;
  fornecedoresPrepostoTargets: FornecedorPrepostoTarget[];
  fornecedoresSemPreposto: FornecedorPrepostoTarget[];
  fornecedorMapFromDb: Map<string, string>;
  prepostosByFornecedor: Record<string, string>;
  onChangePreposto: (key: string, value: string) => void;
  processoVinculado: ProcessoMin | null;
  totalValor: number;
  totalItens: number;
  busy: boolean;
  dataBatch: string;
  onChangeDataBatch: (value: string) => void;
  onAutorizar: () => void;
  validacaoContratos: ValidacaoContratos;
  /** Se true, a validação pré-geração (saldo + participantes) já foi executada. */
  preGeracaoValidada?: boolean;
  /** Se true, a validação pré-geração encontrou bloqueios. */
  preGeracaoBloqueada?: boolean;
};

/**
 * Painel de "Autorizar geração": exibe o processo vinculado (definido no
 * upload), coleta prepostos por fornecedor, mostra pré-checagem e libera
 * a autorização final. Todos os dados do lote (nº, objeto, data) vêm do
 * processo cadastrado — não são editados aqui.
 */
export const AutorizarGeracaoPanel = memo(function AutorizarGeracaoPanel({
  isAutorizado,
  contratosPreliminaresCount,
  contratosSelecionados,
  contratosSemAtaM2A,
  contratosSemCadastroM2A,
  contratosDesmarcados,
  fornecedoresPrepostoTargets,
  fornecedoresSemPreposto,
  fornecedorMapFromDb,
  prepostosByFornecedor,
  onChangePreposto,
  processoVinculado,
  totalValor,
  totalItens,
  busy,
  dataBatch,
  onChangeDataBatch,
  onAutorizar,
  validacaoContratos,
  preGeracaoValidada = false,
  preGeracaoBloqueada = false,
}: Props) {
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dataBatch);
  const disableBtn =
    busy ||
    !processoVinculado ||
    !dataValida ||
    contratosSelecionados.length === 0 ||
    contratosSemCadastroM2A.length > 0 ||
    fornecedoresSemPreposto.length > 0 ||
    contratosSemAtaM2A.length > 0 ||
    validacaoContratos.hasErros ||
    !preGeracaoValidada ||
    preGeracaoBloqueada;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          {isAutorizado ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-500" /> Importação já
              autorizada
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" /> Autorizar geração no sistema
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isAutorizado ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-900 dark:text-emerald-200">
            <strong>{contratosPreliminaresCount}</strong> contratos já foram
            gerados a partir desta importação. Veja-os em{" "}
            <strong>/contratos</strong>.
          </div>
        ) : (
          <>
            {/* Processo vinculado (somente leitura) */}
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
              <div className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Processo vinculado
              </div>
              {processoVinculado ? (
                <div className="grid gap-1 text-[13px] text-foreground">
                  <div>
                    <span className="text-muted-foreground">Nº:</span>{" "}
                    <strong>
                      {processoVinculado.numero_processo ?? "(sem nº)"}
                    </strong>
                    {processoVinculado.m2a_processo_id && (
                      <span className="ml-2 text-muted-foreground">
                        · Código M2A #{processoVinculado.m2a_processo_id}
                      </span>
                    )}
                  </div>
                  {processoVinculado.objeto && (
                    <div className="text-muted-foreground">
                      {processoVinculado.objeto}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[13px] text-destructive">
                  Este job não está vinculado a um processo. Faça uma nova
                  importação para vincular um processo válido.
                </div>
              )}
            </div>

            {/* Data base do lote */}
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-3">
              <Label htmlFor="autorizar-data-base" className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Data base do lote *
              </Label>
              <Input
                id="autorizar-data-base"
                type="date"
                value={dataBatch}
                onChange={(event) => onChangeDataBatch(event.target.value)}
                className="h-9 text-[13px]"
              />
              <p className="text-[12px] text-muted-foreground">
                Será usada como data de todos os contratos gerados neste lote.
              </p>
              {!dataValida && (
                <p className="text-[12px] text-destructive">
                  Informe uma data válida (AAAA-MM-DD).
                </p>
              )}
            </div>

            {/* Prepostos por fornecedor */}
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Preposto por fornecedor
              </div>
              {fornecedoresPrepostoTargets.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Nenhum fornecedor identificado para os contratos deste lote.
                </p>
              ) : (
                <div className="flex max-h-56 flex-col gap-2 overflow-auto pr-1">
                  {fornecedoresPrepostoTargets.map((target) => {
                    const hasSaved = !!fornecedorMapFromDb.get(target.key);
                    const prepostoValue =
                      prepostosByFornecedor[target.key] ?? "";
                    return (
                      <div
                        key={target.key}
                        className="grid gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2 md:grid-cols-[1fr_260px]"
                      >
                        <div className="min-w-0">
                          <div
                            className="truncate text-xs font-medium text-foreground"
                            title={target.fornecedorNome}
                          >
                            {target.fornecedorNome}
                          </div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground">
                            {target.contratos} contrato(s)
                            {hasSaved ? " · cadastro existente" : ""}
                          </div>
                        </div>
                        <Input
                          value={prepostoValue}
                          onChange={(event) =>
                            onChangePreposto(target.key, event.target.value)
                          }
                          placeholder="Nome do preposto"
                          className="h-9 text-[13px]"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator className="my-1" />

            {/* Pré-checagem */}
            <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px] text-muted-foreground">
              <div className="font-medium text-foreground">Pré-checagem</div>
              <div className="mt-1">
                {contratosSelecionados.length - contratosSemCadastroM2A.length}{" "}
                de {contratosSelecionados.length} contrato(s) com cadastro
                completo
                {contratosDesmarcados.size > 0
                  ? ` (${contratosDesmarcados.size} desmarcado(s))`
                  : ""}
                .
              </div>
              <div className="mt-1">
                {fornecedoresPrepostoTargets.length -
                  fornecedoresSemPreposto.length}{" "}
                de {fornecedoresPrepostoTargets.length} fornecedor(es) com
                preposto definido.
              </div>
              {contratosSemCadastroM2A.length > 0 && (
                <div className="mt-2 text-destructive">
                  {contratosSemCadastroM2A.length} contrato(s) precisam de
                  ajuste em /secretarias antes da geração.
                </div>
              )}
              {fornecedoresSemPreposto.length > 0 && (
                <div className="mt-2 text-destructive">
                  {fornecedoresSemPreposto.length} fornecedor(es) ainda estão
                  sem preposto informado.
                </div>
              )}
              {contratosSemAtaM2A.length > 0 && (
                <div className="mt-2 text-destructive">
                  {contratosSemAtaM2A.length} contrato(s) ainda estão sem ata
                  definida.
                </div>
              )}
            </div>

            {validacaoContratos.hasErros && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px] text-destructive">
                <div className="font-medium">
                  Erros na planilha impedem a geração
                </div>
                <p className="mt-1 text-[12px] opacity-90">
                  Corrija os itens abaixo em <strong>Itens da planilha</strong> ou
                  reimporte a planilha antes de autorizar.
                </p>
                {validacaoContratos.duplicados.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[12px] font-medium">
                      Numeração duplicada ({validacaoContratos.duplicados.length})
                    </div>
                    <ul className="mt-1 max-h-32 list-disc overflow-auto pl-4 text-[12px]">
                      {validacaoContratos.duplicados.slice(0, 20).map((d, idx) => (
                        <li key={`dup-${idx}`}>
                          Nº <strong>{d.numero}</strong> aparece {d.ocorrencias}×
                          em {d.contratoLabel}
                        </li>
                      ))}
                      {validacaoContratos.duplicados.length > 20 && (
                        <li>
                          … +{validacaoContratos.duplicados.length - 20} outros
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {validacaoContratos.semNumero.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[12px] font-medium">
                      Itens sem nº ({validacaoContratos.semNumero.length}{" "}
                      contrato(s))
                    </div>
                    <ul className="mt-1 max-h-24 list-disc overflow-auto pl-4 text-[12px]">
                      {validacaoContratos.semNumero.slice(0, 10).map((d, idx) => (
                        <li key={`sn-${idx}`}>
                          {d.qtd} item(ns) sem nº em {d.contratoLabel}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {validacaoContratos.semDescricao.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[12px] font-medium">
                      Itens sem descrição ({validacaoContratos.semDescricao.length}{" "}
                      contrato(s))
                    </div>
                    <ul className="mt-1 max-h-24 list-disc overflow-auto pl-4 text-[12px]">
                      {validacaoContratos.semDescricao.slice(0, 10).map((d, idx) => (
                        <li key={`sd-${idx}`}>
                          {d.qtd} item(ns) sem descrição em {d.contratoLabel}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}


            {/* Resumo final */}
            <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-[13px] text-muted-foreground dark:bg-muted/30">
              <div>
                Serão criados <strong>{contratosSelecionados.length}</strong>{" "}
                contratos, somando <strong>{totalItens}</strong> itens e{" "}
                <strong>{formatBRL(totalValor)}</strong>
                {contratosDesmarcados.size > 0
                  ? ` · ${contratosDesmarcados.size} desmarcado(s) não será(ão) gerado(s)`
                  : ""}
                .
              </div>
              <div>
                Cada contrato consome 1 número da numeração automática da
                secretaria correspondente.
              </div>
            </div>

            <Button
              size="lg"
              className="w-full"
              disabled={disableBtn}
              onClick={onAutorizar}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Autorizar e gerar {contratosSelecionados.length} contratos
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});
