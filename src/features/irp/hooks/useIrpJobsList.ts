import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { irpQueryKeys } from "../lib";

export interface IrpJobListItem {
  id: string;
  original_filename: string | null;
  status: string | null;
  total_secretarias: number | null;
  secretarias_com_itens: number | null;
  total_linhas: number | null;
  total_valor: number | null;
  created_at: string | null;
}

export interface UseIrpJobsListResult {
  jobs: IrpJobListItem[];
  isLoading: boolean;
  excluirIrpJob: (id: string) => Promise<void>;
}

interface UseIrpJobsListOptions {
  jobIdAtivo: string | null;
  onJobExcluidoAtivo: () => void;
}

export function useIrpJobsList({
  jobIdAtivo,
  onJobExcluidoAtivo,
}: UseIrpJobsListOptions): UseIrpJobsListResult {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: irpQueryKeys.jobsList,
    queryFn: async () => {
      const { data } = await supabase
        .from("irp_jobs")
        .select(
          "id, original_filename, status, total_secretarias, secretarias_com_itens, total_linhas, total_valor, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as IrpJobListItem[];
    },
  });

  const excluirIrpJob = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase.from("irp_jobs").delete().eq("id", id);
        if (error) throw error;
        notify.success("Importação excluída.");
        if (jobIdAtivo === id) {
          onJobExcluidoAtivo();
          navigate({ to: "/irp", search: { job: undefined } });
        }
        qc.invalidateQueries({ queryKey: irpQueryKeys.jobsList });
      } catch (e: any) {
        notify.error("Falha ao excluir", { description: e?.message });
      }
    },
    [jobIdAtivo, navigate, onJobExcluidoAtivo, qc],
  );

  return { jobs, isLoading, excluirIrpJob };
}
