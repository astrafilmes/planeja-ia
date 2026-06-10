// Ponte entre o sistema Planejamento e a extensão Chrome M2A Integrador.
// Toda mensagem sai por este módulo para manter validação de origem e formato
// consistentes entre as telas.

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
  // Novo formato: /processo_administrativo/36002/
  const novo = url.match(/\/processo_administrativo\/(\d+)/);
  if (novo) return novo[1];
  // Formato antigo: /detail/30111/
  const antigo = url.match(/\/detail\/(\d+)/);
  return antigo ? antigo[1] : null;
}

// Aceita mensagens apenas da própria janela (mesma origem).
// Evita spoofing de eventos M2A por iframes ou scripts de terceiros.
function isTrustedM2AEvent(e: MessageEvent): boolean {
  if (e.source !== window) return false;
  if (typeof window === "undefined") return false;
  if (e.origin && e.origin !== window.location.origin) return false;
  return true;
}

export function isExtensionInstalled(timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const onMsg = (e: MessageEvent) => {
      if (!isTrustedM2AEvent(e)) return;
      if (e.data?.type === "M2A_BRIDGE_PONG") {
        done = true;
        window.removeEventListener("message", onMsg);
        resolve(true);
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "M2A_BRIDGE_PING" }, window.location.origin);
    setTimeout(() => {
      if (!done) {
        window.removeEventListener("message", onMsg);
        resolve(false);
      }
    }, timeoutMs);
  });
}

function postM2AEvent(type: string, payload?: unknown) {
  window.postMessage(
    payload === undefined ? { type } : { type, payload },
    window.location.origin,
  );
}

export function sendToM2A(payload: M2AAutomationPayload) {
  postM2AEvent("M2A_START_AUTOMATION", payload);
}

export function diagnoseM2A(payload: M2AAutomationPayload) {
  postM2AEvent("M2A_DIAGNOSTIC_AUTOMATION", payload);
}

export function requestM2AProcessCreation(
  payload: M2AProcessCreationPayload,
): string {
  const requestId =
    payload.requestId ??
    `processo_srp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  postM2AEvent("M2A_START_PROCESS_CREATION", {
    ...payload,
    requestId,
    tipo: "processo_srp",
  });
  return requestId;
}

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

export function requestM2ABulkDownload(
  documentos: M2ABulkDownloadDocumento[],
  options?: M2ABulkDownloadOptions,
) {
  window.postMessage(
    { type: "M2A_BULK_DOWNLOAD", documentos, options },
    window.location.origin,
  );
}

export function listenM2ABulkDownload(
  cb: (e: M2ABulkDownloadProgress) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (!isTrustedM2AEvent(e)) return;
    const d = e.data as M2ABulkDownloadProgress | undefined;
    if (!d || d.type !== "M2A_BULK_DOWNLOAD_PROGRESS") return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

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
  window.postMessage(
    {
      type: "M2A_SYNC_NUMERACAO",
      payload: { requestId, secretarias, ano },
    },
    window.location.origin,
  );
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
