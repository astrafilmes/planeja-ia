import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export function useDeleteContratos(
  processoId: string,
  onSuccess?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("contratos")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await logAudit({
        action: "delete",
        entityType: "contrato",
        payload: { ids, processo_id: processoId },
      });
    },
    onSuccess: (_d, ids) => {
      notify.success(`${ids.length} contrato(s) excluído(s)`);
      onSuccess?.();
      qc.invalidateQueries({ queryKey: ["processo-detail", processoId] });
      qc.invalidateQueries({ queryKey: ["contratos"] });
    },
    onError: (e: any) => notify.error(e.message ?? "Falha ao excluir"),
  });
}
