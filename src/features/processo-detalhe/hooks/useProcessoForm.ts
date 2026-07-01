import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { extractM2AProcessoId } from "@/lib/m2a";
import { anoFromNumero, type Processo } from "../lib";

export function useProcessoForm(processoId: string, processo: Processo | null | undefined) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<Processo>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (processo) setForm(processo);
  }, [processo]);

  const update = useCallback(<K extends keyof Processo>(k: K, v: Processo[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    const m2aUrl = form.m2a_url ?? null;
    const m2aId = extractM2AProcessoId(m2aUrl);
    const payload = {
      numero_processo: form.numero_processo ?? null,
      ano: anoFromNumero(form.numero_processo),
      modalidade: form.modalidade ?? null,
      objeto: form.objeto ?? "",
      status: processo?.status ?? form.status ?? "rascunho",
      data_abertura: form.data_abertura ?? null,
      observacoes: form.observacoes ?? null,
      m2a_url: m2aUrl,
      m2a_processo_id: m2aId,
    };
    const { error } = await supabase
      .from("processos")
      .update(payload)
      .eq("id", processoId);
    if (error) return notify.error(error.message);
    await logAudit({
      action: "update",
      entityType: "processo",
      entityId: processoId,
      payload,
    });
    notify.success("Processo atualizado");
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
    qc.invalidateQueries({ queryKey: ["processos"] });
  }, [form, processo, processoId, qc]);

  const handleDelete = useCallback(async () => {
    const { error } = await supabase
      .from("processos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", processoId);
    if (error) return notify.error(error.message);
    await logAudit({
      action: "delete",
      entityType: "processo",
      entityId: processoId,
    });
    notify.success("Processo excluído");
    qc.invalidateQueries({ queryKey: ["processos"] });
    navigate({ to: "/processos" });
  }, [processoId, qc, navigate]);

  return { form, dirty, update, handleSave, handleDelete };
}
