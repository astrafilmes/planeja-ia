import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import type { ContratoRow } from "../lib";

export function useContratoFlags(processoId: string) {
  const qc = useQueryClient();

  const toggleImpresso = useCallback(
    async (c: ContratoRow) => {
      const next = !c.impresso_assinado;
      const { error } = await supabase
        .from("contratos")
        .update({ impresso_assinado: next })
        .eq("id", c.id);
      if (error) return notify.error(error.message);
      notify.success(next ? "Marcado como impresso/assinado" : "Desmarcado");
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
    },
    [processoId, qc],
  );

  const togglePublicado = useCallback(
    async (c: ContratoRow) => {
      const next = !c.publicado;
      const { error } = await supabase
        .from("contratos")
        .update({
          publicado: next,
          publicado_at: next ? new Date().toISOString() : null,
        })
        .eq("id", c.id);
      if (error) return notify.error(error.message);
      notify.success(next ? "Marcado como publicado" : "Desmarcado");
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
    },
    [processoId, qc],
  );

  return { toggleImpresso, togglePublicado };
}
