import { supabase } from "@/integrations/supabase/client";
import {
  createM2aProcessoSyncRequestId,
  listenM2aProcessoSync,
  postM2aProcessoSync,
  type M2aSyncPayload,
} from "@/lib/m2a-sync";
import { parseNumeroContrato } from "@/lib/numeracao-m2a";

export async function persistM2ASnapshot(
  processoId: string,
  payload: M2aSyncPayload,
) {
  await Promise.all([
    supabase.from("m2a_atas").delete().eq("processo_id", processoId),
    supabase.from("m2a_itens").delete().eq("processo_id", processoId),
    supabase
      .from("m2a_contratos_snapshot")
      .delete()
      .eq("processo_id", processoId),
  ]);

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

  if (atasRows.length) await supabase.from("m2a_atas").insert(atasRows);
  if (itensRows.length) await supabase.from("m2a_itens").insert(itensRows);
  if (contratosRows.length) {
    await supabase.from("m2a_contratos_snapshot").insert(contratosRows);
  }

  await supabase
    .from("processos")
    .update({ m2a_sync_at: new Date().toISOString() })
    .eq("id", processoId);
}

export function syncM2AProcessoOnce(
  m2aProcessoUrl: string,
  timeoutMs = 120_000,
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
