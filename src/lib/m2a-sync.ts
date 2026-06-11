// Tipos compartilhados para sincronização de processos da M2A via worker/VPS.

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
  processo_id?: string;
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
