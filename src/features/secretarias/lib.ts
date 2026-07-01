import { supabase } from "@/integrations/supabase/client";
import type { M2AServidor, M2AUnidadeGestora } from "@/hooks/useM2ACatalog";

export const EMPTY_SELECT_VALUE = "__none__";
export const KEEP_SELECT_VALUE = "__keep__";

export type StatusFilter = "all" | "ativa" | "inativa";

export type Sec = {
  id?: string;
  numero: number;
  sigla: string;
  nome: string;
  ativa: boolean;
  m2a_orgao_id?: string | null;
  m2a_dot_orgao_id?: string | null;
  m2a_uo_id?: string | null;
  m2a_dot_id?: string | null;
  m2a_dotacao_default?: string | null;
  m2a_ref_coluna?: number | null;
  m2a_fiscal_codigo?: string | null;
  m2a_fiscal_nome?: string | null;
  m2a_fiscal_cpf?: string | null;
  m2a_gestor_codigo?: string | null;
  m2a_gestor_nome?: string | null;
  m2a_gestor_cpf?: string | null;
};

export type EnrichedSec = Sec & {
  fiscal?: M2AServidor | null;
  gestor?: M2AServidor | null;
  unidade?: M2AUnidadeGestora | null;
};

export type SecretariaGroup = {
  key: string;
  title: string;
  subtitle: string;
  unidadeM2AId: string | null;
  rows: EnrichedSec[];
  principal: EnrichedSec;
  fiscaisCount: number;
  gestoresCount: number;
  ativosCount: number;
};

export type GroupForm = {
  unidadeM2AId: string;
  dotacaoOrgaoM2AId: string;
  fiscalM2AId: string;
  gestorM2AId: string;
};

export function emptySec(): Sec {
  return { numero: 0, sigla: "", nome: "", ativa: true };
}

export function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

export function isNumericM2AId(value: string | null | undefined) {
  return !value || /^\d+$/.test(value.trim());
}

export function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function toSecretariaPayload(sec: Sec) {
  return {
    numero: Number(sec.numero),
    sigla: sec.sigla.trim().toUpperCase(),
    nome: sec.nome.trim(),
    ativa: sec.ativa,
    m2a_orgao_id: trimOrNull(sec.m2a_orgao_id),
    m2a_dot_orgao_id: trimOrNull(sec.m2a_dot_orgao_id),
    m2a_uo_id: trimOrNull(sec.m2a_uo_id),
    m2a_dot_id: trimOrNull(sec.m2a_dot_id),
    m2a_dotacao_default: trimOrNull(sec.m2a_dotacao_default),
    m2a_ref_coluna:
      sec.m2a_ref_coluna === null || sec.m2a_ref_coluna === undefined
        ? null
        : Number(sec.m2a_ref_coluna),
    m2a_fiscal_codigo: trimOrNull(sec.m2a_fiscal_codigo),
    m2a_fiscal_nome: trimOrNull(sec.m2a_fiscal_nome),
    m2a_gestor_codigo: trimOrNull(sec.m2a_gestor_codigo),
    m2a_gestor_nome: trimOrNull(sec.m2a_gestor_nome),
  };
}

export function actorPatch(
  prefix: "m2a_fiscal" | "m2a_gestor",
  actor?: M2AServidor,
) {
  return {
    [`${prefix}_codigo`]: actor?.m2a_id ?? null,
    [`${prefix}_nome`]: actor?.nome ?? null,
  };
}

/** Persiste CPFs via RPC (não estão mais em secretarias). */
export async function syncSecretariaCpfs(
  secretariaId: string,
  cpfs: { fiscal?: string | null; gestor?: string | null },
) {
  const calls: Array<Promise<unknown>> = [];
  if (cpfs.fiscal !== undefined) {
    calls.push(
      (supabase.rpc as any)("upsert_secretaria_contato", {
        p_secretaria_id: secretariaId,
        p_papel: "fiscal",
        p_cpf: cpfs.fiscal,
      }),
    );
  }
  if (cpfs.gestor !== undefined) {
    calls.push(
      (supabase.rpc as any)("upsert_secretaria_contato", {
        p_secretaria_id: secretariaId,
        p_papel: "gestor",
        p_cpf: cpfs.gestor,
      }),
    );
  }
  await Promise.all(calls);
}

export function pickPrincipal(
  rows: EnrichedSec[],
  unidade?: M2AUnidadeGestora | null,
) {
  const normalizedUnidade = normalizeText(unidade?.nome);
  const exact = rows.find(
    (row) => normalizeText(row.nome) === normalizedUnidade,
  );
  if (exact) return exact;

  return [...rows].sort((a, b) => {
    const aPenalty = /[-(]/.test(a.nome) ? 1 : 0;
    const bPenalty = /[-(]/.test(b.nome) ? 1 : 0;
    return aPenalty - bPenalty || a.nome.length - b.nome.length;
  })[0];
}

export function groupRows(
  rows: EnrichedSec[],
  unidades: M2AUnidadeGestora[],
): SecretariaGroup[] {
  const unidadeByM2A = new Map(unidades.map((item) => [item.m2a_id, item]));
  const map = new Map<string, EnrichedSec[]>();

  for (const row of rows) {
    const key = row.m2a_orgao_id || `sem-ug-${row.numero}-${row.sigla}`;
    map.set(key, [...(map.get(key) ?? []), row]);
  }

  return [...map.entries()]
    .map(([key, group]) => {
      const unidade = group[0]?.m2a_orgao_id
        ? (unidadeByM2A.get(group[0].m2a_orgao_id) ?? null)
        : null;
      const sortedRows = [...group].sort(
        (a, b) =>
          a.numero - b.numero ||
          a.sigla.localeCompare(b.sigla, "pt-BR", { numeric: true }) ||
          a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
      );
      const principal = pickPrincipal(sortedRows, unidade);
      const fiscais = new Set(
        sortedRows.map((row) => row.m2a_fiscal_codigo).filter(Boolean),
      );
      const gestores = new Set(
        sortedRows.map((row) => row.m2a_gestor_codigo).filter(Boolean),
      );

      return {
        key,
        title: unidade?.nome ?? principal.nome,
        subtitle: unidade
          ? (unidade.nome ?? principal.nome)
          : "Unidade Gestora não vinculada",
        unidadeM2AId: unidade?.m2a_id ?? principal.m2a_orgao_id ?? null,
        rows: sortedRows,
        principal,
        fiscaisCount: fiscais.size,
        gestoresCount: gestores.size,
        ativosCount: sortedRows.filter((row) => row.ativa).length,
      };
    })
    .sort(
      (a, b) =>
        a.principal.numero - b.principal.numero ||
        a.title.localeCompare(b.title, "pt-BR", { numeric: true }),
    );
}
