// Front-end helpers para sincronizar catálogos SRP via VPS worker
// (UOs e agentes de planejamento). Persistência é feita aqui no Supabase.

import { supabase } from "@/integrations/supabase/client";

const PROXY_URL = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/m2a-proxy`;

async function callWorker<T = any>(
  path: string,
  method: "GET" | "POST" = "GET",
  query?: Record<string, string | number>,
): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error("Sessão expirada — refaça o login.");
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ path: `${path}${qs}`, method }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `m2a-proxy ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export interface SyncUOResult {
  orgaos: number;
  unidades: number;
  unidades_sem_orgao: number;
}

export async function sincronizarUnidadesOrcamentarias(): Promise<SyncUOResult> {
  const data = await callWorker<{
    ok: boolean;
    orgaos: Array<{ m2a_id: string; nome: string }>;
    unidades: Array<{ m2a_id: string; nome: string; orgao_m2a_id: string | null }>;
  }>("/catalogos/srp/unidades-orcamentarias", "GET");

  // Upsert órgãos (m2a_unidades_gestoras já existe; aqui apenas garantimos linhas)
  if (data.orgaos?.length) {
    const orgaoRows = data.orgaos.map((o) => ({
      m2a_id: o.m2a_id,
      nome: o.nome,
      sigla: extractSigla(o.nome),
      ativa: true,
    }));
    const { error } = await supabase
      .from("m2a_unidades_gestoras")
      .upsert(orgaoRows, { onConflict: "m2a_id" });
    if (error) throw error;
  }

  let semOrgao = 0;
  if (data.unidades?.length) {
    const rows = data.unidades.map((u) => {
      if (!u.orgao_m2a_id) semOrgao++;
      return {
        m2a_id: u.m2a_id,
        nome: u.nome,
        orgao_m2a_id: u.orgao_m2a_id ?? "",
        ativa: true,
      };
    });
    const { error } = await supabase
      .from("m2a_unidades_orcamentarias")
      .upsert(rows, { onConflict: "m2a_id" });
    if (error) throw error;
  }

  return {
    orgaos: data.orgaos?.length ?? 0,
    unidades: data.unidades?.length ?? 0,
    unidades_sem_orgao: semOrgao,
  };
}

function extractSigla(nome: string): string | null {
  const m = nome.match(/^\s*\[([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

export async function sincronizarAgentesPlanejamentoUO(
  unidadePk: string,
  dataReferencia: string, // YYYY-MM-DD
): Promise<number> {
  const data = await callWorker<{
    ok: boolean;
    agentes: Array<{ m2a_id: string; nome: string }>;
  }>("/catalogos/srp/agentes-planejamento", "GET", {
    unidade_pk: unidadePk,
    data_referencia: dataReferencia,
  });
  if (!data.agentes?.length) {
    // Limpa os existentes para esta UO (não tem mais nenhum válido)
    await supabase
      .from("m2a_agentes_planejamento")
      .update({ ativo: false })
      .eq("unidade_m2a_id", unidadePk);
    return 0;
  }
  const rows = data.agentes.map((a) => ({
    unidade_m2a_id: unidadePk,
    servidor_m2a_id: a.m2a_id,
    nome: a.nome,
    data_referencia: dataReferencia,
    ativo: true,
  }));
  const { error } = await supabase
    .from("m2a_agentes_planejamento")
    .upsert(rows, { onConflict: "unidade_m2a_id,servidor_m2a_id" });
  if (error) throw error;
  return rows.length;
}
