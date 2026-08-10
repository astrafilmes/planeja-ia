/**
 * Tipos compartilhados e helpers para a camada M2A.
 */
import { type M2ADocumentoGerado, type ContratoRow } from "../lib";

/**
 * Retorna os documentos gerados para o contrato, formatados para download.
 */
export function getContratoDocumentos(contrato: ContratoRow): M2ADocumentoGerado[] {
  if (!contrato.m2a_documentos_gerados) return [];
  const raw = contrato.m2a_documentos_gerados as any[];
  
  return raw.map((doc: any) => {
    // Mapeia o formato do banco para o formato M2ADocumentoGerado
    return {
      id_m2a: String(doc.id_m2a || doc.id || ""),
      nome: String(doc.nome || ""),
      contratoId: contrato.id,
      contratoNumero: contrato.numero_contrato,
      m2aContratoId: contrato.m2a_contrato_id || undefined,
    };
  }).filter(d => d.id_m2a && d.nome);
}
