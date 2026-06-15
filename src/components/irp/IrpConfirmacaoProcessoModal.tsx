import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  Hash,
  Loader2,
  Send,
  Tag,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CLASSIFICACOES: Record<string, string> = {
  "1": "Material",
  "2": "Serviço",
  "3": "Obra",
  "4": "Outro",
};

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

type Form = {
  objeto: string;
  data: string;
  ano_orcamento: string;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao: string;
};

type ImportRow = {
  key: string;
  nome: string;
  numero: string | number | null;
  itens: number;
  valor: number;
  orgaoPk: string | null;
  unidadePk: string | null;
};

type SecRow = {
  id: string;
  unidade_id: string | null;
  numero: string | number;
  nome: string;
  dotacao_orgao: string | null;
  dotacao_uo: string | null;
  dotacao_projeto_atividade: string | null;
  fiscal_servidor_id: string | null;
  gestor_servidor_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  form: Form;
  rows: ImportRow[];
  secRowByNumero: Map<string | number, SecRow>;
  onConfirm: () => void;
};

export function IrpConfirmacaoProcessoModal({
  open,
  onOpenChange,
  busy,
  form,
  rows,
  secRowByNumero,
  onConfirm,
}: Props) {
  const { data: servidores = [] } = useQuery({
    queryKey: ["m2a-servidores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("m2a_servidores")
        .select("id_local, nome, cargo");
      return data ?? [];
    },
  });

  const servidorById = useMemo(
    () => new Map((servidores ?? []).map((s: any) => [s.id_local, s])),
    [servidores],
  );

  const totalItens = rows.reduce((a, r) => a + r.itens, 0);
  const totalValor = rows.reduce((a, r) => a + r.valor, 0);

  const enriched = rows.map((row) => {
    const sec = row.numero ? secRowByNumero.get(row.numero) : undefined;
    const fiscal = sec?.fiscal_servidor_id
      ? servidorById.get(sec.fiscal_servidor_id)
      : null;
    const gestor = sec?.gestor_servidor_id
      ? servidorById.get(sec.gestor_servidor_id)
      : null;
    const dotacaoOk = !!(sec?.dotacao_orgao && sec?.dotacao_uo);
    const fiscalOk = !!fiscal;
    const gestorOk = !!gestor;
    return { row, sec, fiscal, gestor, dotacaoOk, fiscalOk, gestorOk };
  });

  const pendentes = enriched.filter(
    (e) => !e.dotacaoOk || !e.fiscalOk || !e.gestorOk,
  );
  const podeConfirmar = !busy && enriched.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Confirmar criação do processo SRP</DialogTitle>
          <DialogDescription>
            Revise abaixo o cabeçalho do DFD, a ordem de importação das
            planilhas e os responsáveis configurados em cada secretaria antes
            de iniciar a automação no portal M2A.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-auto pr-1">
          {/* Cabeçalho */}
          <section className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Tag className="size-3.5" /> Cabeçalho do DFD
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                  Objeto
                </div>
                <div className="font-medium">{form.objeto || "—"}</div>
              </div>
              <Field
                icon={<CalendarDays className="size-3.5" />}
                label="Data"
                value={fmtData(form.data)}
              />
              <Field
                icon={<Hash className="size-3.5" />}
                label="Ano orçamentário"
                value={form.ano_orcamento || "—"}
              />
              <Field
                label="Classificação"
                value={`${form.classificacao} — ${
                  CLASSIFICACOES[form.classificacao] ?? "—"
                }`}
              />
              <Field
                label="Órgão solicitante"
                value={form.orgao_solicitante || "—"}
                mono
              />
              <Field
                label="Unidade orçamentária"
                value={form.unidade_orcamentaria || "—"}
                mono
              />
              <Field
                icon={<User className="size-3.5" />}
                label="Agente de planejamento"
                value={form.responsavel_dfd || "—"}
                mono
              />
            </div>
          </section>

          {/* Resumo */}
          <section className="grid grid-cols-3 gap-2">
            <Stat label="Planilhas" value={String(rows.length)} />
            <Stat label="Itens" value={String(totalItens)} />
            <Stat label="Valor estimado" value={moeda(totalValor)} />
          </section>

          {/* Pendências */}
          {pendentes.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <strong>{pendentes.length}</strong> secretaria(s) sem
                dotação, fiscal ou gestor configurados. Clique no ícone de
                engrenagem na tabela para completar antes de prosseguir.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-50 p-3 text-[13px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" />
              Todas as secretarias estão com dotação e responsáveis
              configurados.
            </div>
          )}

          {/* Tabela de planilhas */}
          <section className="rounded-lg border border-border/60">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileSpreadsheet className="size-3.5" />
              Ordem de importação ({rows.length})
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Secretaria</th>
                    <th className="px-3 py-2 text-left">Dotação</th>
                    <th className="px-3 py-2 text-left">Fiscal / Gestor</th>
                    <th className="px-3 py-2 text-right">Itens</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((e, i) => {
                    const allOk = e.dotacaoOk && e.fiscalOk && e.gestorOk;
                    return (
                      <tr
                        key={e.row.key}
                        className="border-b border-border/40 last:border-b-0"
                      >
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-1.5 font-medium">
                            {allOk ? (
                              <CheckCircle2 className="size-3.5 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="size-3.5 text-amber-600" />
                            )}
                            {e.row.nome}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Órgão {e.row.orgaoPk ?? "?"} · UO{" "}
                            {e.row.unidadePk ?? "?"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          {e.dotacaoOk ? (
                            <>
                              {e.sec?.dotacao_orgao}/{e.sec?.dotacao_uo}
                              {e.sec?.dotacao_projeto_atividade ? (
                                <div className="text-[11px] text-muted-foreground">
                                  PA {e.sec.dotacao_projeto_atividade}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-amber-600">
                              não configurada
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-xs">
                          <div
                            className={
                              e.fiscalOk ? "" : "text-amber-600"
                            }
                          >
                            F: {e.fiscal?.nome ?? "—"}
                          </div>
                          <div
                            className={
                              e.gestorOk
                                ? "text-muted-foreground"
                                : "text-amber-600"
                            }
                          >
                            G: {e.gestor?.nome ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">
                          {e.row.itens}
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">
                          {moeda(e.row.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!podeConfirmar}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="size-4" />
                Confirmar e iniciar automação
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={mono ? "font-mono text-[13px]" : "text-[13px]"}>
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
