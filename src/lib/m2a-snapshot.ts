import { supabase } from "@/integrations/supabase/client";
import type { M2aSyncPayload } from "@/lib/m2a-sync";
import { parseNumeroContrato } from "@/lib/numeracao-m2a";

const LOG = "[m2a-sync]";

export interface M2aSyncSummary {
  atas: number;
  itens: number;
  contratos_snapshot: number;
  contratos_atualizados: number;
  itens_atualizados: number;
  duplicatas_removidas: number;
}

async function insertInChunks<T>(
  table: "m2a_atas" | "m2a_itens" | "m2a_contratos_snapshot",
  rows: T[],
  chunkSize = 200,
) {
  const total = Math.ceil(rows.length / chunkSize);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const loteNum = i / chunkSize + 1;
    const t0 = performance.now();
    console.log(
      `${LOG} → INSERT ${table} lote ${loteNum}/${total} (${chunk.length} linhas)`,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table) as any).insert(chunk);
    const dt = (performance.now() - t0).toFixed(0);
    if (error) {
      console.error(
        `${LOG} ✗ INSERT ${table} lote ${loteNum} falhou em ${dt}ms:`,
        error,
      );
      throw new Error(
        `Falha ao gravar ${table} (lote ${loteNum}): ${error.message}`,
      );
    }
    console.log(`${LOG} ✓ INSERT ${table} lote ${loteNum} ok em ${dt}ms`);
  }
}

function normNumero(s: string | null | undefined) {
  return String(s ?? "").trim().toLowerCase();
}

