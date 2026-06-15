import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretariaRowId: string | null;
  secretariaNome: string;
  onSaved?: () => void;
}

interface State {
  dotacao_orgao: string;
  dotacao_uo: string;
  dotacao_projeto_atividade: string;
  fiscal_servidor_id: string;
  gestor_servidor_id: string;
}

const EMPTY: State = {
  dotacao_orgao: "",
  dotacao_uo: "",
  dotacao_projeto_atividade: "",
  fiscal_servidor_id: "",
  gestor_servidor_id: "",
};

export function IrpSecretariaConfigModal({
  open,
  onOpenChange,
  secretariaRowId,
  secretariaNome,
  onSaved,
}: Props) {
  const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: servidores = [] } = useQuery({
    queryKey: ["m2a-servidores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_servidores")
        .select("id_local, nome, cargo, ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open || !secretariaRowId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("irp_job_secretarias")
      .select(
        "dotacao_orgao, dotacao_uo, dotacao_projeto_atividade, fiscal_servidor_id, gestor_servidor_id",
      )
      .eq("id", secretariaRowId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Falha ao carregar configuração", {
            description: error.message,
          });
          return;
        }
        setState({
          dotacao_orgao: data?.dotacao_orgao ?? "",
          dotacao_uo: data?.dotacao_uo ?? "",
          dotacao_projeto_atividade: data?.dotacao_projeto_atividade ?? "",
          fiscal_servidor_id: data?.fiscal_servidor_id ?? "",
          gestor_servidor_id: data?.gestor_servidor_id ?? "",
        });
      })
      .then(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, secretariaRowId]);

  async function handleSave() {
    if (!secretariaRowId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("irp_job_secretarias")
        .update({
          dotacao_orgao: state.dotacao_orgao.trim() || null,
          dotacao_uo: state.dotacao_uo.trim() || null,
          dotacao_projeto_atividade:
            state.dotacao_projeto_atividade.trim() || null,
          fiscal_servidor_id: state.fiscal_servidor_id || null,
          gestor_servidor_id: state.gestor_servidor_id || null,
        })
        .eq("id", secretariaRowId);
      if (error) throw error;
      toast.success("Configuração salva");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Falha ao salvar", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar envio — {secretariaNome}</DialogTitle>
          <DialogDescription>
            Defina dotação orçamentária e responsáveis desta secretaria para o
            envio ao M2A.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Órgão</Label>
                <Input
                  value={state.dotacao_orgao}
                  onChange={(e) =>
                    setState({ ...state, dotacao_orgao: e.target.value })
                  }
                  placeholder="Ex: 02"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>UO</Label>
                <Input
                  value={state.dotacao_uo}
                  onChange={(e) =>
                    setState({ ...state, dotacao_uo: e.target.value })
                  }
                  placeholder="Ex: 02.01"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Projeto / Atividade</Label>
                <Input
                  value={state.dotacao_projeto_atividade}
                  onChange={(e) =>
                    setState({
                      ...state,
                      dotacao_projeto_atividade: e.target.value,
                    })
                  }
                  placeholder="Ex: 2.004"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Fiscal do contrato</Label>
              <select
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                value={state.fiscal_servidor_id}
                onChange={(e) =>
                  setState({ ...state, fiscal_servidor_id: e.target.value })
                }
              >
                <option value="">— selecione —</option>
                {servidores.map((s) => (
                  <option key={`f-${s.id_local}`} value={s.id_local}>
                    {s.nome}
                    {s.cargo ? ` — ${s.cargo}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Gestor do contrato</Label>
              <select
                className="h-10 rounded-md border border-input bg-card px-3 text-sm"
                value={state.gestor_servidor_id}
                onChange={(e) =>
                  setState({ ...state, gestor_servidor_id: e.target.value })
                }
              >
                <option value="">— selecione —</option>
                {servidores.map((s) => (
                  <option key={`g-${s.id_local}`} value={s.id_local}>
                    {s.nome}
                    {s.cargo ? ` — ${s.cargo}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
