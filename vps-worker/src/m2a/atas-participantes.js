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
import { coerceHtmlPayload } from "./utils.js";

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

/**
 * Lê a tabela de participantes de uma ata.
 * @returns {Array<{ participanteId: number, nome: string, incluido: boolean }>}
 */
export async function listarParticipantesAta(ataId) {
  const path = `/ata_registro_precos/unidades_participantes/tabela/${ataId}/?page_size=100`;
  const res = await m2a.get(path, {
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao carregar ata ${ataId}: HTTP ${res.status}`);
  }
  const $ = cheerio.load(coerceHtmlPayload(res.html));
  const rows = $("tr.kt-datatable__row.tr_ata_registro_preco_unidade_participante");
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
  const participantesPorNome = new Map(
    participantes.map((p) => [norm(p.nome), p]),
  );
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
  for (const alvo of alvos) {
    const participante = participantesPorNome.get(norm(alvo.nome));
    if (!participante) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        status: "sem_participante_na_ata",
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
  return { results };
}
