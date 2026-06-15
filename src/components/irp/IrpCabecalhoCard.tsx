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
import { Send, Save, Loader2, CheckCircle2, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type IrpJob = Database["public"]["Tables"]["irp_jobs"]["Row"];

export interface IrpCabecalhoForm {
  objeto: string;
  data: string;
  ano_orcamento: string;
  orgao_solicitante: string;       // m2a_id (string)
  unidade_orcamentaria: string;    // m2a_id (string)
  unidade_orcamentaria_gerenciadora: string; // derivado do órgão; mantido p/ compat
  responsavel_dfd: string;          // m2a_id do agente de planejamento
  comissao_planejamento: string;    // fixo "3911"; campo mantido por compat
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

  const { data: orgaos = [] } = useQuery({
    queryKey: ["m2a-orgaos-srp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_gestoras")
        .select("id_local, m2a_id, nome")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["m2a-uos-srp"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_orcamentarias")
        .select("id_local, m2a_id, nome, orgao_m2a_id")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: agentes = [] } = useQuery({
    queryKey: ["m2a-agentes-planejamento", form.unidade_orcamentaria],
    enabled: !!form.unidade_orcamentaria,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_agentes_planejamento")
        .select("servidor_m2a_id, nome, unidade_m2a_id")
        .eq("ativo", true)
        .eq("unidade_m2a_id", form.unidade_orcamentaria)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // UOs disponíveis para o órgão selecionado.
  // Fallback: se não há UO cadastrada para o órgão, oferece o próprio órgão como UO (1:1).
  const uosDoOrgao = useMemo(() => {
    if (!form.orgao_solicitante) return [];
    const filhas = unidades.filter(
      (u) => u.orgao_m2a_id === form.orgao_solicitante,
    );
    if (filhas.length > 0) return filhas;
    const orgao = orgaos.find((o) => o.m2a_id === form.orgao_solicitante);
    if (!orgao) return [];
    return [
      {
        id_local: orgao.id_local,
        m2a_id: orgao.m2a_id,
        nome: orgao.nome,
        orgao_m2a_id: orgao.m2a_id,
      },
    ];
  }, [unidades, orgaos, form.orgao_solicitante]);

  // Hydrate do job salvo
  useEffect(() => {
    if (!initialJob) return;
    onChange({
      objeto: initialJob.objeto ?? form.objeto,
      data: initialJob.data_processo ?? form.data,
      ano_orcamento:
        initialJob.ano_orcamento != null
          ? String(initialJob.ano_orcamento)
          : form.ano_orcamento,
      orgao_solicitante:
        (initialJob as any).orgao_solicitante_m2a_pk ??
        form.orgao_solicitante,
      unidade_orcamentaria:
        (initialJob as any).unidade_orcamentaria_m2a_pk ??
        form.unidade_orcamentaria,
      unidade_orcamentaria_gerenciadora:
        (initialJob as any).unidade_orcamentaria_m2a_pk ??
        form.unidade_orcamentaria_gerenciadora,
      responsavel_dfd:
        (initialJob as any).agente_planejamento_m2a_pk ??
        form.responsavel_dfd,
      comissao_planejamento: "3911",
      classificacao: initialJob.classificacao ?? form.classificacao,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJob?.id]);

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
      setTimeout(() => setSavedAt((v) => (v && Date.now() - v >= 1900 ? null : v)), 2000);
    } catch (e: any) {
      toast.error("Falha ao salvar cabeçalho", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  const cleanName = (s: string) =>
    s.replace(/^\s*\[[^\]]+\]\s*/, "").trim();

  const semAgente = !!form.unidade_orcamentaria && agentes.length === 0;

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
              update({
                orgao_solicitante: novoOrgao,
                // limpa UO/agente — vão ser repreenchidos com base no novo órgão
                unidade_orcamentaria: "",
                unidade_orcamentaria_gerenciadora: novoOrgao,
                responsavel_dfd: "",
              });
              setTimeout(persist, 0);
            }}
          >
            <option value="">— selecione —</option>
            {orgaos.map((o) => (
              <option key={`og-${o.m2a_id}`} value={o.m2a_id}>
                {cleanName(o.nome)}
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
                unidade_orcamentaria_gerenciadora:
                  form.unidade_orcamentaria_gerenciadora || uo,
                responsavel_dfd: "",
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
            {uosDoOrgao.map((u) => (
              <option key={`uo-${u.m2a_id}`} value={u.m2a_id}>
                {cleanName(u.nome)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Agente de planejamento *</Label>
          <select
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            value={form.responsavel_dfd}
            onChange={(e) => {
              update({ responsavel_dfd: e.target.value });
              setTimeout(persist, 0);
            }}
            disabled={!form.unidade_orcamentaria}
          >
            <option value="">
              {form.unidade_orcamentaria ? "— selecione —" : "selecione a UO primeiro"}
            </option>
            {agentes.map((a) => (
              <option key={`ag-${a.servidor_m2a_id}`} value={a.servidor_m2a_id}>
                {a.nome}
              </option>
            ))}
          </select>
          {semAgente && (
            <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3" /> Nenhum agente cadastrado para esta UO. Sincronize em <span className="font-mono">/agentes-planejamento</span>.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
