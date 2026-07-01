import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useServidores,
  useUnidadesGestoras,
  type M2AServidor,
  type M2AUnidadeGestora,
} from "@/hooks/useM2ACatalog";
import {
  SecretariaRowSchema,
  SecretariaCpfRowSchema,
  parseSupabaseList,
} from "@/lib/validators";
import type { EnrichedSec, Sec } from "../lib";

export const SECRETARIAS_QUERY_KEY = ["secretarias"] as const;

export function useSecretariasQuery() {
  const { data, isLoading } = useQuery({
    queryKey: SECRETARIAS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, ativa, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_dotacao_default, m2a_ref_coluna, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
        )
        .order("numero");
      if (error) throw error;

      // Validação runtime: se o schema do banco mudar, linhas inválidas
      // são logadas e descartadas em vez de propagar undefined pela UI.
      const rows = parseSupabaseList(
        SecretariaRowSchema,
        data,
        "secretarias.select",
      );

      // CPFs sensíveis: só admin/gestor conseguem; merge via RPC quando autorizado.
      let cpfs: Array<{
        id: string;
        m2a_gestor_cpf: string | null;
        m2a_fiscal_cpf: string | null;
      }> = [];
      try {
        const { data: cpfData, error: rpcErr } = await supabase.rpc(
          "get_secretarias_cpfs",
        );
        if (!rpcErr) {
          cpfs = parseSupabaseList(
            SecretariaCpfRowSchema,
            cpfData,
            "get_secretarias_cpfs",
          );
        }
      } catch {
        /* sem permissão, segue sem CPFs */
      }
      const cpfMap = new Map<
        string,
        { gestor: string | null; fiscal: string | null }
      >();
      cpfs.forEach((c) =>
        cpfMap.set(c.id, {
          gestor: c.m2a_gestor_cpf,
          fiscal: c.m2a_fiscal_cpf,
        }),
      );

      return rows.map((s) => ({
        ...s,
        m2a_gestor_cpf: cpfMap.get(s.id)?.gestor ?? null,
        m2a_fiscal_cpf: cpfMap.get(s.id)?.fiscal ?? null,
      })) as Sec[];
    },
  });

  const { data: unidadesGestoras = [] } = useUnidadesGestoras();
  const { data: fiscais = [] } = useServidores("FISCAL");
  const { data: gestores = [] } = useServidores("GESTOR");

  const unidadeByM2A = useMemo(
    () => new Map(unidadesGestoras.map((item) => [item.m2a_id, item])),
    [unidadesGestoras],
  );

  const enrichedRows: EnrichedSec[] = useMemo(() => {
    return (data ?? []).map((secretaria) => ({
      ...secretaria,
      unidade: secretaria.m2a_orgao_id
        ? (unidadeByM2A.get(secretaria.m2a_orgao_id) ?? null)
        : null,
      fiscal: secretaria.m2a_fiscal_codigo
        ? (fiscais.find(
            (fiscal) => fiscal.m2a_id === secretaria.m2a_fiscal_codigo,
          ) ?? null)
        : null,
      gestor: secretaria.m2a_gestor_codigo
        ? (gestores.find(
            (gestor) => gestor.m2a_id === secretaria.m2a_gestor_codigo,
          ) ?? null)
        : null,
    }));
  }, [data, fiscais, gestores, unidadeByM2A]);

  return {
    rows: data ?? [],
    enrichedRows,
    isLoading,
    unidadesGestoras: unidadesGestoras as M2AUnidadeGestora[],
    fiscais: fiscais as M2AServidor[],
    gestores: gestores as M2AServidor[],
  };
}
