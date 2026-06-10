// Ponte de mensageria para sincronização de processos da M2A.
// O front dispara M2A_START_SYNC_PROCESSO e recebe progresso + payload final.

export interface M2aAtaSync {
  id_ata: string;
  numero_ata: string;
  fornecedor: { nome: string; cnpj?: string };
}

export interface M2aItemSync {
  id_item: string;
  numero_item: string;
  descricao: string;
  unidade: string;
  valor_unitario: number;
  id_ata: string;
}

export interface M2aContratoExistenteSync {
  id_contrato_m2a: string;
  numero_contrato: string;
  id_ata: string;
}

export interface M2aSyncPayload {
  atas: M2aAtaSync[];
  itens: M2aItemSync[];
  contratos_existentes: M2aContratoExistenteSync[];
}

export interface M2aSyncProgressEvent {
  type: "M2A_SYNC_PROCESSO_PROGRESS";
  requestId: string;
  etapa: "abrindo" | "atas" | "itens" | "contratos" | "concluido" | "erro";
  mensagem: string;
}

export interface M2aSyncCompleteEvent {
  type: "M2A_SYNC_PROCESSO_COMPLETE";
  requestId: string;
  payload?: M2aSyncPayload;
  erro?: string;
}

export function createM2aProcessoSyncRequestId(): string {
  return `procsync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function postM2aProcessoSync(requestId: string, m2aProcessoUrl: string) {
  window.postMessage(
    {
      type: "M2A_START_SYNC_PROCESSO",
      payload: { requestId, m2a_processo_url: m2aProcessoUrl },
    },
    window.location.origin,
  );
}

export function startM2aProcessoSync(m2aProcessoUrl: string): string {
  const requestId = createM2aProcessoSyncRequestId();
  postM2aProcessoSync(requestId, m2aProcessoUrl);
  return requestId;
}

export function listenM2aProcessoSync(
  requestId: string,
  cb: (e: M2aSyncProgressEvent | M2aSyncCompleteEvent) => void,
): () => void {
  const handler = (e: MessageEvent) => {
    if (e.source !== window) return;
    if (e.origin && e.origin !== window.location.origin) return;
    const d = e.data;
    if (
      !d ||
      (d.type !== "M2A_SYNC_PROCESSO_PROGRESS" &&
        d.type !== "M2A_SYNC_PROCESSO_COMPLETE")
    )
      return;
    if (d.requestId !== requestId) return;
    cb(d);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
