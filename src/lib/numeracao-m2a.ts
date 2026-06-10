// Motor de numeração baseado no snapshot de contratos existentes na M2A.
// Formato esperado: NNN/AAAA<SIGLA>SS (ex.: "012/2025ADM03").
// Variações aceitas: hífen e espaços entre partes ("012/2025-ADM 03"),
// zeros à esquerda, case-insensitive na sigla, e acentos na sigla são
// removidos via normalize("NFD").

export interface M2aContratoExistente {
  id_contrato_m2a: string;
  numero_contrato: string;
  id_ata: string;
}

export interface NumeroContratoParts {
  seqContrato: number;
  ano: number;
  sigla: string;
  sequencia: number;
}

const NUM_REGEX =
  /^\s*0*(\d{1,4})\s*\/\s*(\d{4})\s*[-\s]*([A-Z]+?)\s*0*(\d{1,4})\s*$/i;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseNumeroContrato(raw: string): NumeroContratoParts | null {
  if (!raw) return null;
  const cleaned = stripDiacritics(String(raw)).trim();
  const m = cleaned.match(NUM_REGEX);
  if (!m) return null;
  return {
    seqContrato: Number(m[1]),
    ano: Number(m[2]),
    sigla: m[3].toUpperCase(),
    sequencia: Number(m[4]),
  };
}

/**
 * Calcula o próximo número sequencial de contrato para uma
 * dada sigla + ano, a partir do snapshot da M2A.
 * Retorna `max(sequencia) + 1`, ou `1` se nenhum encontrado.
 */
export function calcularProximaNumeracao(
  contratosExistentes: M2aContratoExistente[],
  siglaSecretaria: string,
  ano: number,
): number {
  const siglaAlvo = stripDiacritics(siglaSecretaria).toUpperCase().trim();
  let max = 0;
  for (const c of contratosExistentes ?? []) {
    const parts = parseNumeroContrato(c.numero_contrato);
    if (!parts) continue;
    if (parts.ano !== ano) continue;
    if (parts.sigla !== siglaAlvo) continue;
    if (parts.sequencia > max) max = parts.sequencia;
  }
  return max + 1;
}
