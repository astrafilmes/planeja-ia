import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { irpQueryKeys, type SecretariaM2A } from "../lib";

export interface JobSecretariaRow {
  id: string;
  unidade_id: string | null;
  numero: number;
  nome: string;
  dotacao_orgao: string | null;
  dotacao_uo: string | null;
  dotacao_projeto_atividade: string | null;
  fiscal_servidor_id: string | null;
  gestor_servidor_id: string | null;
  m2a_status: string | null;
  m2a_mensagem: string | null;
}

export interface UseIrpSecretariasM2AResult {
  secretariasM2A: SecretariaM2A[];
  secretariaById: Map<string, SecretariaM2A>;
  secretariaByNumero: Map<number, SecretariaM2A>;
  jobSecretariaRows: JobSecretariaRow[];
  secRowByUnidadeId: Map<string, JobSecretariaRow>;
  secRowByNumero: Map<number, JobSecretariaRow>;
}

export function useIrpSecretariasM2A(
  jobId: string | null,
): UseIrpSecretariasM2AResult {
  const { data: secretariasM2A = [] } = useQuery({
    queryKey: irpQueryKeys.secretariasM2A,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id",
        )
        .eq("ativa", true);
      if (error) throw error;
      return (data ?? []) as SecretariaM2A[];
    },
  });

  const { data: jobSecretariaRows = [] } = useQuery({
    queryKey: irpQueryKeys.jobSecRows(jobId),
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("irp_job_secretarias")
        .select(
          "id, unidade_id, numero, nome, dotacao_orgao, dotacao_uo, dotacao_projeto_atividade, fiscal_servidor_id, gestor_servidor_id, m2a_status, m2a_mensagem",
        )
        .eq("job_id", jobId!);
      if (error) throw error;
      return (data ?? []) as JobSecretariaRow[];
    },
  });

  const secretariaById = useMemo(
    () => new Map(secretariasM2A.map((s) => [s.id, s])),
    [secretariasM2A],
  );

  const secretariaByNumero = useMemo(
    () => new Map(secretariasM2A.map((s) => [s.numero, s])),
    [secretariasM2A],
  );

  const secRowByUnidadeId = useMemo(
    () => new Map(jobSecretariaRows.map((r) => [r.unidade_id ?? "", r])),
    [jobSecretariaRows],
  );

  const secRowByNumero = useMemo(
    () => new Map(jobSecretariaRows.map((r) => [r.numero, r])),
    [jobSecretariaRows],
  );

  return {
    secretariasM2A,
    secretariaById,
    secretariaByNumero,
    jobSecretariaRows,
    secRowByUnidadeId,
    secRowByNumero,
  };
}
