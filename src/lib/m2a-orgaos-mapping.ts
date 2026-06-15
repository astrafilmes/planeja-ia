// =====================================================================
// Mapeamento manual de órgãos / unidades orçamentárias / responsável DFD
// para criação de processos SRP no M2A (exercício 2026).
//
// IDs vêm direto do M2A. Atualize aqui ao virar o exercício.
// =====================================================================

export interface M2AUnidadeOrcamentaria {
  id: number;
  nome: string;
}

export interface M2AOrgaoMapping {
  /** Nome amigável (sem o prefixo numérico do M2A). */
  nome: string;
  /** ID do "Responsável pelo DFD" (Agente de Planejamento) no M2A. */
  responsavel_dfd_id: number;
  /** Nome do responsável (somente para exibição). */
  responsavel_dfd_nome: string;
  /** Unidades orçamentárias filhas do órgão. */
  unidades: M2AUnidadeOrcamentaria[];
}

export const M2A_RESPONSAVEIS = {
  ANA_SORAYA: { id: 37164, nome: "Ana Soraya Azevedo Henrique" },
  FRANCISCO: { id: 38000, nome: "Francisco José Lopes" },
  LEIDE: { id: 38002, nome: "Leide Vidal dos Santos Nunes" },
  LORENA: { id: 37998, nome: "Lorena Lima Sousa" },
  HAWLYSON: { id: 38004, nome: "Hawlyson Tiago Barbosa Monteiro" },
} as const;

export const M2A_ORGAOS_MAPPING: Record<string, M2AOrgaoMapping> = {
  // SAÚDE -> Francisco
  "10028": {
    nome: "Secretaria Municipal de Saúde",
    responsavel_dfd_id: M2A_RESPONSAVEIS.FRANCISCO.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.FRANCISCO.nome,
    unidades: [
      { id: 12905, nome: "Secretaria Municipal de Saúde" },
      { id: 12906, nome: "Fundo Municipal de Saúde" },
      { id: 12907, nome: "Hospital Municipal de Itarema - Natércia Rios" },
    ],
  },

  // PROTEÇÃO SOCIAL -> Leide
  "10029": {
    nome: "Secretaria Municipal de Proteção Social e Cidadania",
    responsavel_dfd_id: M2A_RESPONSAVEIS.LEIDE.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.LEIDE.nome,
    unidades: [
      { id: 12908, nome: "Secretaria Municipal de Proteção Social e Cidadania" },
      { id: 12909, nome: "Fundo Municipal de Assistência Social" },
      { id: 12910, nome: "Fundo Municipal dos Direitos da Criança e do Adolescente" },
      { id: 12911, nome: "Fundo de Desenvolvimento Municipal de Itarema" },
      { id: 14716, nome: "Fundo Municipal de Habitação de Interesse Social" },
      { id: 14717, nome: "Fundo Municipal do Idoso" },
    ],
  },

  // EDUCAÇÃO -> Lorena
  "10027": {
    nome: "Secretaria Municipal de Educação",
    responsavel_dfd_id: M2A_RESPONSAVEIS.LORENA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.LORENA.nome,
    unidades: [
      { id: 12902, nome: "Secretaria Municipal de Educação" },
      { id: 12903, nome: "Fundo Municipal de Educação" },
      { id: 12904, nome: "FUNDEB" },
    ],
  },

  // INFRAESTRUTURA -> Hawlyson
  "10024": {
    nome: "Secretaria Municipal de Infraestrutura, Mobilidade e Serviços Públicos",
    responsavel_dfd_id: M2A_RESPONSAVEIS.HAWLYSON.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.HAWLYSON.nome,
    unidades: [
      { id: 12898, nome: "Secretaria Municipal de Infraestrutura, Mobilidade e Serviços Públicos" },
    ],
  },

  // ----- demais órgãos: Ana Soraya -----
  "10006": {
    nome: "Controladoria Geral do Município",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [{ id: 12877, nome: "Controladoria Geral do Município" }],
  },
  "10022": {
    nome: "Gabinete do Prefeito",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [
      { id: 14712, nome: "Gabinete do Prefeito" },
      { id: 14713, nome: "Procuradoria Geral do Município" },
      { id: 14714, nome: "Coordenadoria de Relação e Promoção dos Direitos Indígenas" },
    ],
  },
  "10023": {
    nome: "Secretaria Municipal de Administração, Finanças e Planejamento",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [
      { id: 12897, nome: "Secretaria Municipal de Administração, Finanças e Planejamento" },
      { id: 14715, nome: "Fundo Municipal de Segurança Pública - FUMSEP" },
    ],
  },
  "10025": {
    nome: "Secretaria Municipal de Desenvolvimento Rural e Pesca",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [
      { id: 12899, nome: "Secretaria Municipal de Desenvolvimento Rural e Pesca" },
      { id: 12900, nome: "Serviço Autônomo de Água e Esgoto Rural de Itarema - SAAER" },
    ],
  },
  "10026": {
    nome: "Secretaria Municipal de Esporte, Juventude e Lazer",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [{ id: 12901, nome: "Secretaria Municipal de Esporte, Juventude e Lazer" }],
  },
  "10031": {
    nome: "Secretaria Municipal de Meio Ambiente",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [
      { id: 12913, nome: "Secretaria Municipal de Meio Ambiente" },
      { id: 12914, nome: "Fundo Municipal de Meio Ambiente" },
      { id: 12915, nome: "Fundo Municipal de Desenvolvimento do Turismo" },
    ],
  },
  "11291": {
    nome: "Secretaria Municipal de Cultura e Turismo",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [
      { id: 14718, nome: "Secretaria Municipal de Cultura e Turismo" },
      { id: 14719, nome: "Fundo Municipal de Desenvolvimento do Turismo - FUNDETUR" },
      { id: 14720, nome: "Fundo Municipal de Cultura" },
      { id: 12916, nome: "Fundo Municipal de Cultura (legado)" },
    ],
  },
  "10030": {
    nome: "Fundo de Previdência Social do Município de Itarema",
    responsavel_dfd_id: M2A_RESPONSAVEIS.ANA_SORAYA.id,
    responsavel_dfd_nome: M2A_RESPONSAVEIS.ANA_SORAYA.nome,
    unidades: [{ id: 12912, nome: "Fundo de Previdência Social do Município de Itarema" }],
  },
};

/** Lista ordenada de órgãos para selects (id como string p/ compat com M2A). */
export function listarOrgaosOrdenados() {
  return Object.entries(M2A_ORGAOS_MAPPING)
    .map(([id, o]) => ({ m2a_id: id, nome: o.nome, mapping: o }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function getOrgaoMapping(orgaoId?: string | null) {
  if (!orgaoId) return null;
  return M2A_ORGAOS_MAPPING[orgaoId] ?? null;
}

export function getUOMapping(orgaoId?: string | null, uoId?: string | null) {
  const o = getOrgaoMapping(orgaoId);
  if (!o || !uoId) return null;
  return o.unidades.find((u) => String(u.id) === String(uoId)) ?? null;
}

/** Tenta achar o órgão pai a partir de um UO id (quando vem da planilha). */
export function findOrgaoByUO(uoId?: string | null): string | null {
  if (!uoId) return null;
  for (const [orgaoId, o] of Object.entries(M2A_ORGAOS_MAPPING)) {
    if (o.unidades.some((u) => String(u.id) === String(uoId))) return orgaoId;
  }
  return null;
}
