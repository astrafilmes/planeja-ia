// Cliente front-end para criação de Processo COMUM (não-SRP) no portal M2A.
// Reaproveita os tipos do fluxo SRP, mas dispensa data_consolidacao.

import { supabase } from "@/integrations/supabase/client";
import type {
  M2ASrpItemIRP,
  M2ASrpSecretariaParticipante,
} from "./m2a-srp";

export type M2AComumProgressEvent =
  | { type: "start"; mensagem: string }
  | {
      type: "progress";
      etapa: string;
      mensagem: string;
      progresso?: number;
      payload?: any;
    }
  | {
      type: "done";
      processoId: string;
      dfdId: string;
      dfdsParticipantes: string[];
      totalDfds: number;
      totalItens: number;
      justificativaGerada: boolean;
      erros: Array<{ etapa: string; erro: string; secretaria?: string }>;
    }
  | { type: "cancelled"; mensagem: string }
  | { type: "error"; error: string };

export interface M2AComumPayload {
  objeto: string;
  data: string;
  ano_orcamento: string | number;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora?: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao?: string;
  numero?: string;
  gerenciadora_numero: number;
  gerenciadora_chave?: string;
  itens: M2ASrpItemIRP[];
  secretariasParticipantes: (M2ASrpSecretariaParticipante & {
    responsavel_dfd?: string;
    comissao_planejamento?: string;
    despesa_projeto_atividade?: string | null;
    m2a_despesa_projeto_id?: string | null;
  })[];
}

const PROXY_URL = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/m2a-proxy`;

export async function criarProcessoComumM2A(
  payload: M2AComumPayload,
  onEvent: (evt: M2AComumProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Sessão expirada — refaça o login.");

  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        path: "/processos/comum/criar",
        method: "POST",
        body: payload,
      }),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      onEvent({ type: "cancelled", mensagem: "Envio cancelado." });
      return;
    }
    throw err;
  }

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `m2a-proxy retornou ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ""}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = block.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const ln of lines) {
        if (ln.startsWith("event:")) event = ln.slice(6).trim();
        else if (ln.startsWith("data:")) dataLines.push(ln.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let data: any = null;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        data = { raw: dataLines.join("\n") };
      }
      if (event === "start")
        onEvent({ type: "start", mensagem: data?.mensagem ?? "" });
      else if (event === "progress")
        onEvent({
          type: "progress",
          etapa: data?.etapa ?? "",
          mensagem: data?.mensagem ?? "",
          progresso: data?.progresso,
          payload: data?.payload,
        });
      else if (event === "done")
        onEvent({
          type: "done",
          processoId: String(data?.processoId ?? ""),
          dfdId: String(data?.dfdId ?? ""),
          dfdsParticipantes: Array.isArray(data?.dfdsParticipantes)
            ? data.dfdsParticipantes.map(String)
            : [],
          totalDfds: Number(data?.totalDfds ?? 0),
          totalItens: Number(data?.totalItens ?? 0),
          justificativaGerada: Boolean(data?.justificativaGerada),
          erros: Array.isArray(data?.erros) ? data.erros : [],
        });
      else if (event === "error")
        onEvent({
          type: "error",
          error: String(data?.error ?? "erro desconhecido"),
        });
    }
  }
}
