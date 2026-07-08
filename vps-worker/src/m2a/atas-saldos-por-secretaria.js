// Cálculo de saldo real por (ata, secretaria, item):
//
//   saldo = cota_participante(secretaria, item) - Σ quantidade_contratada
//
// Junta cotaParticipantesAta + consumoDaAta e devolve um mapa navegável
// pelo front. Aplica cache curto em memória (TTL 60s) por ataId para
// suportar múltiplas revalidações rápidas sem re-parsear.

import { cotaParticipantesAta } from "./atas-participantes-itens.js";
import { consumoDaAta } from "./atas-consumo.js";
import { normSec } from "./norm-sec.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // ataId → { at:number, data:object }

export function invalidateSaldoAtaCache(ataId, processoId = null) {
  if (ataId == null) {
    cache.clear();
    return;
  }
  const ataKey = String(ataId);
  const processoKey = String(processoId ?? "").trim();
  if (processoKey) {
    cache.delete(`${ataKey}::${processoKey}`);
    return;
  }
  for (const key of cache.keys()) {
    if (key === ataKey || key.startsWith(`${ataKey}::`)) cache.delete(key);
  }
}

/**
 * Retorna:
 * {
 *   ataId,
 *   secretarias: [
 *     {
 *       participanteId, secretariaNome, secretariaKey, exercicio, incluido,
 *       itens: [
 *         { numero, descricao, unidade, cota, consumido, saldo }
 *       ]
 *     }
 *   ],
 *   avisos: [string]
 * }
 */
export async function saldosPorSecretaria(ataId, { forceRefresh = false, processoId = null } = {}) {
  const processoKey = String(processoId ?? "").trim();
  const key = `${ataId}::${processoKey || "todos"}`;
  if (!forceRefresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  }

  const avisos = [];
  const [cota, consumo] = await Promise.all([
    cotaParticipantesAta(ataId).catch((err) => {
      avisos.push(`Falha ao carregar cota: ${err.message}`);
      return { ataId, participantes: [] };
    }),
    consumoDaAta(ataId, { processoId: processoKey || null }).catch((err) => {
      avisos.push(`Falha ao carregar consumo: ${err.message}`);
      return { ataId, agregado: {}, detalhado: [], listaContratos: [], avisos: [] };
    }),
  ]);

  const contratosPorSecretariaItem = {};
  for (const row of consumo.detalhado ?? []) {
    const sec = row.secretariaKey || normSec(row.secretariaNome);
    const item = String(row.numeroItem ?? "");
    if (!sec || !item) continue;
    contratosPorSecretariaItem[sec] = contratosPorSecretariaItem[sec] || {};
    contratosPorSecretariaItem[sec][item] = contratosPorSecretariaItem[sec][item] || [];
    if (
      contratosPorSecretariaItem[sec][item].some(
        (c) => String(c.contratoId) === String(row.contratoId),
      )
    ) {
      continue;
    }
    contratosPorSecretariaItem[sec][item].push({
      contratoId: row.contratoId,
      numeroContrato: row.numeroContrato,
      processoId: row.processoId,
      processoNumero: row.processoNumero,
      quantidade: row.quantidade,
    });
  }

  const secretarias = cota.participantes.map((p) => {
    const secretariaKey = normSec(p.secretariaNome);
    const consumoSec = consumo.agregado?.[secretariaKey] ?? {};
    const itens = p.itens.map((it) => {
      const consumido = it.numero ? consumoSec[it.numero] ?? 0 : 0;
      const cotaVal = it.quantidadeAlocada ?? null;
      const saldo = cotaVal != null ? Math.max(cotaVal - consumido, 0) : null;
      const contratosConsumidores = it.numero
        ? contratosPorSecretariaItem?.[secretariaKey]?.[String(it.numero)] ?? []
        : [];
      return {
        numero: it.numero,
        descricao: it.descricao,
        unidade: it.unidade,
        cota: cotaVal,
        consumido,
        saldo,
        contratosConsumidores,
      };
    });
    return {
      participanteId: p.participanteId,
      secretariaNome: p.secretariaNome,
      secretariaKey,
      exercicio: p.exercicio,
      incluido: p.incluido,
      itens,
    };
  });

  const data = {
    ataId,
    processoId: processoKey || null,
    secretarias,
    avisos: [...avisos, ...(consumo.avisos ?? [])],
    consumoDebug: {
      contratosConsiderados: consumo.listaContratos?.length ?? 0,
      linhas: consumo.detalhado?.length ?? 0,
      contratosPorSecretariaItem,
    },
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
