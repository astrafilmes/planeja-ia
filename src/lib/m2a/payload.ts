export type M2AContractItemSource = {
  numero?: string | null;
  numero_item?: string | null;
  ordem_item?: number | string | null;
  quantidade?: number | string | null;
  descricao?: string | null;
  m2a_item_id?: string | null;
};

export type M2AContractPayloadInput = {
  contratoId: string;
  m2aProcessoUrl?: string | null;
  m2aAtaId?: string | null;
  contrato: Record<string, unknown> & {
    numero_contrato?: string | null;
    numero?: string | null;
    objeto?: string | null;
    data?: string | null;
    preposto?: string | null;
    m2a_contrato_id?: string | null;
  };
  itens: M2AContractItemSource[];
  unidadeGestoraId?: string | null;
  fiscalId?: string | null;
  gestorId?: string | null;
  /** Nome da secretaria (usado no worker para revalidar saldo). */
  secretariaNome?: string | null;
  dotacao?: {
    orgao?: string | null;
    unidade_orcamentaria?: string | null;
    despesa_projeto_atividade?: string | null;
  } | null;
};

const M2A_NUMERIC_ID = /^\d+$/;

export function isNumericM2AId(value: unknown): value is string {
  return M2A_NUMERIC_ID.test(String(value ?? ""));
}

export function formatM2AQuantity(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "0,00";
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  const raw = String(value).trim();
  if (raw.includes(",")) return raw;
  const numeric = Number(raw);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    : raw;
}

export function getDataFimContrato(dataContrato: string) {
  return new Date(
    new Date(`${dataContrato}T00:00:00`).setFullYear(
      new Date(`${dataContrato}T00:00:00`).getFullYear() + 1,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

export function normalizeItensForM2A(itens: M2AContractItemSource[]) {
  return itens
    .map((item, index) => ({
      numero:
        String(item.numero ?? item.numero_item ?? "").trim() ||
        (item.ordem_item ? String(item.ordem_item) : String(index + 1)),
      descricao: item.descricao ?? undefined,
      m2a_item_id: item.m2a_item_id ?? undefined,
      quantidade: formatM2AQuantity(item.quantidade),
    }))
    .filter((item) => item.numero)
    .sort((a, b) => {
      const numA = Number(a.numero) || 0;
      const numB = Number(b.numero) || 0;
      return numA - numB;
    });
}

export function buildM2AContractPayload(input: M2AContractPayloadInput) {
  const dataContrato = String(input.contrato.data ?? "");
  if (!dataContrato) {
    throw new Error("Informe a data do contrato antes do envio.");
  }

  const itens = normalizeItensForM2A(input.itens);
  if (!itens.length) {
    throw new Error("Contrato sem itens para envio.");
  }

  return {
    contratoId: input.contratoId,
    m2aProcessoUrl: input.m2aProcessoUrl,
    m2aAtaId: input.m2aAtaId,
    contrato: {
      ...input.contrato,
      data: dataContrato,
      data_fim: getDataFimContrato(dataContrato),
    },
    itens,
    dadosDotacao: input.dotacao,
    dadosM2A: {
      unidade_gestora: input.unidadeGestoraId,
      fiscal_id: input.fiscalId,
      gestor_id: input.gestorId,
      preposto_id: null,
      preposto_nome: input.contrato.preposto,
      dotacao: input.dotacao,
      itens,
    },
  };
}
