import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

/**
 * Exclui um Job de importação (dotações → itens → job) e limpa o activeJobId
 * se ele estava selecionado.
 */
export function useDeleteImportJob(options: {
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
}) {
  const { activeJobId, setActiveJobId } = options;
  const qc = useQueryClient();

  const excluirJob = useCallback(
    async (id: string) => {
      console.log(`Solicitação de exclusão total do Job ${id}...`);
      const { error: dErr } = await supabase
        .from("contrato_import_dotacoes")
        .delete()
        .eq("job_id", id);
      if (dErr) return notify.error(dErr.message);
      const { error: iErr } = await supabase
        .from("contrato_import_itens")
        .delete()
        .eq("job_id", id);
      if (iErr) return notify.error(iErr.message);
      const { error: jErr } = await supabase
        .from("contrato_import_jobs")
        .delete()
        .eq("id", id);
      if (jErr) return notify.error(jErr.message);
      if (activeJobId === id) setActiveJobId(null);
      notify.success("Importação excluída");
      qc.invalidateQueries({ queryKey: ["cij-list"] });
    },
    [activeJobId, qc, setActiveJobId],
  );

  return { excluirJob };
}
