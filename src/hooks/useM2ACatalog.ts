import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type M2ACargo = "FISCAL" | "GESTOR" | "PREPOSTO";

export type M2AUnidadeGestora = {
  id_local: string;
  m2a_id: string;
  nome: string;
  sigla: string | null;
};

export type M2AServidor = {
  id_local: string;
  m2a_id: string;
  nome: string;
  cpf: string | null;
  cargo: M2ACargo;
  unidades_gestoras: M2AUnidadeGestora[];
};

const CATALOG_STALE_TIME = 1000 * 60 * 30;

export function useUnidadesGestoras() {
  return useQuery({
    queryKey: ["m2a-unidades-gestoras"],
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_unidades_gestoras")
        .select("id_local, m2a_id, nome, sigla")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as M2AUnidadeGestora[];
    },
  });
}

export function useServidores(cargo?: M2ACargo) {
  return useQuery({
    queryKey: ["m2a-servidores", cargo ?? "todos"],
    staleTime: CATALOG_STALE_TIME,
    queryFn: async () => {
      let servidoresQuery = supabase
        .from("m2a_servidores")
        .select("id_local, m2a_id, nome, cpf, cargo")
        .eq("ativo", true)
        .order("nome");

      if (cargo) servidoresQuery = servidoresQuery.eq("cargo", cargo);

      const [servidoresResult, vinculosResult] = await Promise.all([
        servidoresQuery,
        supabase
          .from("m2a_servidor_unidade")
          .select(
            "servidor_id, m2a_unidades_gestoras(id_local, m2a_id, nome, sigla)",
          ),
      ]);

      if (servidoresResult.error) throw servidoresResult.error;
      if (vinculosResult.error) throw vinculosResult.error;

      const unidadesPorServidor = new Map<string, M2AUnidadeGestora[]>();

      for (const vinculo of vinculosResult.data ?? []) {
        const unidade = Array.isArray(vinculo.m2a_unidades_gestoras)
          ? vinculo.m2a_unidades_gestoras[0]
          : vinculo.m2a_unidades_gestoras;
        if (!unidade) continue;

        const list = unidadesPorServidor.get(vinculo.servidor_id) ?? [];
        list.push(unidade as M2AUnidadeGestora);
        unidadesPorServidor.set(vinculo.servidor_id, list);
      }

      return (servidoresResult.data ?? []).map((servidor) => ({
        ...(servidor as Omit<M2AServidor, "unidades_gestoras">),
        unidades_gestoras: unidadesPorServidor.get(servidor.id_local) ?? [],
      })) as M2AServidor[];
    },
  });
}

export function filterServidoresByUnidade(
  servidores: M2AServidor[],
  unidadeM2AId?: string | null,
) {
  if (!unidadeM2AId) return [];
  return servidores.filter((servidor) =>
    servidor.unidades_gestoras.some(
      (unidade) => unidade.m2a_id === unidadeM2AId,
    ),
  );
}

export function getUnidadeNome(
  unidades: M2AUnidadeGestora[],
  unidadeM2AId?: string | null,
) {
  return (
    unidades.find((unidade) => unidade.m2a_id === unidadeM2AId)?.nome ?? ""
  );
}
