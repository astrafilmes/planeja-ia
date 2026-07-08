// Gerência de unidades participantes (secretarias) em atas de registro de preços.
// Porta a lógica que o usuário rodava manualmente no console do portal M2A
// (resolveUG2026 + POST em unidades_gestoras/incluir/:participanteId/).
//
// Endpoints internos do M2A (Django):
//   GET  /ata_registro_precos/{ataId}/
//        → HTML com <tr class="tr_ata_registro_preco_unidade_participante">
//   POST /ata_registro_precos/unidades_participantes/unidades_gestoras/incluir/{participanteId}/
//        body: csrfmiddlewaretoken, data (YYYY-MM-DD), unidade_gestora, _salvar
//
// A UG "equivalente" do exercício corrente deve vir do caller (mapa
// secretaria → unidade_gestora). Se não vier, aplicamos fallback fuzzy
// por nome normalizado sobre a lista de UGs disponíveis no exercício.

import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";
import { coerceHtmlPayload, ensureOperationAccepted } from "./utils.js";

const norm = (txt) => {
  if (!txt) return "";
  return String(txt)
    .replace(/\(\s*\d{4}\s*\)/g, "")
    .replace(/^\d+\s*-\s*/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
};

const GENERIC_TOKENS = new Set([
  "SECRETARIA",
  "MUNICIPAL",
  "PREFEITURA",
  "FUNDO",
  "GABINETE",
  "CONTROLADORIA",
  "PROCURADORIA",
  "AUTARQUIA",
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
]);

function tokensNome(txt) {
  return norm(txt)
    .split(" ")
    .filter((w) => w.length >= 4 && !GENERIC_TOKENS.has(w));
}

function tokenEquivalente(a, b) {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function scoreNomeParticipante(alvoNome, participanteNome) {
  const alvo = tokensNome(alvoNome);
  const cand = tokensNome(participanteNome);
  if (alvo.length < 2 || cand.length < 2) return 0;
  const overlap = alvo.filter((w) => cand.some((c) => tokenEquivalente(w, c))).length;
  if (!overlap) return 0;
  return overlap / Math.max(Math.min(alvo.length, cand.length), 1);
}

function resolverParticipante(participantes, nomeAlvo) {
  const exactKey = norm(nomeAlvo);
  const exact = participantes.find((p) => norm(p.nome) === exactKey);
  if (exact) return exact;

  const scored = participantes
    .map((p) => ({ participante: p, score: scoreNomeParticipante(nomeAlvo, p.nome) }))
    .filter((entry) => entry.score >= 0.8)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const [best, second] = scored;
  if (second && best.score - second.score < 0.15) return null;
  return best.participante;
}

/**
 * Lê a tabela de participantes de uma ata.
 * @returns {Array<{ participanteId: number, nome: string, incluido: boolean }>}
 */
export async function listarParticipantesAta(ataId) {
  const path = `/ata_registro_precos/unidades_participantes/tabela/${ataId}/?page_size=100&_=${Date.now()}`;
  const res = await m2a.get(path, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${m2a.http.defaults.baseURL || ""}/ata_registro_precos/${ataId}/`,
    },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao carregar ata ${ataId}: HTTP ${res.status}`);
  }
  const $ = cheerio.load(coerceHtmlPayload(res.html));
  const rows = $("tr.tr_ata_registro_preco_unidade_participante, tr.kt-datatable__row.tr_ata_registro_preco_unidade_participante");
  const out = [];
  rows.each((_, el) => {
    const $tr = $(el);
    const idAttr = $tr.attr("id") || "";
    const idFromRow = idAttr.match(/tr_(\d+)/);
    const href =
      $tr.find('a[href^="/ata_registro_precos/unidades_participantes/"]').attr("href") || "";
    const m = href.match(/\/unidades_participantes\/(\d+)\//);
    const participanteId = m ? Number(m[1]) : idFromRow ? Number(idFromRow[1]) : null;
    const nome = $tr.find("td").eq(1).text().trim();
    // Coluna "Incluído no fornecimento? Sim/Não"
    const statusText = $tr.find("td").eq(3).text().replace(/\s+/g, " ").trim();
    const incluido = /\bSim\b/i.test(statusText);
    if (participanteId && nome) out.push({ participanteId, nome, incluido });
  });
  return out;
}

/**
 * Inclui uma unidade gestora (secretaria) como participante ativa de uma ata.
 * @param {object} args
 * @param {number|string} args.participanteId  ID vindo de listarParticipantesAta
 * @param {number|string} args.unidadeGestoraId  ID da UG do exercício corrente
 * @param {string} args.data  YYYY-MM-DD
 */
export async function incluirUnidadeGestora({ participanteId, unidadeGestoraId, data }) {
  if (!participanteId) throw new Error("participanteId obrigatório");
  if (!unidadeGestoraId) throw new Error("unidadeGestoraId obrigatório");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) {
    throw new Error("data deve estar em YYYY-MM-DD");
  }
  const path = `/ata_registro_precos/unidades_participantes/unidades_gestoras/incluir/${participanteId}/`;
  const csrf = await m2a.getCsrf(path);
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("data", data);
  body.set("unidade_gestora", String(unidadeGestoraId));
  body.set("_salvar", "");
  const res = await m2a.postForm(path, body, {
    headers: { Referer: `${m2a.http.defaults.baseURL || ""}${path}` },
  });
  // Django costuma responder 200 (form redirect interceptado pelo axios com maxRedirects=5).
  if (res.status >= 400) {
    throw new Error(`Falha ao incluir participante ${participanteId}: HTTP ${res.status}`);
  }
  const $ = cheerio.load(coerceHtmlPayload(res.html));
  ensureOperationAccepted($, `a inclusão do participante ${participanteId}`);
  return { ok: true };
}

/**
 * Orquestra: garante que cada secretaria pedida está incluída na ata.
 *
 * @param {object} args
 * @param {number|string} args.ataId
 * @param {string} args.data  YYYY-MM-DD (data de inclusão)
 * @param {Array<{secretariaId:string, nome:string, unidadeGestoraId?:string|number}>} args.alvos
 *   Cada alvo traz o nome da secretaria e, se conhecido, o ID da UG do
 *   exercício. Quando o ID não vier, aplicamos fuzzy match por nome.
 * @param {Array<{id:string|number, nome:string}>} [args.ugsDisponiveis]
 *   Lista de UGs do exercício corrente para fallback fuzzy.
 */
export async function garantirParticipantes({ ataId, data, alvos, ugsDisponiveis = [] }) {
  const participantes = await listarParticipantesAta(ataId);
  const ugsPorNome = new Map(
    (ugsDisponiveis || []).map((u) => [norm(u.nome), u.id]),
  );

  const resolveUG = (nomeSecretaria) => {
    const key = norm(nomeSecretaria);
    if (!key) return null;
    if (ugsPorNome.has(key)) return ugsPorNome.get(key);
    // Fuzzy: pega UG com maior nº de palavras (>=4 chars) em comum.
    const parts = key.split(" ").filter((w) => w.length >= 4);
    let bestId = null;
    let bestScore = 0;
    for (const [k, id] of ugsPorNome.entries()) {
      let score = 0;
      for (const w of parts) if (k.includes(w)) score++;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    return bestScore >= 2 ? bestId : null;
  };

  const results = [];
  let teveInclusao = false;
  for (const alvo of alvos) {
    const participante = resolverParticipante(participantes, alvo.nome);
    if (!participante) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        status: "sem_participante_na_ata",
        mensagem: "participante não encontrado com segurança na tabela da ata",
      });
      continue;
    }
    if (participante.incluido) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        status: "ja_incluida",
      });
      continue;
    }
    const ug = alvo.unidadeGestoraId ?? resolveUG(alvo.nome);
    if (!ug) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        status: "sem_equivalencia",
      });
      continue;
    }
    try {
      await incluirUnidadeGestora({
        participanteId: participante.participanteId,
        unidadeGestoraId: ug,
        data,
      });
      teveInclusao = true;
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        unidadeGestoraId: ug,
        status: "incluida_agora",
      });
    } catch (err) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        unidadeGestoraId: ug,
        status: "erro",
        mensagem: err.message,
      });
    }
    // Rate-limit leve para não estressar o portal.
    await new Promise((r) => setTimeout(r, 250));
  }

  if (teveInclusao) {
    const atualizados = await listarParticipantesAta(ataId);
    for (const result of results) {
      if (result.status !== "incluida_agora") continue;
      const participante = resolverParticipante(atualizados, result.nome);
      if (!participante?.incluido) {
        result.status = "erro";
        result.mensagem =
          "o portal respondeu 200, mas a secretaria continuou como não incluída; confira se a Unidade Gestora externa cadastrada é a UG correta";
      }
    }
  }
  return { results };
}
