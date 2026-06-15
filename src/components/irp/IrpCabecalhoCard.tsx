import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Save, Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  listarOrgaosOrdenados,
  getOrgaoMapping,
  findOrgaoByUO,
} from "@/lib/m2a-orgaos-mapping";

type IrpJob = Database["public"]["Tables"]["irp_jobs"]["Row"];

export interface IrpCabecalhoForm {
  objeto: string;
  data: string;
  data_consolidacao: string;
  ano_orcamento: string;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao: string;
}

interface Props {
  jobId: string | null;
  initialJob: IrpJob | null;
  form: IrpCabecalhoForm;
  onChange: (next: IrpCabecalhoForm) => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitHelper?: string;
}

const CLASSIFICACAO_OPTIONS = [
  { value: "1", label: "Material" },
  { value: "2", label: "Serviço" },
  { value: "3", label: "Obra" },
  { value: "4", label: "Outro" },
];

const ORGAOS = listarOrgaosOrdenados();

/** Soma 1 dia útil (pula sáb/dom). Aceita ISO YYYY-MM-DD; retorna ISO. */
export function proximoDiaUtil(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  do {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return dt.toISOString().slice(0, 10);
}

export function IrpCabecalhoCard({
  jobId,
  initialJob,
  form,
  onChange,
  onSubmit,
  submitDisabled,
  submitHelper,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const orgaoMapping = useMemo(
    () => getOrgaoMapping(form.orgao_solicitante),
    [form.orgao_solicitante],
  );
  const uos = orgaoMapping?.unidades ?? [];

  // Hydrate do job salvo
  useEffect(() => {
    if (!initialJob) return;
    const orgao =
      (initialJob as any).orgao_solicitante_m2a_pk ?? form.orgao_solicitante;
    const uo =
      (initialJob as any).unidade_orcamentaria_m2a_pk ??
      form.unidade_orcamentaria;
    const mapping = getOrgaoMapping(orgao);
    const dataDfd = initialJob.data_processo ?? form.data;
    onChange({
      objeto: initialJob.objeto ?? form.objeto,
      data: dataDfd,
      data_consolidacao:
        (initialJob as any).data_consolidacao ??
        form.data_consolidacao ??
        proximoDiaUtil(dataDfd),
      ano_orcamento:
        initialJob.ano_orcamento != null
          ? String(initialJob.ano_orcamento)
          : form.ano_orcamento,
      orgao_solicitante: orgao,
      unidade_orcamentaria: uo,
      unidade_orcamentaria_gerenciadora: uo,
      responsavel_dfd: mapping
        ? String(mapping.responsavel_dfd_id)
        : form.responsavel_dfd,
      comissao_planejamento: "3911",
      classificacao: initialJob.classificacao ?? form.classificacao,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob?.id]);

  // Se o órgão atual não estiver no mapping mas a UO sim, descobre o órgão.
  useEffect(() => {
    if (form.orgao_solicitante) return;
    const orgao = findOrgaoByUO(form.unidade_orcamentaria);
    if (orgao) {
      const m = getOrgaoMapping(orgao)!;
      onChange({
        ...form,
        orgao_solicitante: orgao,
        responsavel_dfd: String(m.responsavel_dfd_id),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.unidade_orcamentaria]);

  const update = (patch: Partial<IrpCabecalhoForm>) =>
    onChange({ ...form, ...patch });

  async function persist() {
    if (!jobId) return;
    setSaving(true);
    try {
      const ano = parseInt(form.ano_orcamento, 10);
      const { error } = await supabase
        .from("irp_jobs")
        .update({
          objeto: form.objeto.trim() || null,
          data_processo: form.data || null,
          ano_orcamento: Number.isFinite(ano) ? ano : null,
          unidade_orcamentaria_m2a_pk: form.unidade_orcamentaria || null,
          agente_planejamento_m2a_pk: form.responsavel_dfd || null,
          comissao_planejamento: "3911",
          classificacao: form.classificacao || null,
        } as any)
        .eq("id", jobId);
      if (error) throw error;
      setSavedAt(Date.now());
      setTimeout(
        () => setSavedAt((v) => (v && Date.now() - v >= 1900 ? null : v)),
        2000,
      );
    } catch (e: any) {
      toast.error("Falha ao salvar cabeçalho", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Cabeçalho do processo SRP
          </CardTitle>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Dados gerais do processo. Salvo automaticamente ao sair de cada campo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : savedAt ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <Save className="size-4 text-muted-foreground" />
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={submitDisabled}
          >
            <Send className="size-4" /> Criar no M2A
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {submitHelper && (
          <div className="md:col-span-3 rounded-md border border-amber-500/40 bg-amber-50/40 px-3 py-2 text-[12px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {submitHelper}
          </div>
        )}
        <div className="flex flex-col gap-1.5 md:col-span-3">
          <Label>Objeto *</Label>
          <Textarea
            value={form.objeto}
            onChange={(e) => update({ objeto: e.target.value })}
            onBlur={persist}
            placeholder="Objeto do processo de registro de preços"
            className="min-h-20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Data DFD / IRP *</Label>
          <Input
            type="date"
            value={form.data}
            onChange={(e) => {
              const novaData = e.target.value;
              // se a consolidação ainda era o "próximo dia útil" da data anterior,
              // recalcula automaticamente. Caso contrário, mantém o valor manual.
              const auto = proximoDiaUtil(form.data);
              const next: Partial<IrpCabecalhoForm> = { data: novaData };
              if (!form.data_consolidacao || form.data_consolidacao === auto) {
                next.data_consolidacao = proximoDiaUtil(novaData);
              }
              onChange({ ...form, ...next });
            }}
            onBlur={persist}
          />
          <p className="text-[10px] text-muted-foreground">
            usada como data do processo, manifestação e finalização da IRP.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Data Consolidação *</Label>
          <Input
            type="date"
            value={form.data_consolidacao}
            onChange={(e) => update({ data_consolidacao: e.target.value })}
            onBlur={persist}
          />
          <p className="text-[10px] text-muted-foreground">
            geralmente 1 dia útil após a data da DFD.
          </p>
        </div>
          <Input
            value={form.ano_orcamento}
            onChange={(e) => update({ ano_orcamento: e.target.value })}
            onBlur={persist}
            placeholder="2026"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Classificação *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.classificacao}
            onChange={(e) => {
              update({ classificacao: e.target.value });
              setTimeout(persist, 0);
            }}
          >
            {CLASSIFICACAO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Órgão solicitante *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.orgao_solicitante}
            onChange={(e) => {
              const novoOrgao = e.target.value;
              const m = getOrgaoMapping(novoOrgao);
              const primeiraUo = m?.unidades?.[0];
              const uoId = primeiraUo ? String(primeiraUo.id) : "";
              update({
                orgao_solicitante: novoOrgao,
                unidade_orcamentaria: uoId,
                unidade_orcamentaria_gerenciadora: uoId,
                responsavel_dfd: m ? String(m.responsavel_dfd_id) : "",
              });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— selecione —</option>
            {ORGAOS.map((o) => (
              <option key={`og-${o.m2a_id}`} value={o.m2a_id}>
                {o.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Unidade orçamentária *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.unidade_orcamentaria}
            onChange={(e) => {
              const uo = e.target.value;
              update({
                unidade_orcamentaria: uo,
                unidade_orcamentaria_gerenciadora: uo,
              });
              setTimeout(persist, 0);
            }}
            disabled={!form.orgao_solicitante}
          >
            <option value="">
              {form.orgao_solicitante
                ? "— selecione —"
                : "selecione o órgão primeiro"}
            </option>
            {uos.map((u) => (
              <option key={`uo-${u.id}`} value={String(u.id)}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Agente de planejamento</Label>
          <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
            {orgaoMapping
              ? orgaoMapping.responsavel_dfd_nome
              : "selecione o órgão para definir automaticamente"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
