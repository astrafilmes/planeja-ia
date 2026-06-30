// Cliente unificado de integração M2A.
// Toda a lógica do antigo background.js + automation_engine.js + scrapers da
// extensão Chrome roda agora no VPS worker (Fastify). O navegador fala apenas
// com a edge function `m2a-proxy`, que assina HMAC e encaminha para a VPS.
//
// Para manter compatibilidade com as telas existentes (processos.$id.tsx,
// contratos.$id.tsx, irp.tsx, numeracao.tsx) mantemos as mesmas funções
// públicas e o mesmo modelo de eventos via window.postMessage —
// só que agora os eventos são gerados pelos handlers SSE deste módulo.

import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Tipos públicos (idênticos à versão anterior)
// ============================================================

export type M2AEtapa =
  | "validacao"
  | "diagnostico"
  | "recuperar_id"
  | "criar_contrato"
  | "vincular_atores"
  | "incluir_itens"
  | "atualizar_quantidades"
  | "incluir_dotacoes"
  | "incluir_atores"
  | "enviar_documentos"
  | "criar_dfd"
  | "buscar_ids"
  | "atualizar_processo"
  | "importar_planilhas"
  | "concluido"
  | "erro";

export interface M2AProgressEvent {
  type: "M2A_PROGRESS";
  contratoId: string;
  requestId?: string;
  scope?: string;
  etapa: M2AEtapa;
  mensagem: string;
  sucesso?: boolean;
  http_status?: number;
  duracao_ms?: number;
  payload?: unknown;
  response?: unknown;
  m2a_contrato_id?: string;
  status?: string;
  progresso?: number;
  fase?: number;
  itemAtual?: number;
  totalItens?: number;
  dfdId?: string;
  processoId?: string;
  numeroProcesso?: string;
  numeroLimpo?: string;
  importacoes?: unknown;
  documentosM2A?: M2ADocumentoGerado[];
}

export interface M2ADocumentoGerado {
  id_m2a: string;
  nome: string;
  contratoId?: string;
  contratoNumero?: string;
  m2aContratoId?: string;
}

export interface M2AUrlDocumento {
  origem: "url";
  url: string;
  nome: string;
  mimeType?: string;
}

export type M2ABulkDownloadDocumento = M2ADocumentoGerado | M2AUrlDocumento;

export interface M2AAutomationPayload {
  contratoId: string;
  m2aProcessoUrl?: string | null;
  m2aAtaId?: string | null;
  contrato: Record<string, unknown>;
  itens: Array<Record<string, unknown>>;
  dadosDotacao?: Record<string, unknown>;
  dadosM2A?: Record<string, unknown>;
}

export interface M2AProcessImportacaoPayload {
  orgao_pk: string;
  unidade_orcamentaria_pk: string;
  arquivo_xlsx:
    | string
    | {
        dataUrl?: string;
        base64?: string;
        signedUrl?: string;
        filename?: string;
        mimeType?: string;
      };
  filename?: string;
  nome?: string;
}

export interface M2AProcessCreationPayload {
  requestId?: string;
  tipo?: "processo_srp";
  objeto: string;
  data: string;
  data_aviso?: string;
  ano_orcamento: string;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora?: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao: string;
  listaImportacoes: M2AProcessImportacaoPayload[];
  m2aBaseUrl?: string;
}

export function extractM2AProcessoId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const novo = url.match(/\/processo_administrativo\/(\d+)/);
  if (novo) return novo[1];
  const antigo = url.match(/\/detail\/(\d+)/);
  return antigo ? antigo[1] : null;
}

function isTrustedM2AEvent(e: MessageEvent): boolean {
  if (e.source !== window) return false;
  if (typeof window === "undefined") return false;
  if (e.origin && e.origin !== window.location.origin) return false;
  return true;
}

// O worker M2A está sempre disponível via edge function. Mantém a função
// só para compatibilidade — sempre devolve true se há sessão Supabase.
export async function isExtensionInstalled(_timeoutMs = 600): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

function emitWindow(message: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.postMessage(message, window.location.origin);
}

// ============================================================
// Helper interno: chama edge `m2a-proxy` e consome SSE via fetch
// (o SDK supabase-js bufferiza, então usamos fetch direto na URL da
// função edge, mantendo o header Authorization da sessão atual).
// ============================================================

interface SseCallbacks {
  onProgress?: (evt: Record<string, unknown>) => void;
  onDone?: (evt: Record<string, unknown>) => void;
  onError?: (err: string) => void;
}

