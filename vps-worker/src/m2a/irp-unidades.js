// Mapa de unidade de medida (nome completo, conforme planilha) → ID da M2A.
// Mantenha as chaves NORMALIZADAS (UPPER, sem acentos, sem pontuação).
// Inclua aqui novas unidades à medida que aparecerem no portal.

const MAPA = {
  UNIDADE: "2",
  SERVICO: "71",
  // adicione quando descobrir o ID na M2A:
  // KILOGRAMA: "?",
  // METRO: "?",
  // METRO_QUADRADO: "?",
  // METRO_CUBICO: "?",
  // LITRO: "?",
  // CAIXA: "?",
  // PACOTE: "?",
  // PAR: "?",
  // ROLO: "?",
  // RESMA: "?",
  // HORA: "?",
  // GRAMA: "?",
  // MILILITRO: "?",
  // GALAO: "?",
};

// alguns aliases comuns (sigla → nome completo)
const ALIAS = {
  UN: "UNIDADE",
  UND: "UNIDADE",
  UNID: "UNIDADE",
  PC: "UNIDADE",
  PCA: "UNIDADE",
  PCS: "UNIDADE",
  SERV: "SERVICO",
  SERVICOS: "SERVICO",
  KG: "KILOGRAMA",
  KGS: "KILOGRAMA",
  M: "METRO",
  MT: "METRO",
  MTS: "METRO",
  M2: "METRO_QUADRADO",
  M3: "METRO_CUBICO",
  L: "LITRO",
  LT: "LITRO",
  LTS: "LITRO",
  CX: "CAIXA",
  PCT: "PACOTE",
  PAR: "PAR",
  PARES: "PAR",
  RL: "ROLO",
  ROLO: "ROLO",
  RES: "RESMA",
  H: "HORA",
  HR: "HORA",
  HRS: "HORA",
  G: "GRAMA",
  GR: "GRAMA",
  ML: "MILILITRO",
  GAL: "GALAO",
};

function normalizar(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function resolverUnidadeId(unidadeRaw) {
  const norm = normalizar(unidadeRaw);
  if (!norm) return null;
  if (MAPA[norm]) return MAPA[norm];
  if (ALIAS[norm] && MAPA[ALIAS[norm]]) return MAPA[ALIAS[norm]];
  return null;
}

export function nomeUnidadeNormalizado(unidadeRaw) {
  const norm = normalizar(unidadeRaw);
  return ALIAS[norm] || norm;
}
