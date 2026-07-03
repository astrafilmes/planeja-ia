import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { irpQueryKeys, type UnidadeIrp } from "../lib";

export interface UseIrpUnidadesResult {
  unidades: UnidadeIrp[] | undefined;
  unidadeById: Map<string, UnidadeIrp>;
  isLoading: boolean;
}

/**
 * Fonte das "unidades de processamento" do IRP.
 *
 * Antes: `irp_unidades_processamento` (1 linha por UO) — colapsava dotações
 * distintas (ex.: SME FUNDEB-EF e SME FUNDEB-EI) numa única DFD.
 *
 * Agora: reaproveitamos o cadastro de `secretarias` (a MESMA fonte usada na
 * importação de contratos): cada linha com `m2a_ref_coluna` vira uma unidade
 * separada, com sua própria dotação (`m2a_dot_id`) e coluna na planilha.
 * Isso permite ao worker gerar 1 DFD por dotação no fluxo comum, replicando
 * o comportamento já validado em contratos.
 */
export function useIrpUnidades(): UseIrpUnidadesResult {
  const { data: unidades, isLoading } = useQuery({
    queryKey: irpQueryKeys.unidades,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select(
          "id, numero, sigla, nome, m2a_ref_coluna, m2a_dotacao_default, m2a_uo_id, m2a_dot_id",
        )
        .not("m2a_ref_coluna", "is", null)
        .order("numero")
        .order("m2a_ref_coluna");
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        numero: number;
        sigla: string | null;
        nome: string;
        m2a_ref_coluna: number | null;
        m2a_dotacao_default: string | null;
        m2a_uo_id: string | null;
        m2a_dot_id: string | null;
      }>;
      // `m2a_ref_coluna` segue a MESMA convenção usada em
      // M2A_IRP_UNIDADES_CANONICAS (índice da coluna da planilha tal como o
      // parser IRP consome). Não fazemos ajuste 0/1-based aqui.
      return rows
        .filter((r) => typeof r.m2a_ref_coluna === "number" && r.m2a_ref_coluna >= 0)
        .map<UnidadeIrp>((r) => ({
          id: r.id,
          numero: Number(r.numero),
          nome: r.m2a_dotacao_default
            ? `${r.nome} · ${r.m2a_dotacao_default}`
            : r.nome,
          ref_coluna: Number(r.m2a_ref_coluna),
          secretaria_id: r.id,
        }));
    },
  });

  const unidadeById = useMemo(
    () => new Map(((unidades ?? []) as UnidadeIrp[]).map((u) => [u.id, u])),
    [unidades],
  );

  return { unidades, unidadeById, isLoading };
}
