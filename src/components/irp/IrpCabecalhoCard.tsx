import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

type IrpJob = Database["public"]["Tables"]["irp_jobs"]["Row"];

export interface IrpCabecalhoForm {
  objeto: string;
  data: string;
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

  const { data: unidades = [] } = useQuery({
    queryKey: ["m2a-unidades-gestoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_gestoras")
        .select("id_local, m2a_id, nome, sigla, ativa")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: servidores = [] } = useQuery({
    queryKey: ["m2a-servidores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_servidores")
        .select("id_local, m2a_id, nome, cargo, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Hydrate from persisted irp_jobs when carregando job salvo
  useEffect(() => {
    if (!initialJob) return;
    onChange({
      objeto: initialJob.objeto ?? form.objeto,
      data: initialJob.data_processo ?? form.data,
      ano_orcamento:
        initialJob.ano_orcamento != null
          ? String(initialJob.ano_orcamento)
          : form.ano_orcamento,
      orgao_solicitante: initialJob.orgao_solicitante_id ?? form.orgao_solicitante,
      unidade_orcamentaria:
        initialJob.unidade_orcamentaria_id ?? form.unidade_orcamentaria,
      unidade_orcamentaria_gerenciadora:
        initialJob.unidade_orcamentaria_id ??
        form.unidade_orcamentaria_gerenciadora,
      responsavel_dfd: initialJob.responsavel_dfd_id ?? form.responsavel_dfd,
      comissao_planejamento:
        initialJob.comissao_planejamento ?? form.comissao_planejamento,
      classificacao: initialJob.classificacao ?? form.classificacao,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob?.id]);

  const update = (patch: Partial<IrpCabecalhoForm>) =>
    onChange({ ...form, ...patch });

  function findUnidadeIdLocal(value: string): string | null {
    if (!value) return null;
    const found = unidades.find(
      (u) => u.m2a_id === value || u.id_local === value,
    );
    return found?.id_local ?? null;
  }
  function findServidorIdLocal(value: string): string | null {
    if (!value) return null;
    const found = servidores.find(
      (s) => s.m2a_id === value || s.id_local === value,
    );
    return found?.id_local ?? null;
  }

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
          orgao_solicitante_id: findUnidadeIdLocal(form.orgao_solicitante),
          unidade_orcamentaria_id: findUnidadeIdLocal(form.unidade_orcamentaria),
          responsavel_dfd_id: findServidorIdLocal(form.responsavel_dfd),
          comissao_planejamento: form.comissao_planejamento.trim() || null,
          classificacao: form.classificacao || null,
        })
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

  const unidadeOptions = useMemo(
    () =>
      (unidades ?? []).map((u) => ({
        value: u.m2a_id ?? u.id_local,
        label: `${u.sigla ? `[${u.sigla}] ` : ""}${u.nome}`,
      })),
    [unidades],
  );
  const servidorOptions = useMemo(
    () =>
      (servidores ?? []).map((s) => ({
        value: s.m2a_id ?? s.id_local,
        label: `${s.nome}${s.cargo ? ` — ${s.cargo}` : ""}`,
      })),
    [servidores],
  );

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
          <Label>Data *</Label>
          <Input
            type="date"
            value={form.data}
            onChange={(e) => update({ data: e.target.value })}
            onBlur={persist}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Ano orçamentário *</Label>
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
            <option value="1">1 — Material</option>
            <option value="2">2 — Serviço</option>
            <option value="3">3 — Obra</option>
            <option value="4">4 — Outro</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Órgão solicitante *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.orgao_solicitante}
            onChange={(e) => {
              update({ orgao_solicitante: e.target.value });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— selecione —</option>
            {unidadeOptions.map((o) => (
              <option key={`og-${o.value}`} value={o.value}>
                {o.label}
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
              update({
                unidade_orcamentaria: e.target.value,
                unidade_orcamentaria_gerenciadora:
                  form.unidade_orcamentaria_gerenciadora || e.target.value,
              });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— selecione —</option>
            {unidadeOptions.map((o) => (
              <option key={`uo-${o.value}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>UO gerenciadora</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.unidade_orcamentaria_gerenciadora}
            onChange={(e) => {
              update({ unidade_orcamentaria_gerenciadora: e.target.value });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— mesma da UO —</option>
            {unidadeOptions.map((o) => (
              <option key={`uog-${o.value}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Responsável pelo DFD *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.responsavel_dfd}
            onChange={(e) => {
              update({ responsavel_dfd: e.target.value });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— selecione —</option>
            {servidorOptions.map((o) => (
              <option key={`r-${o.value}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Comissão de planejamento *</Label>
          <Input
            value={form.comissao_planejamento}
            onChange={(e) => update({ comissao_planejamento: e.target.value })}
            onBlur={persist}
            placeholder="Portaria / ID M2A da comissão"
          />
        </div>
      </CardContent>
    </Card>
  );
}
