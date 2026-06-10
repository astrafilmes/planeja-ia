import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type M2AEnvioPreference = {
  unidade_gestora_id: string;
  secretaria_id?: string | null;
  data_padrao?: string | null;
  fiscal_id: string;
  gestor_id: string;
};

export function useM2APreferences(unidadeGestoraId?: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["m2a-envio-preferencia", user?.id, unidadeGestoraId],
    enabled: Boolean(user?.id && unidadeGestoraId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m2a_envio_preferencias")
        .select("*")
        .eq("user_id", user!.id)
        .eq("unidade_gestora_id", unidadeGestoraId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const savePreference = useCallback(
    async (preference: M2AEnvioPreference) => {
      if (!user?.id) return;
      const { error } = await supabase.from("m2a_envio_preferencias").upsert(
        {
          user_id: user.id,
          unidade_gestora_id: preference.unidade_gestora_id,
          secretaria_id: preference.secretaria_id ?? null,
          data_padrao: preference.data_padrao ?? null,
          fiscal_id: preference.fiscal_id,
          gestor_id: preference.gestor_id,
        },
        { onConflict: "user_id,unidade_gestora_id" },
      );
      if (error) throw error;
      await qc.invalidateQueries({
        queryKey: [
          "m2a-envio-preferencia",
          user.id,
          preference.unidade_gestora_id,
        ],
      });
    },
    [qc, user?.id],
  );

  return {
    preference: query.data,
    isLoadingPreference: query.isLoading,
    savePreference,
  };
}