async function callProxySse(
  path: string,
  body: unknown,
  cb: SseCallbacks,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    cb.onError?.("Sessão expirada. Faça login novamente.");
    return;
  }
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(
    /\/+$/,
    "",
  );
  const url = `${baseUrl}/functions/v1/m2a-proxy`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, method: "POST", body }),
    });
  } catch (err) {
    cb.onError?.(err instanceof Error ? err.message : String(err));
    return;
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    cb.onError?.(text || `HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(dataLines.join("\n"));
      } catch {
        parsed = { raw: dataLines.join("\n") };
      }
      if (event === "progress") cb.onProgress?.(parsed);
      else if (event === "done") cb.onDone?.(parsed);
      else if (event === "error")
        cb.onError?.(String(parsed.error ?? "Erro no worker"));
    }
  }
}

async function callProxyJson<T = unknown>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "POST",
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

// ============================================================
// Envio de contrato (substitui sendToM2A da extensão)
// ============================================================

export function sendToM2A(payload: M2AAutomationPayload): void {
  const contratoId = payload.contratoId;
  emitWindow({
    type: "M2A_PROGRESS",
    contratoId,
    etapa: "validacao",
    mensagem: "Conectando ao worker M2A…",
  } satisfies M2AProgressEvent);

  void callProxySse("/contratos/processar", payload, {
    onProgress: (evt) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId,
        ...evt,
      });
    },
    onDone: (evt) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId,
        etapa: "concluido",
        sucesso: true,
        mensagem: "Contrato enviado com sucesso ao portal M2A.",
        m2a_contrato_id: (evt as { m2a_contrato_id?: string }).m2a_contrato_id,
        documentosM2A: (evt as { documentosM2A?: M2ADocumentoGerado[] })
          .documentosM2A,
      } satisfies M2AProgressEvent);
    },
    onError: (err) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId,
        etapa: "erro",
        sucesso: false,
        mensagem: err,
      } satisfies M2AProgressEvent);
    },
  });
}

export function diagnoseM2A(payload: M2AAutomationPayload): void {
  const contratoId = payload.contratoId;
  emitWindow({
    type: "M2A_PROGRESS",
    contratoId,
    etapa: "diagnostico",
    mensagem: "Executando diagnóstico no worker M2A…",
  } satisfies M2AProgressEvent);

  callProxyJson("/contratos/diagnosticar", payload)
    .then((result) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId,
        etapa: "diagnostico",
        sucesso: true,
        mensagem: "Diagnóstico concluído sem gravação.",
        response: result,
      } satisfies M2AProgressEvent);
    })
    .catch((err: Error) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId,
        etapa: "erro",
        sucesso: false,
        mensagem: err.message,
      } satisfies M2AProgressEvent);
    });
}

// ============================================================
// Criação de processo SRP (substitui requestM2AProcessCreation)
// ============================================================

export function requestM2AProcessCreation(
  payload: M2AProcessCreationPayload,
): string {
  const requestId =
    payload.requestId ??
    `processo_srp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const enrichedPayload = { ...payload, requestId, tipo: "processo_srp" };

  emitWindow({
    type: "M2A_PROGRESS",
    contratoId: requestId,
    requestId,
    etapa: "validacao",
    mensagem: "Conectando ao worker M2A para criar processo…",
  } satisfies M2AProgressEvent);

  void callProxySse("/processos/srp/criar", enrichedPayload, {
    onProgress: (evt) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId: requestId,
        requestId,
        ...evt,
      });
    },
    onDone: (evt) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId: requestId,
        requestId,
        etapa: "concluido",
        sucesso: true,
        mensagem: "Processo SRP criado no portal M2A.",
        ...(evt as Record<string, unknown>),
      });
    },
    onError: (err) => {
      emitWindow({
        type: "M2A_PROGRESS",
        contratoId: requestId,
        requestId,
        etapa: "erro",
        sucesso: false,
        mensagem: err,
      } satisfies M2AProgressEvent);
    },
  });

  return requestId;
}

// ============================================================
// Listeners (inalterados — só escutam window.postMessage)
// ============================================================

