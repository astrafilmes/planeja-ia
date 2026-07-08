// Cálculo de saldo real por (ata, secretaria, item):
//
//   saldo = cota_participante(secretaria, item) - Σ quantidade_contratada
//
// Junta cotaParticipantesAta + consumoDaAta e devolve um mapa navegável
// pelo front. Aplica cache curto em memória (TTL 60s) por ataId para
// suportar múltiplas revalidações rápidas sem re-parsear.

import { cotaParticipantesAta } from "./atas-participantes-itens.js";
import { consumoDaAta } from "./atas-consumo.js";

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // ataId → { at:number, data:object }

function normSec(txt) {
  return String(txt ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function invalidateSaldoAtaCache(ataId) {
  if (ataId == null) cache.clear();
  else cache.delete(String(ataId));
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
export async function saldosPorSecretaria(ataId, { forceRefresh = false } = {}) {
  const key = String(ataId);
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
    consumoDaAta(ataId).catch((err) => {
      avisos.push(`Falha ao carregar consumo: ${err.message}`);
      return { ataId, agregado: {}, detalhado: [], listaContratos: [] };
    }),
  ]);

  const secretarias = cota.participantes.map((p) => {
    const secretariaKey = normSec(p.secretariaNome);
    const consumoSec = consumo.agregado?.[secretariaKey] ?? {};
    const itens = p.itens.map((it) => {
      const consumido = it.numero ? consumoSec[it.numero] ?? 0 : 0;
      const cotaVal = it.quantidadeAlocada ?? null;
      const saldo = cotaVal != null ? Math.max(cotaVal - consumido, 0) : null;
      return {
        numero: it.numero,
        descricao: it.descricao,
        unidade: it.unidade,
        cota: cotaVal,
        consumido,
        saldo,
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
    secretarias,
    avisos,
    consumoDebug: {
      contratosConsiderados: consumo.listaContratos?.length ?? 0,
      linhas: consumo.detalhado?.length ?? 0,
    },
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
