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
import {
  extrairNomeUgSelecionada,
  montarPayloadInclusaoUg,
  normM2AText as norm,
  parseUnidadesGestorasDetalheHtml,
  unidadeGestoraDetalheConfirmaInclusao,
} from "./atas-participantes-utils.js";

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

function inferAnoFromData(data) {
  return String(data ?? "").match(/^(20\d{2})-/)?.[1] ?? null;
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

export async function listarUnidadesGestorasParticipante(participanteId) {
  if (!participanteId) throw new Error("participanteId obrigatório");
  // Endpoint AJAX real que devolve a tabela de UGs do participante.
  // A URL "/unidades_participantes/{id}/" é só o wrapper HTML que carrega
  // essa tabela via JS — se lermos o wrapper direto vem 0 linhas e o
  // sistema conclui erradamente que a UG não foi incluída.
  const path = `/ata_registro_precos/unidades_participantes/unidades_gestoras/tabela/${participanteId}/?page_size=1000&_=${Date.now()}`;
  const res = await m2a.get(path, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${m2a.http.defaults.baseURL || ""}/ata_registro_precos/unidades_participantes/${participanteId}/`,
    },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao carregar UGs do participante ${participanteId}: HTTP ${res.status}`);
  }
  const rows = parseUnidadesGestorasDetalheHtml(res.html);
  console.log(
    `[m2a-participantes] UGs participante ${participanteId}: ${rows.length} linhas — ${rows
      .map((r) => `"${r.unidadeGestoraNome}" [${r.situacao}${r.padrao ? " · padrão" : ""}]`)
      .join(" | ") || "(vazio)"}`,
  );
  return rows;
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
  const formRes = await m2a.get(path, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html,application/xhtml+xml,application/json,*/*",
    },
  });
  if (formRes.status !== 200) {
    throw new Error(`Falha ao carregar formulário do participante ${participanteId}: HTTP ${formRes.status}`);
  }
  const $form = cheerio.load(coerceHtmlPayload(formRes.html));
  const csrf =
    $form('input[name="csrfmiddlewaretoken"]').attr("value") ||
    m2a.rememberCsrf?.(formRes.html, path) ||
    "";
  const unidadeGestoraNome = extrairNomeUgSelecionada($form, unidadeGestoraId);
  const body = montarPayloadInclusaoUg($form, { csrf, data, unidadeGestoraId });
  const payloadLog = Object.fromEntries(
    Array.from(body.entries()).map(([k, v]) => [
      k,
      k === "csrfmiddlewaretoken" ? `(len=${String(v).length})` : v,
    ]),
  );
  console.log(
    `[m2a-participantes] POST ${path} payload=${JSON.stringify(payloadLog)} ug="${unidadeGestoraNome ?? "?"}" (id=${unidadeGestoraId})`,
  );
  const res = await m2a.postForm(path, body, {
    headers: { Referer: `${m2a.http.defaults.baseURL || ""}${path}` },
  });
  console.log(
    `[m2a-participantes] POST ${path} → status=${res.status} finalUrl=${res.finalUrl || "-"} bytes=${(res.html || "").length}`,
  );
  if (res.status >= 400) {
    throw new Error(`Falha ao incluir participante ${participanteId}: HTTP ${res.status}`);
  }
  const $ = cheerio.load(coerceHtmlPayload(res.html));
  try {
    ensureOperationAccepted($, `a inclusão do participante ${participanteId}`);
  } catch (err) {
    const msg = String(err?.message ?? "");
    const minDate = msg.match(/data inicial da unidade orçamentária padrão\.\s*\((\d{2})\/(\d{2})\/(\d{4})\)/i);
    if (minDate) {
      const retryData = `${minDate[3]}-${minDate[2]}-${minDate[1]}`;
      if (retryData !== data) {
        const retryBody = new URLSearchParams(body);
        retryBody.set("data", retryData);
        const retry = await m2a.postForm(path, retryBody, {
          headers: { Referer: `${m2a.http.defaults.baseURL || ""}${path}` },
        });
        if (retry.status >= 400) {
          throw new Error(`Falha ao incluir participante ${participanteId}: HTTP ${retry.status}`);
        }
        ensureOperationAccepted(
          cheerio.load(coerceHtmlPayload(retry.html)),
          `a inclusão do participante ${participanteId}`,
        );
        return {
          ok: true,
          dataUsada: retryData,
          unidadeGestoraNome,
          detalheRows: parseUnidadesGestorasDetalheHtml(retry.html),
        };
      }
    }
    throw err;
  }
  return {
    ok: true,
    unidadeGestoraNome,
    detalheRows: parseUnidadesGestorasDetalheHtml(res.html),
  };
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
    let detalheAntes = [];
    try {
      detalheAntes = await listarUnidadesGestorasParticipante(participante.participanteId);
    } catch (err) {
      console.warn(
        `[m2a-participantes] falha ao carregar detalhe do participante ${participante.participanteId}: ${err.message}`,
      );
    }
    const ano = inferAnoFromData(data);
    const jaTemUgAtiva = unidadeGestoraDetalheConfirmaInclusao(detalheAntes, {
      nomeSecretaria: alvo.nome,
      ano,
    });
    console.log(
      `[m2a-participantes] ata=${ataId} sec="${alvo.nome}" participante=${participante.participanteId} incluido_flag=${participante.incluido} ug_ativa_encontrada=${jaTemUgAtiva.incluida} motivo=${jaTemUgAtiva.motivo} row="${jaTemUgAtiva.row?.unidadeGestoraNome ?? "-"}"`,
    );


    if (participante.incluido || jaTemUgAtiva.incluida) {
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        status: "ja_incluida",
        mensagem: jaTemUgAtiva.incluida
          ? `UG ativa encontrada no detalhe: ${jaTemUgAtiva.row?.unidadeGestoraNome}`
          : undefined,
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
      const inclusao = await incluirUnidadeGestora({
        participanteId: participante.participanteId,
        unidadeGestoraId: ug,
        data,
      });
      const detalheDepois = inclusao.detalheRows?.length
        ? inclusao.detalheRows
        : await listarUnidadesGestorasParticipante(participante.participanteId);
      const confirmado = unidadeGestoraDetalheConfirmaInclusao(detalheDepois, {
        unidadeGestoraNome: inclusao.unidadeGestoraNome,
        nomeSecretaria: alvo.nome,
        ano,
      });
      if (!confirmado.incluida) {
        results.push({
          secretariaId: alvo.secretariaId,
          nome: alvo.nome,
          participanteId: participante.participanteId,
          unidadeGestoraId: ug,
          status: "erro",
          mensagem:
            "o portal aceitou o POST, mas a UG não apareceu ativa no detalhe do participante; abra a inclusão da UG e confira a mensagem exibida pelo M2A",
        });
        continue;
      }
      results.push({
        secretariaId: alvo.secretariaId,
        nome: alvo.nome,
        participanteId: participante.participanteId,
        unidadeGestoraId: ug,
        status: "incluida_agora",
        mensagem: `UG ativa confirmada no detalhe: ${confirmado.row?.unidadeGestoraNome}`,
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
