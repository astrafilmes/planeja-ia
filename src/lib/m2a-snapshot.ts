import { supabase } from "@/integrations/supabase/client";
import type { M2aSyncPayload } from "@/lib/m2a-sync";
import { parseNumeroContrato } from "@/lib/numeracao-m2a";

const LOG = "[m2a-sync]";

export interface M2aAmbiguousItem {
  contrato_item_id: string;
  contrato_id: string;
  numero_contrato: string | null;
  numero_item: string | null;
  descricao: string | null;
}

export interface M2aSyncSummary {
  atas: number;
  atas_removidas: number;
  itens: number;
  itens_atualizados: number;
  itens_removidos: number;
  contratos_snapshot: number;
  contratos_atualizados: number;
  contratos_datas_atualizadas: number;
  itens_relinkados: number;
  itens_ambiguos: M2aAmbiguousItem[];
  warnings: string[];
}

export interface PersistM2ASnapshotOptions {
  expectedM2aProcessoId?: string | null;
}

/**
 * Persiste o snapshot do portal M2A no banco local.
 *
 * Toda a sincronização é executada em uma única RPC atômica
 * (`sync_m2a_snapshot`), o que garante:
 *   - UPSERT em `m2a_atas`, `m2a_itens` e `m2a_contratos_snapshot`
 *     (sem DELETE+INSERT total: IDs internos preservados).
 *   - Cleanup somente do que realmente sumiu do portal.
 *   - Reconciliação em 3 passes para `contrato_itens`:
 *       1) match por `m2a_item_id` existente → atualiza valores.
 *       2) match por (numero_item normalizado + fornecedor) → religa legados.
 *       3) fallback por numero_item normalizado único.
 *   - Recálculo de `valor_total` quando `valor_unitario` muda.
 *   - `quantidade_alocada` em dotações NUNCA é sobrescrita.
 *   - Atualização atômica de `processos.m2a_sync_at`.
 *
 * Em caso de qualquer erro a transação inteira é revertida.
 */
export async function persistM2ASnapshot(
  processoId: string,
  payload: M2aSyncPayload,
  options: PersistM2ASnapshotOptions = {},
): Promise<M2aSyncSummary> {
  console.groupCollapsed(`${LOG} persistM2ASnapshot processo=${processoId}`);
  const tStart = performance.now();
  const actualM2aProcessoId = String(payload.processo_id ?? "").trim();
  const expectedM2aProcessoId = String(options.expectedM2aProcessoId ?? "").trim();
  console.log(`${LOG} payload:`, {
    processo_id: actualM2aProcessoId || null,
    expected_processo_id: expectedM2aProcessoId || null,
    atas: payload.atas?.length ?? 0,
    itens: payload.itens?.length ?? 0,
    contratos_existentes: payload.contratos_existentes?.length ?? 0,
  });

  try {
    if (
      actualM2aProcessoId &&
      expectedM2aProcessoId &&
      actualM2aProcessoId !== expectedM2aProcessoId
    ) {
      throw new Error(
        `O portal retornou dados do processo M2A ${actualM2aProcessoId}, mas este cadastro está configurado para o processo ${expectedM2aProcessoId}. Sincronização cancelada para evitar itens incorretos.`,
      );
    }

    // Enriquecer contratos com sigla/ano/sequencia para a função SQL
    const contratosEnriched = (payload.contratos_existentes ?? []).map((c) => {
      const parts = parseNumeroContrato(c.numero_contrato);
      return {
        ...c,
        sigla_secretaria: parts?.sigla ?? null,
        ano: parts?.ano ?? null,
        sequencia: parts?.sequencia ?? null,
      };
    });

    const rpcPayload = {
      processo_id: actualM2aProcessoId || null,
      expected_m2a_processo_id: expectedM2aProcessoId || null,
      atas: payload.atas ?? [],
      itens: payload.itens ?? [],
      contratos_existentes: contratosEnriched,
    };

    console.log(`${LOG} → RPC sync_m2a_snapshot`);
    const tRpc = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("sync_m2a_snapshot", {
      p_processo_id: processoId,
      p_payload: rpcPayload,
    });
    if (error) {
      console.error(`${LOG} ✗ RPC falhou:`, error);
      throw new Error(`Falha ao sincronizar: ${error.message}`);
    }
    console.log(
      `${LOG} ✓ RPC ok em ${(performance.now() - tRpc).toFixed(0)}ms`,
      data,
    );

    const { data: dateSyncData, error: dateSyncError } = await (supabase.rpc as any)(
      "sync_m2a_contract_dates_from_snapshot",
      { p_processo_id: processoId },
    );
    if (dateSyncError) {
      console.warn(`${LOG} ⚠ datas de vigência não atualizadas:`, dateSyncError);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    const summary: M2aSyncSummary = {
      atas: Number(result.atas_upserted ?? 0),
      atas_removidas: Number(result.atas_removed ?? 0),
      itens: Number(result.itens_inserted ?? 0),
      itens_atualizados: Number(result.itens_updated ?? 0),
      itens_removidos: Number(result.itens_removed ?? 0),
      contratos_snapshot: Number(result.contratos_snapshot ?? 0),
      contratos_atualizados: Number(result.contratos_atualizados ?? 0),
      contratos_datas_atualizadas: Number(dateSyncError ? 0 : (dateSyncData ?? 0)),
      itens_relinkados: Number(result.itens_relinkados ?? 0),
      itens_ambiguos: Array.isArray(result.itens_ambiguos)
        ? (result.itens_ambiguos as M2aAmbiguousItem[])
        : [],
      warnings: Array.isArray(result.warnings)
        ? (result.warnings as string[])
        : [],
    };

    console.log(
      `${LOG} ✅ persistM2ASnapshot concluído em ${(performance.now() - tStart).toFixed(0)}ms`,
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
