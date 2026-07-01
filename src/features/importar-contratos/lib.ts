import type {
  ContratoPreliminar,
  parseContratoXlsx,
} from "@/lib/contratoImport";
import type { M2aSyncPayload } from "@/lib/m2a";
import { normalizeText } from "@/lib/utils/normalize";

/* ============================================================
 * Tipos compartilhados
 * ============================================================ */

export type JobRow = {
  id: string;
  original_filename: string;
  empresa: string | null;
  status: string;
  total_itens: number;
  total_contratos_previstos: number;
  total_valor: number;
  created_at: string;
  m2a_url?: string | null;
  processo_id?: string | null;
};

export type SecretariaM2A = {
  id: string;
  numero: number;
  sigla: string;
  nome: string;
  m2a_ref_coluna: number | null;
  m2a_dotacao_default: string | null;
  m2a_orgao_id: string | null;
  m2a_dot_orgao_id: string | null;
  m2a_uo_id: string | null;
  m2a_dot_id: string | null;
  m2a_fiscal_codigo: string | null;
  m2a_fiscal_nome: string | null;
  m2a_fiscal_cpf: string | null;
  m2a_gestor_codigo: string | null;
  m2a_gestor_nome: string | null;
  m2a_gestor_cpf: string | null;
};

export type FornecedorPreposto = {
  id: string;
  fornecedor_nome: string;
  fornecedor_nome_norm: string;
  fornecedor_cnpj: string | null;
  preposto_nome: string;
  ativo: boolean;
};

export type FornecedorPrepostoTarget = {
  key: string;
  fornecedorNome: string;
  contratos: number;
};

export type SyncedAtaItem = M2aSyncPayload["itens"][number] & {
  ata?: M2aSyncPayload["atas"][number];
};

export type ProcessoMin = {
  id: string;
  numero_processo: string | null;
  objeto: string | null;
  m2a_url: string | null;
  m2a_processo_id: string | null;
  m2a_sync_at: string | null;
};

export type M2AAtaRow = {
  m2a_ata_id: string;
  numero_ata: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
};

export type M2AItemRow = {
  m2a_ata_id: string;
  m2a_item_id: string;
  numero_item: string | null;
  descricao: string | null;
  unidade: string | null;
  valor_unitario: number | null;
};

/* ============================================================
 * Constantes
 * ============================================================ */

export const UNKNOWN_SUPPLIER_KEY = "__SEM_FORNECEDOR__";
export const UNKNOWN_SUPPLIER_LABEL = "FORNECEDOR NÃO INFORMADO";

/* ============================================================
 * Utilitários puros
 * ============================================================ */

export function normalizeFornecedorKey(value: string | null | undefined) {
  const normalized = normalizeText(value ?? "")
    .replace(/\s+/g, "")
    .trim();
  return normalized || UNKNOWN_SUPPLIER_KEY;
}

function normalizeCnpj(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function resolveFornecedorNome(
  contrato: Pick<
    ContratoPreliminar,
    "fornecedorNome" | "empresa" | "m2aAtaId"
  >,
) {
  // Quando há ata vinculada, o nome vindo da ata é a fonte de verdade.
  if (contrato.m2aAtaId && contrato.fornecedorNome?.trim()) {
    return contrato.fornecedorNome.trim();
  }
  const fornecedor = String(
    (contrato.fornecedorNome && String(contrato.fornecedorNome).trim()) ||
      (contrato.empresa && String(contrato.empresa).trim()) ||
      "",
  ).trim();
  return fornecedor || UNKNOWN_SUPPLIER_LABEL;
}

export function resolveFornecedorKey(
  contrato: Pick<
    ContratoPreliminar,
    "fornecedorNome" | "empresa" | "m2aAtaId" | "fornecedorCnpj"
  >,
) {
  // 1) Ata M2A é a identidade mais forte (mesma ata = mesmo fornecedor).
  if (contrato.m2aAtaId) return `ATA::${contrato.m2aAtaId}`;
  // 2) CNPJ oficial (caso ata sem id mas com CNPJ conhecido).
  const cnpj = normalizeCnpj(contrato.fornecedorCnpj);
  if (cnpj) return `CNPJ::${cnpj}`;
  // 3) Último recurso: texto normalizado da planilha.
  return normalizeFornecedorKey(resolveFornecedorNome(contrato));
}

export function resolveSecretariaForContrato(
  contrato: Pick<ContratoPreliminar, "secretariaSigla" | "dotacao">,
  secretarias: SecretariaM2A[],
) {
  const sigla = contrato.secretariaSigla?.toUpperCase();
  return (
    secretarias.find(
      (s) =>
        s.sigla?.toUpperCase() === sigla &&
        s.m2a_dotacao_default === contrato.dotacao,
    ) ?? secretarias.find((s) => s.sigla?.toUpperCase() === sigla)
  );
}

export function hasM2AActors(sec?: SecretariaM2A | null) {
  return [
    sec?.m2a_orgao_id,
    sec?.m2a_dot_orgao_id,
    sec?.m2a_uo_id,
    sec?.m2a_dot_id,
    sec?.m2a_fiscal_codigo,
    sec?.m2a_gestor_codigo,
  ].every(Boolean);
}

export function compactNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.match(/\d+/)?.[0] ?? "";
  return digits.replace(/^0+/, "") || digits;
}

export function supplierMatches(
  itemEmpresa: string | null | undefined,
  ataNome = "",
) {
  const empresa = normalizeText(itemEmpresa);
  const fornecedor = normalizeText(ataNome);
  if (!empresa || !fornecedor) return false;
  return empresa.includes(fornecedor) || fornecedor.includes(empresa);
}

export function resolveM2AItemMatch(
  item: {
    empresa?: string | null;
    numeroItem?: string;
    ordemItem?: number | null;
    descricao?: string;
    valorUnitario?: number;
  },
  syncedItems: SyncedAtaItem[],
) {
  const targetNumero =
    compactNumber(item.numeroItem) || compactNumber(item.ordemItem);
  if (!targetNumero) return null;

  const numberMatches = syncedItems.filter(
    (candidate) => compactNumber(candidate.numero_item) === targetNumero,
  );
  if (numberMatches.length === 0) return null;

  const supplierMatchesList = numberMatches.filter((candidate) =>
    supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome),
  );
  const pool =
    supplierMatchesList.length > 0 ? supplierMatchesList : numberMatches;

  const scored = pool
    .map((candidate) => {
      let score = 50;
      if (supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome))
        score += 40;
      if (
        item.descricao &&
        normalizeText(candidate.descricao).includes(
          normalizeText(item.descricao).slice(0, 24),
        )
      ) {
        score += 10;
      }
      if (
        item.valorUnitario &&
        Math.abs(
          Number(candidate.valor_unitario ?? 0) - Number(item.valorUnitario),
        ) < 0.01
      ) {
        score += 5;
      }
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  const tied = scored.filter((entry) => entry.score === best.score);
  return {
    item: best.candidate,
    score: best.score,
    status:
      tied.length > 1 && best.score < 90 ? ("ambigua" as const) : ("auto" as const),
  };
}

export function countPreviewContractsWithAta(
  parsedItems: ReturnType<typeof parseContratoXlsx>["itens"],
  assignments: Map<number, string | null>,
) {
  const keys = new Set<string>();
  for (const item of parsedItems) {
    for (const dotacao of item.dotacoes) {
      keys.add(
        [
          item.empresa,
          dotacao.secretariaSigla,
          dotacao.dotacao,
          assignments.get(item.sourceRow) ?? "sem-ata",
        ].join("|"),
      );
    }
  }
  return keys.size;
}
