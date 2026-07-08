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

/* ---------- Participantes (status incluído/não) ---------- */

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

/* ---------- Saldos por secretaria (cota − consumo) ---------- */

export type SaldoItemPorSecretaria = {
  numero: string | null;
  descricao: string;
  unidade: string | null;
  cota: number | null;
  consumido: number;
  saldo: number | null;
};

export type SaldoSecretariaAta = {
  participanteId: number | null;
  secretariaNome: string;
  secretariaKey: string;
  exercicio: number | null;
  incluido: boolean;
  itens: SaldoItemPorSecretaria[];
};

export type SaldosPorSecretariaResponse = {
  ataId: string | number;
  processoId?: string | null;
  secretarias: SaldoSecretariaAta[];
  avisos: string[];
  consumoDebug?: {
    contratosConsiderados: number;
    linhas: number;
    contratosPorSecretariaItem?: Record<
      string,
      Record<
        string,
        Array<{
          contratoId: number | string;
          numeroContrato?: string | null;
          processoId?: string | null;
          processoNumero?: string | null;
          quantidade?: number | null;
        }>
      >
    >;
  };
};

export function fetchSaldosPorSecretariaAta(
  ataId: string,
  opts: { forceRefresh?: boolean; m2aProcessoId?: string | null } = {},
): Promise<SaldosPorSecretariaResponse> {
  const params = new URLSearchParams();
  if (opts.forceRefresh) params.set("refresh", "1");
  if (opts.m2aProcessoId) params.set("m2a_processo_id", opts.m2aProcessoId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return callProxyJson<SaldosPorSecretariaResponse>(
    `/atas/${ataId}/saldos-por-secretaria${q}`,
    "GET",
  );
}

/* ---------- Garantir participantes ---------- */

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
