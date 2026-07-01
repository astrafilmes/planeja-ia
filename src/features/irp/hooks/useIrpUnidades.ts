import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { irpQueryKeys, type UnidadeIrp } from "../lib";

export interface UseIrpUnidadesResult {
  unidades: UnidadeIrp[] | undefined;
  unidadeById: Map<string, UnidadeIrp>;
  isLoading: boolean;
}

export function useIrpUnidades(): UseIrpUnidadesResult {
  const { data: unidades, isLoading } = useQuery({
    queryKey: irpQueryKeys.unidades,
    queryFn: async () => {
      const { data } = await supabase
        .from("irp_unidades_processamento")
        .select("*")
        .eq("ativa", true)
        .order("ordem");
      return (data ?? []) as UnidadeIrp[];
    },
  });

  const unidadeById = useMemo(
    () => new Map(((unidades ?? []) as UnidadeIrp[]).map((u) => [u.id, u])),
    [unidades],
  );

  return { unidades, unidadeById, isLoading };
}
