// =====================================================================
// Dicionário oficial de Unidades Orçamentárias do portal M2A (Itarema 2026).
// Chave = string EXATA que aparece na coluna "Unidade orçamentária
// solicitante" da tabela de intenções da M2A.
// Valor = { orgao_id, unidade_id, colunas_csv } onde colunas_csv lista os
// rótulos/siglas usadas nas colunas da planilha de origem (CSV) para somar
// a demanda dessa UO.
//
// Uso típico:
//   const entry = encontrarUnidadeNoDicionario(textoLinhaIntencao);
//   if (!entry) continue;             // bypass: UO desconhecida
//   if (somaQtdParaColunas(entry.colunas_csv) <= 0) continue;  // bypass: sem demanda
// =====================================================================

import { normalizeComparableText } from "./utils.js";

export const M2A_DICIONARIO_COMPLETO = {
  // ADMINISTRAÇÃO E GESTÃO
  "01 - Gabinete do Prefeito (2026)": { orgao_id: 10022, unidade_id: 14712, colunas_csv: ["GAB"] },
  "01 - Controladoria Geral do Município (2026)": { orgao_id: 10006, unidade_id: 12877, colunas_csv: ["CGM"] },
  "01 - Secretaria Municipal de Administração, Finanças e Planejamento (2026)": { orgao_id: 10023, unidade_id: 12897, colunas_csv: ["ADM"] },
  "01 - Secretaria Municipal de Infraestrutura, Mobilidade e Serviços Públicos (2026)": { orgao_id: 10024, unidade_id: 12898, colunas_csv: ["INF"] },
  "01 - Secretaria Municipal de Desenvolvimento Rural e Pesca (2026)": { orgao_id: 10025, unidade_id: 12899, colunas_csv: ["DES"] },
  "01 - Secretaria Municipal de Esporte, Juventude e Lazer (2026)": { orgao_id: 10026, unidade_id: 12901, colunas_csv: ["EJL"] },
  "01 - Secretaria Municipal de Meio Ambiente (2026)": { orgao_id: 10031, unidade_id: 12913, colunas_csv: ["MEIO AMBIENTE"] },
  "01 - Secretaria Municipal de Cultura e Turismo (2026)": { orgao_id: 11291, unidade_id: 14718, colunas_csv: ["CUT"] },
  "01 - Fundo de Previdência Social do Município de Itarema (2026)": { orgao_id: 10030, unidade_id: 12912, colunas_csv: ["PREVIDÊNCIA", "FPS"] },

  // EDUCAÇÃO
  "01 - Secretaria Municipal de Educação (2026)": { orgao_id: 10027, unidade_id: 12902, colunas_csv: ["SEC EDU", "SME"] },
  "03 - FUNDEB (2026)": { orgao_id: 10027, unidade_id: 12904, colunas_csv: ["FUNDEB"] },

  // SAÚDE
  "01 - Secretaria Municipal de Saúde (2026)": { orgao_id: 10028, unidade_id: 12905, colunas_csv: ["SAÚDE", "SMS"] },
  "02 - Fundo Municipal de Saúde (2026)": { orgao_id: 10028, unidade_id: 12906, colunas_csv: ["FMS"] },
  "03 - Hospital Municipal de Itarema - Natércia Rios (2026)": { orgao_id: 10028, unidade_id: 12907, colunas_csv: ["HOSPITAL", "HOSP"] },

  // ASSISTÊNCIA SOCIAL (SPS)
  "01 - Secretaria Municipal de Proteção Social e Cidadania (2026)": { orgao_id: 10029, unidade_id: 12908, colunas_csv: ["PROTECAO", "SPS"] },
  "02 - Fundo Municipal de Assistência Social (2026)": { orgao_id: 10029, unidade_id: 12909, colunas_csv: ["FUNDO", "CRAS SCFV", "CREAS"] },
};

// Índice normalizado p/ matching tolerante (acentos/caixa/espaços).
const _INDEX = Object.entries(M2A_DICIONARIO_COMPLETO).map(([key, val]) => ({
  key,
  keyNorm: normalizeComparableText(key),
  val,
}));

/**
 * Procura uma entrada do dicionário a partir de texto livre extraído da
 * coluna "Unidade orçamentária solicitante" (ou de toda a linha da tabela).
 * Faz match por inclusão normalizada — funciona mesmo se o portal devolver
 * texto com colunas extras concatenadas.
 *
 * @returns {{key:string, orgao_id:number, unidade_id:number, colunas_csv:string[]}|null}
 */
export function encontrarUnidadeNoDicionario(texto) {
  if (!texto) return null;
  const txt = normalizeComparableText(texto);
  if (!txt) return null;
  // tenta match exato primeiro, depois inclusão (mais longo vence p/ evitar
  // colisão "Secretaria Municipal de Saúde" ⊂ "Fundo Municipal de Saúde").
  let melhor = null;
  for (const row of _INDEX) {
    if (!row.keyNorm) continue;
    if (txt.includes(row.keyNorm)) {
      if (!melhor || row.keyNorm.length > melhor.keyNorm.length) melhor = row;
    }
  }
  if (!melhor) return null;
  return { key: melhor.key, ...melhor.val };
}

/**
 * Procura uma entrada por orgao_id + unidade_id (atalho se o portal já
 * devolveu esses IDs via data-attrs).
 */
export function encontrarUnidadePorIds(orgaoId, unidadeId) {
  const oId = Number(orgaoId);
  const uId = Number(unidadeId);
  for (const [key, val] of Object.entries(M2A_DICIONARIO_COMPLETO)) {
    if (uId && val.unidade_id === uId) return { key, ...val };
    if (oId && val.orgao_id === oId && !uId) return { key, ...val };
  }
  return null;
}

/**
 * Dado um array de secretarias do nosso catálogo e uma lista de
 * `colunas_csv` (rótulos do dicionário), devolve as secretarias do
 * catálogo cuja sigla/nome bate com algum desses rótulos.
 */
export function secretariasParaColunas(secretarias, colunas_csv) {
  if (!Array.isArray(secretarias) || !Array.isArray(colunas_csv)) return [];
  const alvos = colunas_csv.map((c) => normalizeComparableText(c)).filter(Boolean);
  return secretarias.filter((s) => {
    const sig = normalizeComparableText(s.sigla || "");
    const nom = normalizeComparableText(s.nome || "");
    return alvos.some((a) => (sig && sig.includes(a)) || (nom && nom.includes(a)) || (a && (a.includes(sig) || a.includes(nom))));
  });
}
