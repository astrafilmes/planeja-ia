// Cota (quantidade alocada) por secretaria participante em cada item de uma ata.
//
// Endpoints M2A usados:
//   GET /ata_registro_precos/unidades_participantes/tabela/{ataId}/?page_size=100
//     → lista de participantes (id + secretaria + exercício + "incluído?")
//   GET /ata_registro_precos/unidades_participantes/itens/tabela/{participanteId}/?page_size=1000
//     → itens do participante com QUANTIDADE ALOCADA (não é saldo, é cota total).
//
// Sobre o m2aItemId: o row id da tabela de itens do participante ("tr_83115")
// é o ID do participante_item, NÃO o ata_item_id. Como a M2A não expõe o
// ata_item_id nessa tela, casamos por `numero` do item (coluna visível
// "40 - BUFFET..." → numero=40) — o front conhece o número de cada item.

import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";
import { coerceHtmlPayload } from "./utils.js";

function toNumberBR(txt) {
  if (txt == null) return null;
  const raw = String(txt).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseNumeroFromSpan(txt) {
  // "40 - BUFFET TIPO 1 - ..." → "40"
  const m = String(txt ?? "").trim().match(/^(\d+)\s*-/);
  return m ? m[1] : null;
}

/**
 * Lista os participantes de uma ata via endpoint tabelar (JSON com HTML embutido).
 * @returns {Promise<Array<{ participanteId:number, sequencia:string|null, secretariaNome:string, exercicio:number|null, incluido:boolean }>>}
 */
export async function listarParticipantesTabela(ataId) {
  const path = `/ata_registro_precos/unidades_participantes/tabela/${ataId}/?page_size=100`;
  const res = await m2a.get(path, {
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao listar participantes da ata ${ataId}: HTTP ${res.status}`);
  }
  // A resposta pode vir como JSON { html_table: "<table>..." }, { html: ... }
  // ou HTML direto — o helper encontra o primeiro bloco HTML em qualquer chave.
  const html = coerceHtmlPayload(res.html);
  const $ = cheerio.load(html);
  const rows = $("tr.tr_ata_registro_preco_unidade_participante, tr.kt-datatable__row.tr_ata_registro_preco_unidade_participante");
  const out = [];
  rows.each((_, el) => {
    const $tr = $(el);
    const idAttr = $tr.attr("id") || "";
    const mId = idAttr.match(/tr_(\d+)/);
    const participanteId = mId ? Number(mId[1]) : null;
    const tds = $tr.find("td");
    const sequencia = tds.eq(0).text().replace(/\s+/g, " ").trim() || null;
    const secretariaNome = tds.eq(1).text().replace(/\s+/g, " ").trim();
    const exercicioRaw = tds.eq(2).text().replace(/\s+/g, " ").trim();
    const exercicio = /^\d{4}$/.test(exercicioRaw) ? Number(exercicioRaw) : null;
    const incluidoBadge = tds.eq(3).text().replace(/\s+/g, " ").trim().toLowerCase();
    const incluido = incluidoBadge.includes("sim");
    if (participanteId) {
      out.push({ participanteId, sequencia, secretariaNome, exercicio, incluido });
    }
  });
  return out;
}

/**
 * Lista os itens (cota) de UM participante.
 * @returns {Promise<Array<{ numero:string|null, descricao:string, unidade:string|null, quantidadeAlocada:number|null }>>}
 */
export async function listarItensParticipante(participanteId) {
  const path = `/ata_registro_precos/unidades_participantes/itens/tabela/${participanteId}/?page_size=1000`;
  const res = await m2a.get(path, {
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao listar itens do participante ${participanteId}: HTTP ${res.status}`);
  }
  const html = coerceHtmlPayload(res.html);
  const $ = cheerio.load(html);
  const rows = $("tr.tr_ata_registro_preco_unidade_participante_item, tr.kt-datatable__row.tr_ata_registro_preco_unidade_participante_item");
  const out = [];
  rows.each((_, el) => {
    const $tr = $(el);
    const tds = $tr.find("td");
    const descSpan = tds.eq(0).find("span").first().text();
    const numero = parseNumeroFromSpan(descSpan);
    const descricao = descSpan.replace(/\s+/g, " ").trim();
    const unidade = tds.eq(1).text().replace(/\s+/g, " ").trim() || null;
    const qtdText = tds.eq(2).text().replace(/\s+/g, " ").trim();
    out.push({
      numero,
      descricao,
      unidade,
      quantidadeAlocada: toNumberBR(qtdText),
    });
  });
  return out;
}

/**
 * Retorna a cota completa: participantes da ata + itens de cada um.
 * @returns {Promise<{ ataId:string|number, participantes: Array<{ participanteId:number, secretariaNome:string, exercicio:number|null, incluido:boolean, itens:Array }> }>}
 */
export async function cotaParticipantesAta(ataId) {
  const participantes = await listarParticipantesTabela(ataId);
  // Serializa para não estressar o portal. Cada participante = 1 request extra.
  const out = [];
  for (const p of participantes) {
    let itens = [];
    try {
      itens = await listarItensParticipante(p.participanteId);
    } catch (err) {
      console.warn(
        `[m2a-cota] falha ao carregar itens do participante ${p.participanteId}: ${err.message}`,
      );
    }
    out.push({ ...p, itens });
  }
  return { ataId, participantes: out };
}
