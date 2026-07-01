import { memo } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  processos: ProcessoMin[];
  processoId: string;
  onChangeProcessoId: (id: string) => void;
  criarProcesso: boolean;
  onChangeCriarProcesso: (v: boolean) => void;
  numeroProcessoBase: string;
  onChangeNumeroProcessoBase: (v: string) => void;
  dataBatch: string;
  onChangeDataBatch: (v: string) => void;
  objetoBatch: string;
  onChangeObjetoBatch: (v: string) => void;
  totalValor: number;
  totalItens: number;
  busy: boolean;
  onAutorizar: () => void;
};

/**
 * Painel de "Autorizar geração": vínculo/criação de processo, dados do lote,
 * prepostos por fornecedor, pré-checagem, resumo final e botão de autorização.
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
  processos,
  processoId,
  onChangeProcessoId,
  criarProcesso,
  onChangeCriarProcesso,
  numeroProcessoBase,
  onChangeNumeroProcessoBase,
  dataBatch,
  onChangeDataBatch,
  objetoBatch,
  onChangeObjetoBatch,
  totalValor,
  totalItens,
  busy,
  onAutorizar,
}: Props) {
  const disableBtn =
    busy ||
    contratosSelecionados.length === 0 ||
    contratosSemCadastroM2A.length > 0 ||
    fornecedoresSemPreposto.length > 0 ||
    contratosSemAtaM2A.length > 0;

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
            {/* 1) Vínculo de processo — vem ANTES dos dados do lote */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3 ">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Processo
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Vincular a processo existente</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
                  value={processoId}
                  onChange={(e) => onChangeProcessoId(e.target.value)}
                >
                  <option value="">— Nenhum (criar novo abaixo) —</option>
                  {processos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.numero_processo ?? "(sem nº)"} ·{" "}
                      {p.objeto?.slice(0, 60)}
                      {p.m2a_processo_id
                        ? ` · Código externo #${p.m2a_processo_id}`
                        : ""}
                    </option>
                  ))}
                </select>
                {processoId && (
                  <p className="text-[13px] text-emerald-600 dark:text-emerald-400">
                    Nº do processo e Objeto serão reaproveitados do processo
                    selecionado.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 text-[13px]">
                <Checkbox
                  id="criarProc"
                  checked={criarProcesso && !processoId}
                  disabled={!!processoId}
                  onCheckedChange={(checked) =>
                    onChangeCriarProcesso(checked === true)
                  }
                />
                <label
                  htmlFor="criarProc"
                  className={`cursor-pointer ${processoId ? "text-muted-foreground" : ""}`}
                >
                  Ou criar um novo processo automaticamente para este lote
                </label>
              </div>
            </div>

            {/* 2) Dados do lote */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dados do lote (aplicados a todos os contratos)
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Nº base do processo *</Label>
                  <Input
                    placeholder="026/2025"
                    value={numeroProcessoBase}
                    onChange={(e) => onChangeNumeroProcessoBase(e.target.value)}
                    disabled={!!processoId}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Data dos contratos *</Label>
                  <Input
                    type="date"
                    value={dataBatch}
                    onChange={(e) => onChangeDataBatch(e.target.value)}
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Será gravada em todos os contratos e usada no envio ao
                    portal M2A.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Objeto *</Label>
                <Input
                  placeholder="Ex.: Aquisição de material de expediente para as Secretarias..."
                  value={objetoBatch}
                  onChange={(e) => onChangeObjetoBatch(e.target.value)}
                  disabled={!!processoId}
                />
                <p className="text-[13px] text-muted-foreground">
                  {processoId
                    ? "Reaproveitado do processo vinculado."
                    : "Mesmo objeto será gravado em todos os contratos gerados e no processo."}
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Unidade Gestora, dotação, Fiscal e Gestor são definidos
                automaticamente a partir do cadastro da secretaria/dotação
                detectada na planilha.
              </p>

              <div className="rounded-lg border border-border/60 bg-card p-3">
                <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      const prepostoValue = prepostosByFornecedor[target.key] ?? "";
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

              <Separator className="my-2" />

              <div className="rounded-lg border border-border/60 bg-card p-3 text-[13px] text-muted-foreground ">
                <div className="font-medium text-slate-800 ">Pré-checagem</div>
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
            </div>

            <Separator />

            <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-[13px] text-muted-foreground dark:bg-muted/30 ">
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
              {processoId ? (
                <div>
                  Contratos serão vinculados ao processo selecionado (sem criar
                  processo novo).
                </div>
              ) : (
                criarProcesso && (
                  <div>
                    Um novo processo será criado e vinculado a todos os
                    contratos deste lote.
                  </div>
                )
              )}
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
