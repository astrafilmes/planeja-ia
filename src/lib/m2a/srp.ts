// Cliente front-end para criação de Processo SRP no portal M2A.
// Chama edge function m2a-proxy → VPS worker, consome SSE de progresso.

import { supabase } from "@/integrations/supabase/client";

export type M2ASrpProgressEvent =
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
      erros: Array<{ index: number; nome: string; erro: string }>;
      totalPlanilhas: number;
    }
  | { type: "error"; error: string };

export interface M2ASrpItemIRP {
  descricao: string;
  especificacao: string;
  natureza: string;          // ex: "33903000"
  unidade: string;           // nome completo, ex: "UNIDADE", "SERVICO"
  valorReferencia?: number;
  /** Mapa numero_secretaria → quantidade */
  quantidades: Record<string, number>;
}

export interface M2ASrpSecretariaParticipante {
  chave: string;
  numero: number;
  sigla: string;
  nome: string;
  m2a_orgao_id: string | null;
  m2a_dot_orgao_id?: string | null;
  m2a_uo_id: string | null;
  /** ID Django numérico do despesa_projeto_atividade (dotação) cadastrado na secretaria */
  m2a_dot_id?: string | null;
  ref_coluna?: number | null;
}

export interface M2ASrpPayload {
  objeto: string;
  data: string; // YYYY-MM-DD — usada como data DFD/IRP/manifestação/finalização
  data_consolidacao?: string; // YYYY-MM-DD — usada no passo "consolidar"
  ano_orcamento: string | number;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora?: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao?: string;
  numero?: string;
  /** numero da secretaria gerenciadora (para diferenciá-la das participantes) */
  gerenciadora_numero: number;
  gerenciadora_chave?: string;
  itens: M2ASrpItemIRP[];
  secretariasParticipantes: M2ASrpSecretariaParticipante[];
}

const PROXY_URL = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/m2a-proxy`;

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Inicia a criação do processo SRP no portal M2A via VPS worker (SSE).
 * Cada evento (start/progress/done/error) é entregue em onEvent.
 */
export async function criarProcessoSrpM2A(
  payload: M2ASrpPayload,
  onEvent: (evt: M2ASrpProgressEvent) => void,
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
        path: "/processos/srp/criar",
        method: "POST",
        body: payload,
      }),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      onEvent({ type: "error", error: "Envio cancelado." });
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
    // SSE: separa por linha em branco
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
      if (event === "start") onEvent({ type: "start", mensagem: data?.mensagem ?? "" });
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
          erros: data?.erros ?? [],
          totalPlanilhas: Number(data?.totalPlanilhas ?? 0),
        });
      else if (event === "error")
        onEvent({ type: "error", error: String(data?.error ?? "erro desconhecido") });
    }
  }
}
