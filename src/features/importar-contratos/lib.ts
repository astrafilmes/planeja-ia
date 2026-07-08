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
  data_abertura: string | null;
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
  const exact = secretarias.find(
    (s) =>
      s.sigla?.toUpperCase() === sigla &&
      s.m2a_dotacao_default === contrato.dotacao,
  );
  if (exact) return exact;

  const candidates = secretarias.filter((s) => s.sigla?.toUpperCase() === sigla);
  if (contrato.dotacao && candidates.some((s) => s.m2a_dotacao_default)) {
    console.warn("[m2a-import] secretaria não resolvida com segurança", {
      sigla,
      dotacaoContrato: contrato.dotacao,
      dotacoesCandidatas: candidates.map((s) => s.m2a_dotacao_default).filter(Boolean),
    });
    return null;
  }

  return candidates[0] ?? null;
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

export interface ResolveM2AItemDebug {
  numeroCandidates: string[];
  numberMatchesCount: number;
  descMatchesCount: number;
  poolSize: number;
  supplierFilterApplied: boolean;
  topScored: Array<{
    m2aItemId: string;
    ataId: string;
    ataFornecedor?: string | null;
    numero_item: string | null;
    descricaoPortal: string;
    score: number;
    reasons: string[];
  }>;
}

export function resolveM2AItemMatch(
  item: {
    empresa?: string | null;
    numeroItem?: string;
    ordemItem?: number | null;
    descricao?: string;
    valorUnitario?: number;
    lote?: string | null;
  },
  syncedItems: SyncedAtaItem[],
  onDebug?: (debug: ResolveM2AItemDebug) => void,
) {
  // Estratégia: coletar candidatos por MÚLTIPLOS sinais (número, descrição,
  // fornecedor) e ranquear. A planilha frequentemente tem "Nº" degenerado
  // (todos "1") — nesses casos a descrição é o sinal mais confiável.

  const numeroCandidates = Array.from(
    new Set(
      [compactNumber(item.numeroItem), compactNumber(item.ordemItem)].filter(
        Boolean,
      ),
    ),
  );

  const numberMatches = numeroCandidates.length
    ? syncedItems.filter((candidate) =>
        numeroCandidates.includes(compactNumber(candidate.numero_item)),
      )
    : [];

  const descNorm = normalizeText(item.descricao ?? "");
  // Prefixo mais longo (80) reduz falsos empates entre itens que compartilham
  // um cabeçalho institucional comum, tipo "SERVIÇOS DE LOCAÇÃO DE GRUPO GERADOR DE ".
  const descPrefix = descNorm.slice(0, 80);
  const descShort = descNorm.slice(0, 40);
  const descMatches =
    descShort.length >= 12
      ? syncedItems.filter((candidate) => {
          const cand = normalizeText(candidate.descricao);
          if (!cand) return false;
          return (
            cand.startsWith(descShort) ||
            descNorm.startsWith(cand.slice(0, 40)) ||
            cand.includes(descShort)
          );
        })
      : [];

  // Pool combinado: união de número + descrição.
  const poolMap = new Map<string, SyncedAtaItem>();
  for (const c of numberMatches) poolMap.set(c.id_item, c);
  for (const c of descMatches) poolMap.set(c.id_item, c);
  let pool = [...poolMap.values()];

  // Se o fornecedor da planilha bate com alguma ata do pool, priorizamos.
  let supplierFilterApplied = false;
  if (pool.length > 1) {
    const supplierPool = pool.filter((candidate) =>
      supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome),
    );
    if (supplierPool.length > 0) {
      pool = supplierPool;
      supplierFilterApplied = true;
    }
  }

  if (pool.length === 0) {
    onDebug?.({
      numeroCandidates,
      numberMatchesCount: numberMatches.length,
      descMatchesCount: descMatches.length,
      poolSize: 0,
      supplierFilterApplied: false,
      topScored: [],
    });
    return null;
  }

  // Helper: comprimento do prefixo em comum entre duas strings normalizadas.
  const commonPrefixLen = (a: string, b: string) => {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i;
  };

  const scored = pool
    .map((candidate) => {
      const reasons: string[] = [];
      let score = 0;
      const candidateNumero = compactNumber(candidate.numero_item);
      if (numeroCandidates.includes(candidateNumero)) {
        score += 25;
        reasons.push("numero");
        if (candidateNumero === compactNumber(item.ordemItem)) {
          score += 15;
          reasons.push("ordem-exata");
        }
      }
      const candDesc = normalizeText(candidate.descricao);
      if (descShort.length >= 12 && candDesc) {
        // Igualdade completa é o sinal mais forte de descrição.
        if (candDesc === descNorm) {
          score += 80;
          reasons.push("desc-exact");
        } else if (
          candDesc.startsWith(descPrefix) ||
          descNorm.startsWith(candDesc.slice(0, 80))
        ) {
          score += 55;
          reasons.push("desc-prefix80");
        } else if (candDesc.startsWith(descShort)) {
          score += 40;
          reasons.push("desc-prefix40");
        } else if (
          candDesc.includes(descShort) ||
          descNorm.includes(candDesc.slice(0, 40))
        ) {
          score += 25;
          reasons.push("desc-contain");
        }
        // Bônus fino: comprimento do prefixo comum (0..30 pts) desempata
        // itens que compartilham só o cabeçalho institucional.
        const cp = commonPrefixLen(candDesc, descNorm);
        if (cp > 0) {
          const bonus = Math.min(30, Math.floor(cp / 6));
          if (bonus > 0) {
            score += bonus;
            reasons.push(`prefix-cp${cp}`);
          }
        }
      }
      if (supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome)) {
        score += 35;
        reasons.push("fornecedor");
      }
      if (
        item.valorUnitario &&
        Math.abs(
          Number(candidate.valor_unitario ?? 0) - Number(item.valorUnitario),
        ) < 0.01
      ) {
        score += 20;
        reasons.push("valor");
      }
      return { candidate, score, reasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Desempate final: candidato com valor unitário mais próximo do item.
      const vi = Number(item.valorUnitario ?? 0);
      const da = Math.abs(Number(a.candidate.valor_unitario ?? 0) - vi);
      const db = Math.abs(Number(b.candidate.valor_unitario ?? 0) - vi);
      return da - db;
    });

  const best = scored[0];

  onDebug?.({
    numeroCandidates,
    numberMatchesCount: numberMatches.length,
    descMatchesCount: descMatches.length,
    poolSize: pool.length,
    supplierFilterApplied,
    topScored: scored.slice(0, 3).map((s) => ({
      m2aItemId: s.candidate.id_item,
      ataId: s.candidate.id_ata,
      ataFornecedor: s.candidate.ata?.fornecedor?.nome,
      numero_item: s.candidate.numero_item ?? null,
      descricaoPortal: (s.candidate.descricao ?? "").slice(0, 60),
      score: s.score,
      reasons: s.reasons,
    })),
  });

  if (!best || best.score < 25) return null;
  // Só marca "ambígua" se houver empate REAL de score E valor unitário também
  // não separar os candidatos. Com prefixo comum ponderado + valor, o empate
  // real fica raro.
  const tied = scored.filter((entry) => entry.score === best.score);
  let ambiguous = false;
  if (tied.length > 1 && best.score < 90) {
    const vi = Number(item.valorUnitario ?? 0);
    if (vi > 0) {
      const diffs = tied.map((t) =>
        Math.abs(Number(t.candidate.valor_unitario ?? 0) - vi),
      );
      const minDiff = Math.min(...diffs);
      const winners = diffs.filter((d) => d === minDiff).length;
      ambiguous = winners > 1;
    } else {
      ambiguous = true;
    }
  }
  return {
    item: best.candidate,
    score: best.score,
    status: ambiguous ? ("ambigua" as const) : ("auto" as const),
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
