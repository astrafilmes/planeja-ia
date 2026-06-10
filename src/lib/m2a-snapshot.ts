import { supabase } from "@/integrations/supabase/client";
import {
  createM2aProcessoSyncRequestId,
  listenM2aProcessoSync,
  postM2aProcessoSync,
  type M2aSyncPayload,
} from "@/lib/m2a-sync";
import { parseNumeroContrato } from "@/lib/numeracao-m2a";

const LOG = "[m2a-sync]";

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

export async function persistM2ASnapshot(
  processoId: string,
  payload: M2aSyncPayload,
) {
  console.groupCollapsed(`${LOG} persistM2ASnapshot processo=${processoId}`);
  console.log(`${LOG} payload:`, {
    atas: payload.atas?.length ?? 0,
    itens: payload.itens?.length ?? 0,
    contratos_existentes: payload.contratos_existentes?.length ?? 0,
  });
  const tAll = performance.now();

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
    console.log(`${LOG} ✓ DELETE ok em ${(performance.now() - tDel).toFixed(0)}ms`);

    const atasRows = payload.atas.map((ata) => ({
      processo_id: processoId,
      m2a_ata_id: ata.id_ata,
      numero_ata: ata.numero_ata,
      fornecedor_nome: ata.fornecedor?.nome ?? null,
      fornecedor_cnpj: ata.fornecedor?.cnpj ?? null,
    }));

    const itensRows = payload.itens.map((item) => ({
      processo_id: processoId,
      m2a_ata_id: item.id_ata,
      m2a_item_id: item.id_item,
      numero_item: item.numero_item,
      descricao: item.descricao,
      unidade: item.unidade,
      valor_unitario: item.valor_unitario,
    }));

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
      contratosRows: contratosRows.length,
    });

    if (atasRows.length) await insertInChunks("m2a_atas", atasRows);
    if (itensRows.length) await insertInChunks("m2a_itens", itensRows);
    if (contratosRows.length)
      await insertInChunks("m2a_contratos_snapshot", contratosRows);

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
    );
  } catch (e) {
    console.error(`${LOG} ❌ persistM2ASnapshot falhou:`, e);
    throw e;
  } finally {
    console.groupEnd();
  }
}

export function syncM2AProcessoOnce(
  m2aProcessoUrl: string,
  timeoutMs = 600_000, // 10 min: importações em lote podem demorar
): Promise<M2aSyncPayload> {
  return new Promise((resolve, reject) => {
    const requestId = createM2aProcessoSyncRequestId();
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      off();
      clearTimeout(timeout);
      callback();
    };

    const off = listenM2aProcessoSync(requestId, (event) => {
      if (event.type !== "M2A_SYNC_PROCESSO_COMPLETE") return;
      finish(() => {
        if (event.erro || !event.payload) {
          reject(new Error(event.erro ?? "A extensão retornou payload vazio."));
          return;
        }
        resolve(event.payload);
      });
    });

    const timeout = setTimeout(() => {
      finish(() =>
        reject(new Error("Tempo esgotado aguardando a varredura do portal.")),
      );
    }, timeoutMs);

    postM2aProcessoSync(requestId, m2aProcessoUrl);
  });
}
