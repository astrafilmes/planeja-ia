// Consumo por (secretaria, item) — soma das quantidades contratadas em
// contratos existentes de uma ata.
//
// Estratégia:
//   1. Listar todos os contratos vinculados à ata:
//        GET /contratos/tabela/?ata_registro_preco={ataId}&page_size=1000
//      (fallback tenta ?ata= e ?ata_id=). A resposta traz linhas
//      <tr class="tr_contrato" id="tr_{contratoId}"> com o nome da secretaria
//      (unidade gestora) em uma das colunas.
//
//   2. Para cada contrato, listar seus itens:
//        GET /contratos/itens/tabela/{contratoId}/?page_size=1000
//      Cada linha traz:
//        - descrição no formato "68 - TOLDO 3M..." → numero do item
//        - <input class="mask_quantidade" value="10,0"> → quantidade contratada
//        - <div class="m2a-badge">/ 20,00</div>  → cota total da secretaria (informativo)
//
//   3. Ignora contratos cancelados/rescindidos.
//
//   4. Agrega por (secretariaNome normalizado, numero do item) → soma.

import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

function toNumberBR(txt) {
  if (txt == null) return null;
  const raw = String(txt).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseNumeroFromSpan(txt) {
  const m = String(txt ?? "").trim().match(/^(\d+)\s*-/);
  return m ? m[1] : null;
}

function normSec(txt) {
  return String(txt ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function tentarListarContratos(ataId) {
  const candidates = [
    `/contratos/tabela/?ata_registro_preco=${ataId}&page_size=1000`,
    `/contratos/tabela/?ata=${ataId}&page_size=1000`,
    `/contratos/tabela/?ata_id=${ataId}&page_size=1000`,
  ];
  let lastErr = null;
  for (const path of candidates) {
    try {
      const res = await m2a.get(path, {
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
      });
      if (res.status !== 200) continue;
      let html = res.html || "";
      try {
        const parsed = JSON.parse(html);
        if (parsed && typeof parsed === "object" && typeof parsed.html === "string") {
          html = parsed.html;
        }
      } catch { /* html direto */ }
      const $ = cheerio.load(html);
      const rows = $("tr.tr_contrato, tr.kt-datatable__row.tr_contrato");
      if (rows.length > 0 || /nenhum registro encontrado/i.test(html)) {
        return { $, rows, path };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return { $: null, rows: null, path: null };
}

/**
 * Lista os contratos de uma ata (id, número, secretaria, status).
 */
export async function listarContratosDaAta(ataId) {
  const { $, rows, path } = await tentarListarContratos(ataId);
  if (!$ || !rows) return { path: null, contratos: [] };
  const out = [];
  rows.each((_, el) => {
    const $tr = $(el);
    const idAttr = $tr.attr("id") || "";
    const mId = idAttr.match(/tr_(\d+)/);
    const contratoId = mId ? Number(mId[1]) : null;
    const rowText = $tr.text().replace(/\s+/g, " ").trim();
    // Detecta status via badge (cancelado/rescindido/etc).
    const badgeTxt = $tr.find(".kt-badge, .badge").text().toLowerCase();
    const cancelado = /cancel|rescind|anulad/i.test(badgeTxt);
    // Secretaria costuma ser a coluna com texto mais longo em caixa alta.
    let secretariaNome = "";
    $tr.find("td").each((_, td) => {
      const t = $(td).text().replace(/\s+/g, " ").trim();
      if (
        t.length > secretariaNome.length &&
        /[A-ZÀ-Ú]{4}/.test(t) &&
        !/^\d/.test(t) &&
        !/^R\$/.test(t)
      ) {
        secretariaNome = t;
      }
    });
    // Número do contrato: coluna começando com dígitos "026/2025..." ou similar.
    let numero = "";
    $tr.find("td").each((_, td) => {
      const t = $(td).text().replace(/\s+/g, " ").trim();
      if (!numero && /^\d{1,6}\/\d{4}/.test(t)) numero = t;
    });
    if (contratoId) {
      out.push({ contratoId, numero, secretariaNome, cancelado, rowText });
    }
  });
  return { path, contratos: out };
}

/**
 * Lista os itens de UM contrato: quantidade contratada por item.
 * @returns {Promise<Array<{ contratoItemId:number, numero:string|null, descricao:string, quantidadeContratada:number|null, cotaSecretaria:number|null }>>}
 */
export async function listarItensContrato(contratoId) {
  const path = `/contratos/itens/tabela/${contratoId}/?page_size=1000`;
  const res = await m2a.get(path, {
    headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
  });
  if (res.status !== 200) {
    throw new Error(`Falha ao carregar itens do contrato ${contratoId}: HTTP ${res.status}`);
  }
  let html = res.html || "";
  try {
    const parsed = JSON.parse(html);
    if (parsed && typeof parsed === "object" && typeof parsed.html === "string") {
      html = parsed.html;
    }
  } catch { /* html direto */ }
  const $ = cheerio.load(html);
  const rows = $("tr.tr_contrato_item, tr.kt-datatable__row.tr_contrato_item");
  const out = [];
  rows.each((_, el) => {
    const $tr = $(el);
    const idAttr = $tr.attr("id") || "";
    const mId = idAttr.match(/tr_(\d+)/);
    const contratoItemId = mId ? Number(mId[1]) : null;
    const descSpan = $tr.find("td").eq(1).find("span").first().text();
    const numero = parseNumeroFromSpan(descSpan);
    const descricao = descSpan.replace(/\s+/g, " ").trim();
    // input com quantidade contratada
    const inputVal = $tr.find("input.mask_quantidade").attr("value") || "";
    const quantidadeContratada = toNumberBR(inputVal);
    // badge "/ 20,00" = cota total daquela secretaria pra esse item
    const badgeTxt = $tr.find(".m2a-badge, .badge-success").first().text();
    const badgeMatch = String(badgeTxt).match(/([\d.,]+)/);
    const cotaSecretaria = badgeMatch ? toNumberBR(badgeMatch[1]) : null;
    out.push({
      contratoItemId,
      numero,
      descricao,
      quantidadeContratada,
      cotaSecretaria,
    });
  });
  return out;
}

/**
 * Consumo agregado por (secretariaKey, numeroItem):
 *   { [normSec(secretariaNome)]: { [numeroItem]: quantidadeTotalConsumida } }
 * Também retorna a lista bruta para debug.
 */
export async function consumoDaAta(ataId) {
  const { contratos, path } = await listarContratosDaAta(ataId);
  const detalhado = [];
  const agregado = {};
  for (const c of contratos) {
    if (c.cancelado) continue;
    if (!c.contratoId) continue;
    let itens = [];
    try {
      itens = await listarItensContrato(c.contratoId);
    } catch (err) {
      console.warn(`[m2a-consumo] contrato ${c.contratoId}: ${err.message}`);
      continue;
    }
    const secKey = normSec(c.secretariaNome);
    for (const it of itens) {
      if (!it.numero) continue;
      const q = it.quantidadeContratada ?? 0;
      if (q <= 0) continue;
      agregado[secKey] = agregado[secKey] || {};
      agregado[secKey][it.numero] = (agregado[secKey][it.numero] ?? 0) + q;
      detalhado.push({
        contratoId: c.contratoId,
        numeroContrato: c.numero,
        secretariaNome: c.secretariaNome,
        secretariaKey: secKey,
        numeroItem: it.numero,
        descricaoItem: it.descricao,
        quantidade: q,
        cotaSecretaria: it.cotaSecretaria,
      });
    }
  }
  return { ataId, listaContratos: contratos, detalhado, agregado, sourcePath: path };
}
