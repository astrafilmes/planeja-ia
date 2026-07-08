// Cliente tipado para os endpoints /atas/* do worker M2A.
// Todos os requests passam pela edge function `m2a-proxy` (HMAC-signed).

import { supabase } from "@/integrations/supabase/client";

async function callProxyJson<T = unknown>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("m2a-proxy", {
    body: { path, method, body },
  });
  if (error) throw new Error(error.message || "Falha no m2a-proxy");
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data as { error?: string }).error
  ) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export type AtaItemSaldo = {
  m2a_item_id: string;
  numero: string | null;
  descricao: string;
  quantidade_total: number | null;
  quantidade_utilizada: number | null;
  saldo: number | null;
};

export type SaldosAtaResponse = {
  ataId: string | number;
  itens: AtaItemSaldo[];
  avisos: string[];
};

export function fetchSaldosAta(ataId: string): Promise<SaldosAtaResponse> {
  return callProxyJson<SaldosAtaResponse>(`/atas/${ataId}/saldos`, "GET");
}

export type ParticipanteAta = {
  participanteId: number | null;
  nome: string;
  incluido: boolean;
};

export function fetchParticipantesAta(ataId: string) {
  return callProxyJson<{ ataId: string; participantes: ParticipanteAta[] }>(
    `/atas/${ataId}/participantes`,
    "GET",
  );
}

export type GarantirParticipanteResult = {
  secretariaId: string;
  nome: string;
  participanteId?: number;
  unidadeGestoraId?: string | number;
  status:
    | "ja_incluida"
    | "incluida_agora"
    | "sem_equivalencia"
    | "sem_participante_na_ata"
    | "erro";
  mensagem?: string;
};

export function garantirParticipantesAta(
  ataId: string,
  body: {
    data: string;
    alvos: Array<{
      secretariaId: string;
      nome: string;
      unidadeGestoraId?: string | number;
    }>;
    ugsDisponiveis?: Array<{ id: string | number; nome: string }>;
  },
) {
  return callProxyJson<{ results: GarantirParticipanteResult[] }>(
    `/atas/${ataId}/participantes/garantir`,
    "POST",
    body,
  );
}
