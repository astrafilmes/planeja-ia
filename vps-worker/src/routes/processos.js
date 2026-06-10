import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

// =====================================================================
// Porta da lógica de m2a-extension/engine/processo_scraper.js
// para o worker Node (cheerio em vez de DOMParser, fetch via m2a client).
// Mantém os mesmos endpoints e formato de saída.
// =====================================================================

const SYNC_CONCURRENCY = 3;

// ---------- helpers de texto / parse ----------
function cleanTextValue(value) {
  return String(value ?? "")
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const txt = ($, el) => cleanTextValue($(el).text());

function parseValor(s) {
  if (!s) return 0;
  const c = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeCurrency(v) {
  return /R\$|\d+,\d{2}/.test(v || "");
}
function looksLikeUnit(v) {
  if (!v) return false;
  const c = String(v).trim();
  if (!c || c.length > 14) return false;
  if (/\s{2,}/.test(c)) return false;
  if (looksLikeCurrency(c)) return false;
  if (/^\d+$/.test(c)) return false;
  return /^[A-Za-z0-9./%-]+$/.test(c);
}
function looksLikeValidDescription(v) {
  if (!v) return false;
  const c = String(v).trim();
  if (c.length < 5) return false;
  if (!/[A-Za-záéíóúàâêôãõç]/i.test(c)) return false;
  const letterRatio = c.replace(/[^A-Za-záéíóúàâêôãõç]/gi, "").length / c.length;
  return letterRatio > 0.4;
}
function firstNonEmpty(values) {
  for (const v of values) if (v) return v;
  return "";
}
function extractDigits(v) {
  const m = String(v ?? "").match(/\d+/);
  return m ? m[0] : "";
}
function extrairNumeroSequencial(numeroStr) {
  if (!numeroStr) return 0;
  const m = numeroStr.match(/^(\d+)\//);
  return m ? parseInt(m[1], 10) : 0;
}

// ---------- decodificação de respostas AJAX (JSON com HTML escapado) ----------
function decodeEscapedHtmlString(value) {
  return String(value ?? "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\\/g, "\\");
}
function findHtmlLikeString(node) {
  if (typeof node === "string") {
    if (node.includes("<tr") || node.includes("<table") || node.includes("kt-datatable__row") || node.includes("\\n<td")) return node;
    return null;
  }
  if (Array.isArray(node)) {
    for (const it of node) { const f = findHtmlLikeString(it); if (f) return f; }
    return null;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) { const f = findHtmlLikeString(v); if (f) return f; }
  }
  return null;
}
function coerceHtmlPayload(rawText) {
  const text = String(rawText ?? "");
  try {
    const parsed = JSON.parse(text);
    const htmlStr = findHtmlLikeString(parsed);
    if (htmlStr) return decodeEscapedHtmlString(htmlStr);
  } catch {}
  if (text.includes('\\"') || text.includes("\\n<") || text.includes("\\u")) {
    const decoded = decodeEscapedHtmlString(text);
    if (/<(html|table|tbody|tr|td)\b/i.test(decoded)) return decoded;
  }
  return text;
}

async function fetchDoc(path) {
  const r = await m2a.get(path);
  if (r.status >= 400) {
    const err = new Error(`M2A respondeu ${r.status} em ${path}`);
    err.status = r.status;
    throw err;
  }
  const html = coerceHtmlPayload(r.html);
  return cheerio.load(html);
}

// ---------- atas ----------
function findAtaFornecedorCellText($, tdLeft, numeroAta) {
  if (!tdLeft || tdLeft.length === 0) return "";
  const mainDiv = tdLeft.find("div").first();
  if (mainDiv.length) {
    const mainSpan = mainDiv.find("span").first();
    const mainText = txt($, mainSpan.length ? mainSpan : mainDiv);
    if (mainText && mainText !== numeroAta && mainText.length > 2) return mainText;
  }
  const spans = tdLeft.find("span").toArray();
  for (const span of spans) {
    const $s = $(span);
    const id = $s.attr("id") || "";
    const cls = $s.attr("class") || "";
    if (/badge_licitacao_ata_contrato/i.test(id)) continue;
    if (cls.includes("kt-badge")) continue;
    const cleaned = txt($, $s);
    if (cleaned && cleaned !== numeroAta && cleaned.length > 2) return cleaned;
  }
  const divs = tdLeft.find("div").toArray();
  if (divs.length) {
    const cleaned = txt($, $(divs[0]));
    if (cleaned && cleaned !== numeroAta && cleaned.length > 2) return cleaned;
  }
  return txt($, tdLeft).split("\n")[0].trim();
}

function extractAtaDetailUrl($, tr) {
  const fromCell = tr.find("td.details-control[url_detail]").attr("url_detail") || "";
  if (fromCell) return fromCell;
  const html = $.html(tr) || "";
  return html.match(/\/licitacao_ata_contrato_item\/subtabela\/\d+\/?/i)?.[0] || "";
}

function extractLicitacaoAtaContratoId(tr, detailUrl) {
  const trId = tr.attr("id") || "";
  const fromTrId = trId.match(/tr_licitacao_ata_contrato_(\d+)/i)?.[1] || "";
  if (fromTrId) return fromTrId;
  const onMouse = tr.attr("onmouseover") || "";
  const fromMouse = onMouse.match(/['"](\d+)['"]/)?.[1] || "";
  if (fromMouse) return fromMouse;
  const fromDetail = String(detailUrl || "").match(/\/subtabela\/(\d+)\/?/i)?.[1] || "";
  return fromDetail || "";
}

function normalizeSubtableUrl(url, fallbackAtaId) {
  const baseRaw = String(url || "").trim();
  const fallback = `/licitacao_ata_contrato_item/subtabela/${fallbackAtaId}`;
  const raw = baseRaw || fallback;
  const withoutQuery = raw.split("?")[0].replace(/\/+$/, "");
  return `${withoutQuery}?page_size=1000`;
}

function extractAtasFromDoc($) {
  const out = [];
  const seen = new Set();
  $('a[href*="/ata_registro_precos/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") || "";
    const m = href.match(/\/ata_registro_precos\/(\d+)\/?/);
    if (!m) return;
    const ataId = m[1];
    if (seen.has(ataId)) return;
    seen.add(ataId);
    const numero = txt($, $a.find("span").first()) || txt($, $a);
    const tr = $a.closest("tr");
    let fornecedor = "";
    let cnpj = "";
    let detailUrl = "";
    let licitacaoAtaContratoId = "";
    if (tr.length) {
      const cellTxt = txt($, tr);
      const cnpjMatch = cellTxt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
      if (cnpjMatch) cnpj = cnpjMatch[0];
      const tdLeft = tr.find("td.text-left").first();
      fornecedor = findAtaFornecedorCellText($, tdLeft, numero);
      detailUrl = extractAtaDetailUrl($, tr);
      licitacaoAtaContratoId = extractLicitacaoAtaContratoId(tr, detailUrl);
      if (!fornecedor) {
        tr.find("td").each((__, td) => {
          if (fornecedor) return;
          const $td = $(td);
          if ($td.find(a).length) return;
          const t = txt($, $td);
          if (t && t !== numero) fornecedor = t;
        });
      }
    }
    fornecedor = cleanTextValue(fornecedor);
    if (!fornecedor || fornecedor === numero) fornecedor = "";
    out.push({
      id_ata: ataId,
      id_licitacao_ata_contrato: licitacaoAtaContratoId || undefined,
      numero_ata: numero || `ATA-${ataId}`,
      fornecedor: { nome: fornecedor || "", cnpj: cnpj || undefined },
      detail_url: detailUrl || undefined,
    });
  });
  return out;
}

// ---------- itens ----------
function extractNumeroDescricao(cellsText) {
  for (let i = 0; i < cellsText.length; i++) {
    const text = cellsText[i];
    const inlineMatch = text.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
    if (inlineMatch && looksLikeValidDescription(inlineMatch[2])) {
      return { numero: inlineMatch[1], descricao: inlineMatch[2], numeroIndex: i };
    }
  }
  for (let i = 0; i < cellsText.length; i++) {
    const text = cellsText[i];
    if (!/^\d{1,5}$/.test(text)) continue;
    const descricao = firstNonEmpty(
      cellsText.slice(i + 1).filter(
        (v) => looksLikeValidDescription(v) && !looksLikeCurrency(v) && !looksLikeUnit(v),
      ),
    );
    if (descricao) return { numero: text, descricao, numeroIndex: i };
  }
  return { numero: "", descricao: "", numeroIndex: -1 };
}

function extractItemIdFromRow($, tr, ataId, numeroItem, idx) {
  const candidates = [
    tr.attr("id"),
    tr.attr("data-id"),
    tr.attr("id_item"),
    tr.find("[id_item]").first().attr("id_item"),
    tr.find("[data-id]").first().attr("data-id"),
    tr.find("input[type='checkbox'][value]").first().attr("value"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw) continue;
    const hrefId = raw.match(/\/(?:licitacao_ata_contrato_item|ata_registro_preco_item|ata_registro_precos_item|arp_item)\/(\d+)/)?.[1] ?? "";
    if (hrefId) return hrefId;
    const rowId = raw.match(/(?:tr_|row_|item_)(\d+)/)?.[1] || extractDigits(raw);
    if (rowId) return rowId;
  }
  if (numeroItem) return `${ataId}:${numeroItem}`;
  return `${ataId}:row:${idx}`;
}

function extractItensFromDoc($, ataId) {
  const rows = $("tr.tr_ata_registro_preco_item, tr.tr_licitacao_ata_contrato_item, tr.kt-datatable__row").toArray();
  const out = [];
  const seen = new Set();
  let idx = 0;
  for (const trEl of rows) {
    const tr = $(trEl);
    const cells = tr.find("td");
    if (!cells.length) continue;
    const cellsText = cells.toArray().map((c) => txt($, $(c))).filter(Boolean);
    if (cellsText.length < 4) continue;
    const parsed = extractNumeroDescricao(cellsText);
    if (!parsed.numero || !parsed.descricao) continue;
    let unidade = "";
    let valor = 0;
    for (let i = cellsText.length - 2; i >= 0; i--) {
      const t = cellsText[i];
      if (!unidade && looksLikeUnit(t) && t !== parsed.numero) unidade = t;
    }
    for (const t of cellsText) {
      if (!valor && looksLikeCurrency(t)) valor = parseValor(t);
    }
    const itemId = extractItemIdFromRow($, tr, ataId, parsed.numero, ++idx);
    const dedupeKey = `${ataId}|${parsed.numero}|${parsed.descricao}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      id_item: itemId,
      numero_item: parsed.numero,
      descricao: parsed.descricao,
      unidade,
      valor_unitario: valor,
      id_ata: ataId,
    });
  }
  return out;
}

async function fetchItensDaAta(ata) {
  const attempts = [];
  if (ata.detail_url) {
    attempts.push({ label: "subtabela do processo", url: normalizeSubtableUrl(ata.detail_url, ata.id_ata) });
  }
  if (ata.id_licitacao_ata_contrato) {
    attempts.push({
      label: "subtabela de licitação (id_licitacao_ata_contrato)",
      url: normalizeSubtableUrl(`/licitacao_ata_contrato_item/subtabela/${ata.id_licitacao_ata_contrato}`, ata.id_ata),
    });
  }
  attempts.push({
    label: "subtabela de licitação (fallback por id_ata)",
    url: normalizeSubtableUrl(`/licitacao_ata_contrato_item/subtabela/${ata.id_ata}`, ata.id_ata),
  });
  attempts.push({
    label: "tabela da ata",
    url: `/ata_registro_precos/itens/tabela/${ata.id_ata}?page_size=1000`,
  });

  for (const attempt of attempts) {
    try {
      const $ = await fetchDoc(attempt.url);
      const items = extractItensFromDoc($, ata.id_ata);
      if (items.length > 0) return items;
    } catch (err) {
      // tenta próxima estratégia
    }
  }
  return [];
}

// ---------- contratos ----------
function extractContratosFromDoc($, ataId) {
  const out = [];
  const seen = new Set();
  $('a[href*="/contratos/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") || "";
    const m = href.match(/\/contratos\/(\d+)\/?/);
    if (!m) return;
    const contratoId = m[1];
    if (seen.has(contratoId)) return;
    seen.add(contratoId);
    const numero = txt($, $a.find("span").first()) || txt($, $a);
    const tr = $a.closest("tr");
    let secretaria = "";
    let valor_total = 0;
    let vigencia = "";
    if (tr.length) {
      secretaria = txt($, tr.find("td.text-left").first());
      tr.find("td").each((__, td) => {
        const t = txt($, $(td));
        if (!valor_total && /R\$/.test(t)) {
          const v = parseValor(t);
          if (v > 0) valor_total = v;
        }
        if (!vigencia && /\d{2}\/\d{2}\/\d{4}/.test(t)) vigencia = t;
      });
    }
    out.push({
      id_contrato_m2a: contratoId,
      numero_contrato: numero,
      sequencial: extrairNumeroSequencial(numero),
      id_ata: ataId,
      secretaria_nome: secretaria || "",
      valor_total,
      vigencia,
    });
  });
  return out;
}

async function fetchContratosDaAta(ata) {
  try {
    const $ = await fetchDoc(`/ata_registro_precos/tabela_contratos/${ata.id_ata}?page_size=1000`);
    return extractContratosFromDoc($, ata.id_ata);
  } catch {
    return [];
  }
}

// ---------- concorrência ----------
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- cascata completa ----------
async function fetchAtasDoProcesso(processoId) {
  // O endpoint AJAX /licitacao_ata_contrato/tabela/{id}/ nem sempre responde
  // direto — tentamos várias estratégias até achar atas.
  const attempts = [
    `/licitacao_ata_contrato/tabela/${processoId}/`,
    `/licitacao_ata_contrato/tabela/${processoId}/?page_size=1000`,
    `/processo_administrativo/${processoId}/`,
    `/processo_administrativo/${processoId}/#processo_administrativo_item`,
  ];
  let lastErr = null;
  for (const url of attempts) {
    try {
      const $ = await fetchDoc(url);
      const atas = extractAtasFromDoc($);
      if (atas.length) return atas;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function runCascata(processoId) {
  const atas = await fetchAtasDoProcesso(processoId);

  const resultados = await mapWithConcurrency(atas, SYNC_CONCURRENCY, async (ata) => {
    const [itens, contratos] = await Promise.all([fetchItensDaAta(ata), fetchContratosDaAta(ata)]);
    return { ata, itens, contratos };
  });

  const itens = resultados.flatMap((r) => r.itens);
  const contratos = resultados.flatMap((r) => r.contratos);

  const resumo = {
    qtd_atas: atas.length,
    qtd_itens: itens.length,
    qtd_contratos: contratos.length,
    ultimo_numero_por_secretaria: {},
  };
  for (const c of contratos) {
    const sec = c.secretaria_nome || "NÃO IDENTIFICADA";
    const atual = resumo.ultimo_numero_por_secretaria[sec] || 0;
    if (c.sequencial > atual) resumo.ultimo_numero_por_secretaria[sec] = c.sequencial;
  }

  return { atas, itens, contratos_existentes: contratos, resumo };
}

// ---------- rotas ----------
export async function processosRoutes(app) {
  // Cascata completa do processo: atas + itens + contratos + resumo.
  app.get("/processos/:id", async (req, reply) => {
    const id = String(req.params.id || "").trim();
    if (!id) return reply.code(400).send({ error: "id obrigatório" });
    try {
      const payload = await runCascata(id);
      return { processo_id: id, ...payload };
    } catch (err) {
      const status = err.status && err.status >= 400 ? err.status : 500;
      return reply.code(status).send({ error: String(err?.message ?? err) });
    }
  });

  // Apenas as atas (rápido).
  app.get("/processos/:id/atas", async (req, reply) => {
    const id = String(req.params.id || "").trim();
    if (!id) return reply.code(400).send({ error: "id obrigatório" });
    try {
      const $ = await fetchDoc(`/licitacao_ata_contrato/tabela/${id}/`);
      return { processo_id: id, atas: extractAtasFromDoc($) };
    } catch (err) {
      const status = err.status && err.status >= 400 ? err.status : 500;
      return reply.code(status).send({ error: String(err?.message ?? err) });
    }
  });

  // Itens de uma ata específica, usando a mesma cascata de fallbacks da extensão.
  app.get("/processos/:id/atas/:ataId/itens", async (req, reply) => {
    const ataId = String(req.params.ataId || "").trim();
    if (!ataId) return reply.code(400).send({ error: "ataId obrigatório" });
    try {
      const itens = await fetchItensDaAta({ id_ata: ataId });
      return { id_ata: ataId, itens };
    } catch (err) {
      const status = err.status && err.status >= 400 ? err.status : 500;
      return reply.code(status).send({ error: String(err?.message ?? err) });
    }
  });

  // Contratos vinculados a uma ata.
  app.get("/processos/:id/atas/:ataId/contratos", async (req, reply) => {
    const ataId = String(req.params.ataId || "").trim();
    if (!ataId) return reply.code(400).send({ error: "ataId obrigatório" });
    try {
      const contratos = await fetchContratosDaAta({ id_ata: ataId });
      return { id_ata: ataId, contratos };
    } catch (err) {
      const status = err.status && err.status >= 400 ? err.status : 500;
      return reply.code(status).send({ error: String(err?.message ?? err) });
    }
  });
}