export function listenM2AProgress(
  contratoId: string,
  cb: (e: M2AProgressEvent) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (!isTrustedM2AEvent(e)) return;
    const d = e.data as M2AProgressEvent | undefined;
    if (!d || d.type !== "M2A_PROGRESS") return;
    if (d.contratoId !== contratoId) return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export function listenAllM2AProgress(
  cb: (e: M2AProgressEvent) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (!isTrustedM2AEvent(e)) return;
    const d = e.data as M2AProgressEvent | undefined;
    if (!d || d.type !== "M2A_PROGRESS") return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export function listenM2AProcessCreationProgress(
  requestId: string,
  cb: (e: M2AProgressEvent) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (!isTrustedM2AEvent(e)) return;
    const d = e.data as M2AProgressEvent | undefined;
    if (!d || d.type !== "M2A_PROGRESS") return;
    if (d.requestId !== requestId) return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export type M2ABulkDownloadProgress =
  | {
      type: "M2A_BULK_DOWNLOAD_PROGRESS";
      status: "iniciado" | "progresso" | "concluido";
      total: number;
      baixados: number;
      documento?: M2ADocumentoGerado;
      arquivoZip?: boolean;
    }
  | {
      type: "M2A_BULK_DOWNLOAD_PROGRESS";
      status: "erro";
      mensagem: string;
    };

export type M2ABulkDownloadOptions = {
  archive?: boolean;
  filename?: string;
};

// Os helpers `requestM2ABulkDownload` / `listenM2ABulkDownload` foram removidos.
// O download de documentos agora é feito 100% via VPS worker — veja
// `src/lib/m2a-documents.ts` (downloadM2ADocuments).

export const ETAPA_LABEL: Record<M2AEtapa, string> = {
  validacao: "Validando sessão",
  diagnostico: "Diagnóstico",
  recuperar_id: "Recuperando contrato",
  criar_contrato: "Criando contrato",
  vincular_atores: "Vinculando atores",
  incluir_itens: "Incluindo itens",
  atualizar_quantidades: "Atualizando quantidades",
  incluir_dotacoes: "Incluindo dotações",
  incluir_atores: "Incluindo atores",
  enviar_documentos: "Configurando documentos",
  criar_dfd: "Criando DFD",
  buscar_ids: "Buscando IDs",
  atualizar_processo: "Atualizando processo",
  importar_planilhas: "Importando planilhas",
  concluido: "Concluído",
  erro: "Erro",
};

export const ETAPAS_ORDEM: M2AEtapa[] = [
  "validacao",
  "diagnostico",
  "recuperar_id",
  "criar_contrato",
  "vincular_atores",
  "incluir_itens",
  "atualizar_quantidades",
  "incluir_dotacoes",
  "incluir_atores",
  "enviar_documentos",
];

// ============================================================
// Sincronização de numeração por secretaria
// ============================================================

export interface M2ASyncSecretariaInput {
  sigla: string;
  num: number;
}

export interface M2ASyncItemResult {
  sigla: string;
  num: number;
  ultimo_numero: number | null;
  ano?: number;
  erro?: string;
}

export interface M2ASyncResult {
  type: "M2A_SYNC_RESULT";
  requestId: string;
  itens: M2ASyncItemResult[];
  erro?: string;
}

export interface M2ASyncProgress {
  type: "M2A_SYNC_PROGRESS";
  requestId: string;
  sigla: string;
  resultado: M2ASyncItemResult;
}

export function requestNumeracaoSync(
  secretarias: M2ASyncSecretariaInput[],
  ano: number = new Date().getFullYear(),
): string {
  const requestId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sigsParam = secretarias
    .map((s) => s.sigla)
    .filter(Boolean)
    .join(",");
  const numByPath = new Map(secretarias.map((s) => [s.sigla, s.num]));

  callProxyJson<{
    ano: number;
    itens: Array<{ sigla: string; ano: number; ultimo_numero: number | null; erro?: string }>;
  }>(`/numeracao?ano=${ano}&secretarias=${encodeURIComponent(sigsParam)}`, undefined, "GET")
    .then((result) => {
      const itens: M2ASyncItemResult[] = (result.itens ?? []).map((it) => ({
        sigla: it.sigla,
        num: numByPath.get(it.sigla) ?? 0,
        ultimo_numero: it.ultimo_numero,
        ano: it.ano,
        erro: it.erro,
      }));
      // Emite progresso individual para compatibilidade com listener atual
      for (const item of itens) {
        emitWindow({
          type: "M2A_SYNC_PROGRESS",
          requestId,
          sigla: item.sigla,
          resultado: item,
        });
      }
      emitWindow({
        type: "M2A_SYNC_RESULT",
        requestId,
        itens,
      });
    })
    .catch((err: Error) => {
      emitWindow({
        type: "M2A_SYNC_RESULT",
        requestId,
        itens: [],
        erro: err.message,
      });
    });

  return requestId;
}

export function listenNumeracaoSync(
  requestId: string,
  cb: (e: M2ASyncProgress | M2ASyncResult) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (e.source !== window) return;
    if (e.origin && e.origin !== window.location.origin) return;
    const d = e.data;
    if (!d || (d.type !== "M2A_SYNC_PROGRESS" && d.type !== "M2A_SYNC_RESULT"))
      return;
    if (d.requestId !== requestId) return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