export async function persistM2ASnapshot(
  processoId: string,
  payload: M2aSyncPayload,
): Promise<M2aSyncSummary> {
  console.groupCollapsed(`${LOG} persistM2ASnapshot processo=${processoId}`);
  console.log(`${LOG} payload:`, {
    atas: payload.atas?.length ?? 0,
    itens: payload.itens?.length ?? 0,
    contratos_existentes: payload.contratos_existentes?.length ?? 0,
  });
  const tAll = performance.now();

  const summary: M2aSyncSummary = {
    atas: 0,
    itens: 0,
    contratos_snapshot: 0,
    contratos_atualizados: 0,
    itens_atualizados: 0,
    duplicatas_removidas: 0,
  };

  try {
    console.log(`${LOG} → DELETE m2a_atas/m2a_itens/m2a_contratos_snapshot`);
    const tDel = performance.now();
    const deletes = await Promise.all([
      supabase.from("m2a_atas").delete().eq("processo_id", processoId),
      supabase.from("m2a_itens").delete().eq("processo_id", processoId),
      supabase
        .from("m2a_contratos_snapshot")
        .delete()
        .eq("processo_id", processoId),
    ]);
    for (const d of deletes) {
      if (d.error) {
        console.error(`${LOG} ✗ DELETE falhou:`, d.error);
        throw new Error(`Falha ao limpar snapshot: ${d.error.message}`);
      }
    }
    console.log(
      `${LOG} ✓ DELETE ok em ${(performance.now() - tDel).toFixed(0)}ms`,
    );

    const atasRows = payload.atas.map((ata) => ({
      processo_id: processoId,
      m2a_ata_id: ata.id_ata,
      numero_ata: ata.numero_ata,
      fornecedor_nome: ata.fornecedor?.nome ?? null,
      fornecedor_cnpj: ata.fornecedor?.cnpj ?? null,
    }));

    // Mapa ata -> dados para reconciliação
    const ataInfoById = new Map<
      string,
      { numero_ata: string; fornecedor_nome: string | null }
    >();
    for (const ata of payload.atas) {
      ataInfoById.set(ata.id_ata, {
        numero_ata: ata.numero_ata,
        fornecedor_nome: ata.fornecedor?.nome ?? null,
      });
    }

    // Dedupe itens por id_item e (processo, numero_item)
    const seenItemId = new Set<string>();
    const seenNumeroItem = new Set<string>();
    const itensRows: Array<{
      processo_id: string;
      m2a_ata_id: string;
      m2a_item_id: string;
      numero_item: string;
      descricao: string;
      unidade: string;
      valor_unitario: number;
    }> = [];
    let duplicadosNoPayload = 0;
    for (const item of payload.itens) {
      const idKey = String(item.id_item);
      const numKey = normNumero(item.numero_item);
      if (seenItemId.has(idKey)) {
        duplicadosNoPayload++;
        continue;
      }
      if (numKey && seenNumeroItem.has(numKey)) {
        duplicadosNoPayload++;
        continue;
      }
      seenItemId.add(idKey);
      if (numKey) seenNumeroItem.add(numKey);
      itensRows.push({
        processo_id: processoId,
        m2a_ata_id: item.id_ata,
        m2a_item_id: item.id_item,
        numero_item: item.numero_item,
        descricao: item.descricao,
        unidade: item.unidade,
        valor_unitario: item.valor_unitario,
      });
    }

    const contratosRows = payload.contratos_existentes.map((contrato) => {
      const parts = parseNumeroContrato(contrato.numero_contrato);
      return {
        processo_id: processoId,
        m2a_contrato_id: contrato.id_contrato_m2a,
        numero_contrato: contrato.numero_contrato,
        m2a_ata_id: contrato.id_ata,
        sigla_secretaria: parts?.sigla ?? null,
        ano: parts?.ano ?? null,
        sequencia: parts?.sequencia ?? null,
        raw: JSON.parse(JSON.stringify(contrato)) as never,
      };
    });

    console.log(`${LOG} mapeado:`, {
      atasRows: atasRows.length,
      itensRows: itensRows.length,
      duplicadosNoPayload,
      contratosRows: contratosRows.length,
    });

    if (atasRows.length) await insertInChunks("m2a_atas", atasRows);
    if (itensRows.length) await insertInChunks("m2a_itens", itensRows);
    if (contratosRows.length)
      await insertInChunks("m2a_contratos_snapshot", contratosRows);

    summary.atas = atasRows.length;
    summary.itens = itensRows.length;
    summary.contratos_snapshot = contratosRows.length;

    // ── RECONCILIAÇÃO de contratos locais (campos vindos do portal vencem) ──
    console.log(`${LOG} → reconciliando contratos locais`);
    const tRec = performance.now();
    const { data: contratosLocais, error: cErr } = await supabase
      .from("contratos")
      .select("id, m2a_contrato_id, numero_contrato, m2a_ata_id, m2a_ata_numero, fornecedor_nome")
      .eq("processo_id", processoId)
      .is("deleted_at", null);
    if (cErr) {
      console.warn(`${LOG} ⚠ não foi possível ler contratos locais:`, cErr);
    } else {
      const byM2aId = new Map<string, (typeof contratosLocais)[number]>();
      const byNumero = new Map<string, (typeof contratosLocais)[number]>();
      for (const c of contratosLocais ?? []) {
        if (c.m2a_contrato_id) byM2aId.set(String(c.m2a_contrato_id), c);
        if (c.numero_contrato) byNumero.set(normNumero(c.numero_contrato), c);
      }
      for (const cont of payload.contratos_existentes) {
        const local =
          byM2aId.get(String(cont.id_contrato_m2a)) ||
          byNumero.get(normNumero(cont.numero_contrato));
        if (!local) continue;
        const ataInfo = ataInfoById.get(cont.id_ata);
        const patch: Record<string, unknown> = {};
        if (ataInfo?.numero_ata && ataInfo.numero_ata !== local.m2a_ata_numero) {
          patch.m2a_ata_numero = ataInfo.numero_ata;
        }
        if (
          ataInfo?.fornecedor_nome &&
          ataInfo.fornecedor_nome !== local.fornecedor_nome
        ) {
          patch.fornecedor_nome = ataInfo.fornecedor_nome;
        }
        if (cont.id_ata && cont.id_ata !== local.m2a_ata_id) {
          patch.m2a_ata_id = cont.id_ata;
        }
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from("contratos")
            .update(patch as any)
            .eq("id", local.id);
          if (upErr) {
            console.warn(`${LOG} ⚠ falha ao atualizar contrato ${local.id}:`, upErr);
          } else {
            summary.contratos_atualizados++;
          }
        }
      }
    }

    // ── RECONCILIAÇÃO de contrato_itens via m2a_item_id ──
    if (itensRows.length > 0) {
      const itemValueById = new Map<string, { vu: number; desc: string; un: string }>();
      for (const it of itensRows) {
        itemValueById.set(it.m2a_item_id, {
          vu: Number(it.valor_unitario) || 0,
          desc: it.descricao,
          un: it.unidade,
        });
      }
      const m2aIds = Array.from(itemValueById.keys());
      // só itens dos contratos do processo
      const { data: ciRows, error: ciErr } = await supabase
        .from("contrato_itens")
        .select("id, m2a_item_id, quantidade, valor_unitario, valor_total, descricao, unidade, contrato_id, contratos!inner(processo_id, deleted_at)")
        .in("m2a_item_id", m2aIds)
        .eq("contratos.processo_id", processoId)
        .is("contratos.deleted_at", null);
      if (ciErr) {
        console.warn(`${LOG} ⚠ não foi possível ler contrato_itens:`, ciErr);
      } else {
        for (const ci of (ciRows ?? []) as any[]) {
          const portal = itemValueById.get(String(ci.m2a_item_id));
          if (!portal) continue;
          const qtd = Number(ci.quantidade ?? 0) || 0;
          const novoVT = +(qtd * portal.vu).toFixed(4);
          const patch: Record<string, unknown> = {};
          if (Number(ci.valor_unitario ?? 0) !== portal.vu) {
            patch.valor_unitario = portal.vu;
            patch.valor_total = novoVT;
          }
          if (!ci.descricao && portal.desc) patch.descricao = portal.desc;
          if (!ci.unidade && portal.un) patch.unidade = portal.un;
          if (Object.keys(patch).length > 0) {
            const { error: ueErr } = await supabase
              .from("contrato_itens")
              .update(patch as any)
              .eq("id", ci.id);
            if (!ueErr) summary.itens_atualizados++;
          }
        }
      }
    }
    console.log(
      `${LOG} ✓ reconciliação ok em ${(performance.now() - tRec).toFixed(0)}ms`,
      { contratos: summary.contratos_atualizados, itens: summary.itens_atualizados },
    );

    // ── Dedupe pós-insert (defensivo) ──
    try {
      const { data: removed, error: dErr } = await supabase.rpc(
        "dedupe_m2a_itens" as any,
        { p_processo_id: processoId },
      );
      if (!dErr) summary.duplicatas_removidas = Number(removed ?? 0);
    } catch (e) {
      console.warn(`${LOG} ⚠ dedupe RPC falhou:`, e);
    }

    console.log(`${LOG} → UPDATE processos.m2a_sync_at`);
    const tUpd = performance.now();
    const { error: updErr } = await supabase
      .from("processos")
      .update({ m2a_sync_at: new Date().toISOString() })
      .eq("id", processoId);
    if (updErr) {
      console.error(`${LOG} ✗ UPDATE processos falhou:`, updErr);
      throw new Error(`Falha ao atualizar processo: ${updErr.message}`);
    }
    console.log(
      `${LOG} ✓ UPDATE processos ok em ${(performance.now() - tUpd).toFixed(0)}ms`,
    );
    console.log(
      `${LOG} ✅ persistM2ASnapshot concluído em ${(performance.now() - tAll).toFixed(0)}ms`,
      summary,
    );
    return summary;
  } catch (e) {
    console.error(`${LOG} ❌ persistM2ASnapshot falhou:`, e);
    throw e;
  } finally {
    console.groupEnd();
  }
}
