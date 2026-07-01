import {
  CalendarDays,
  FileSpreadsheet,
  Hash,
  Loader2,
  Send,
  Tag,
  User,
} from "lucide-react";
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  form: Form;
  rows: ImportRow[];
  // mantido por compatibilidade com chamadores existentes — não utilizado
  secRowByNumero?: unknown;
  onConfirm: () => void;
};

export function IrpConfirmacaoProcessoModal({
  open,
  onOpenChange,
  busy,
  form,
  rows,
  onConfirm,
}: Props) {
  const totalItens = rows.reduce((a, r) => a + r.itens, 0);
  const totalValor = rows.reduce((a, r) => a + r.valor, 0);
  const podeConfirmar = !busy && rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Confirmar criação do processo SRP</DialogTitle>
          <DialogDescription>
            Revise o cabeçalho do DFD e a ordem de importação das planilhas
            antes de iniciar a automação no portal M2A.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-auto pr-1">
          {/* Cabeçalho */}
          <section className="rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Tag className="size-3.5" /> Cabeçalho do DFD
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-[11px] font-medium uppercase text-muted-foreground">
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
                value={CLASSIFICACOES[form.classificacao] ?? "—"}
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

          {/* Tabela de planilhas */}
          <section className="rounded-lg border border-border/60">
            <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <FileSpreadsheet className="size-3.5" />
              Ordem de importação ({rows.length})
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Secretaria</th>
                    <th className="px-3 py-2 text-right">Itens</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.key}
                      className="border-b border-border/40 last:border-b-0"
                    >
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 align-top font-medium">
                        {row.nome}
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {row.itens}
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {moeda(row.valor)}
                      </td>
                    </tr>
                  ))}
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
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase text-muted-foreground">
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
      <div className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
