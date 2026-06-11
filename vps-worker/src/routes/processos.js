import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";
import { config } from "../config.js";

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
// Chaves conhecidas que o portal M2A usa para envelopar HTML em JSON.
const HTML_ENVELOPE_KEYS = [
  "html_table",
  "html",
  "htmlTable",
  "data",
  "table",
  "content",
  "conteudo",
  "tbody",
  "rows",
];
function findHtmlLikeString(node, depth = 0) {
  if (depth > 6) return null;
  if (typeof node === "string") {
    if (/<(table|tbody|tr|td|div)\b/i.test(node) || node.includes("kt-datatable__row") || node.includes("\\n<td")) return node;
    return null;
  }
  if (Array.isArray(node)) {
    for (const it of node) { const f = findHtmlLikeString(it, depth + 1); if (f) return f; }
    return null;
  }
  if (node && typeof node === "object") {
    // Prioriza chaves conhecidas (html_table etc.)
    for (const key of HTML_ENVELOPE_KEYS) {
      if (key in node) {
        const f = findHtmlLikeString(node[key], depth + 1);
        if (f) return f;
      }
    }
    for (const v of Object.values(node)) { const f = findHtmlLikeString(v, depth + 1); if (f) return f; }
  }
  return null;
}
function coerceHtmlPayload(rawText) {
  if (rawText && typeof rawText === "object") {
    const htmlStr = findHtmlLikeString(rawText);
    if (htmlStr) return decodeEscapedHtmlString(htmlStr);
    return JSON.stringify(rawText);
  }
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

// Endpoints AJAX do portal (tabela/subtabela) só devolvem corpo quando
// recebem o handshake típico de XHR. Sem isso, voltam 200 com bytes=0.
function isAjaxLikePath(path) {
  return /\/(tabela|subtabela)\//i.test(path);
}

function buildAjaxHeaders(path) {
  if (!isAjaxLikePath(path)) return undefined;
  const m = path.match(/\/(\d+)(?:\/|\?|$)/);
  const referer = m
    ? `${config.m2a.baseUrl}/processo_administrativo/${m[1]}/`
    : undefined;
  return {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    ...(referer ? { Referer: referer } : {}),
  };
}

function traceStep(trace, event) {
  if (!trace) return;
  const step = {
    seq: trace.length + 1,
    ts: new Date().toISOString(),
    ...event,
  };
  trace.push(step);
  const status = step.status ? ` status=${step.status}` : "";
  const counts = step.encontrados ? ` encontrados=${JSON.stringify(step.encontrados)}` : "";
  const selected = step.selecionado ? " selecionado=true" : "";
  const blocked = step.bloqueado ? " bloqueado=true" : "";
  console.log(`[m2a-trace] #${step.seq} ${step.fase || ""} ${step.label || ""} ${step.url || ""}${status}${counts}${selected}${blocked}`);
}

async function fetchDocDetailed(path, extraHeaders) {
  const headers = { ...(buildAjaxHeaders(path) || {}), ...(extraHeaders || {}) };
  const r = await m2a.get(path, Object.keys(headers).length ? { headers } : undefined);
  if (r.status >= 400) {
    const err = new Error(`M2A respondeu ${r.status} em ${path}`);
    err.status = r.status;
    throw err;
  }
  const html = coerceHtmlPayload(r.html);
  return {
    $: cheerio.load(html),
    status: r.status,
    finalUrl: r.finalUrl || "",
    bytes: String(r.html ?? "").length,
    decodedBytes: html.length,
  };
}

async function fetchDoc(path, extraHeaders) {
  const doc = await fetchDocDetailed(path, extraHeaders);
  return doc.$;
}

export function parseM2aHtmlPayloadForTest(rawPayload) {
  return cheerio.load(coerceHtmlPayload(rawPayload));
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

  // Estratégia 1: linhas da kt-datatable (resposta de /tabela/ata_registro_de_preco/...)
  // Mapeamento por posição de coluna conforme HTML real do portal M2A:
  //   td[0].text-center  -> número da ata (a > span)
  //   td[1].text-left    -> secretaria/gerenciador (span)
  //   td[2].text-left    -> fornecedor (span)
  //   td[3].text-center  -> início vigência (span)
  //   td[4].text-center  -> fim vigência (span)
  //   td[5].text-right   -> valor (span)
  //   td.none (último)   -> objeto / descrição
  const rows = $('tr.kt-datatable__row, tbody tr').toArray();
  for (const trEl of rows) {
    const tr = $(trEl);
    const anchor = tr.find('a[href*="/ata_registro_precos/"]').first();
    if (!anchor.length) continue;
    const href = anchor.attr("href") || "";
    const m = href.match(/\/ata_registro_precos\/(\d+)\/?/);
    if (!m) continue;
    const ataId = m[1];
    if (seen.has(ataId)) continue;
    seen.add(ataId);

    const cells = tr.find("td").toArray().map((td) => $(td));
    const cellText = (i) => (cells[i] ? cleanTextValue(cells[i].text()) : "");
    const spanText = (i) => {
      if (!cells[i]) return "";
      const sp = cells[i].find("span").first();
      return cleanTextValue(sp.length ? sp.text() : cells[i].text());
    };

    const numero = cleanTextValue(anchor.find("span").first().text() || anchor.text()) || `ATA-${ataId}`;
    const secretaria = spanText(1);
    const fornecedor = spanText(2);
    const vigenciaInicio = spanText(3);
    const vigenciaFim = spanText(4);
    const valorStr = spanText(5);
    const valor = parseValor(valorStr);

    // Objeto: último td (geralmente com classe "none") ou maior bloco de texto.
    let objeto = "";
    const noneTd = tr.find("td.none").last();
    if (noneTd.length) objeto = cleanTextValue(noneTd.text());
    if (!objeto && cells.length) objeto = cellText(cells.length - 1);

    const cnpjMatch = cleanTextValue(tr.text()).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    const cnpj = cnpjMatch ? cnpjMatch[0] : undefined;

    const detailUrl = extractAtaDetailUrl($, tr);
    const licitacaoAtaContratoId = extractLicitacaoAtaContratoId(tr, detailUrl);

    out.push({
      id_ata: ataId,
      id_licitacao_ata_contrato: licitacaoAtaContratoId || undefined,
      numero_ata: numero,
      secretaria_nome: secretaria || "",
      fornecedor: { nome: fornecedor || "", cnpj },
      vigencia_inicio: vigenciaInicio || "",
      vigencia_fim: vigenciaFim || "",
      valor_total: valor,
      valor_total_str: valorStr || "",
      objeto: objeto || "",
      detail_url: detailUrl || undefined,
    });
  }

  // Estratégia 2 (fallback): varredura por âncora se a tabela não casou.
  if (out.length === 0) {
    $('a[href*="/ata_registro_precos/"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr("href") || "";
      const m = href.match(/\/ata_registro_precos\/(\d+)\/?/);
      if (!m) return;
      const ataId = m[1];
      if (seen.has(ataId)) return;
      seen.add(ataId);
      const numero = cleanTextValue($a.find("span").first().text() || $a.text());
      const tr = $a.closest("tr");
      let fornecedor = "";
      let cnpj = "";
      let detailUrl = "";
      let licitacaoAtaContratoId = "";
      if (tr.length) {
        const cellTxt = cleanTextValue(tr.text());
        const cnpjMatch = cellTxt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
        if (cnpjMatch) cnpj = cnpjMatch[0];
        const tdLeft = tr.find("td.text-left").first();
        fornecedor = findAtaFornecedorCellText($, tdLeft, numero);
        detailUrl = extractAtaDetailUrl($, tr);
        licitacaoAtaContratoId = extractLicitacaoAtaContratoId(tr, detailUrl);
      }
      out.push({
        id_ata: ataId,
        id_licitacao_ata_contrato: licitacaoAtaContratoId || undefined,
        numero_ata: numero || `ATA-${ataId}`,
        fornecedor: { nome: fornecedor || "", cnpj: cnpj || undefined },
        detail_url: detailUrl || undefined,
      });
    });
  }

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

async function fetchItensDaAta(ata, trace) {
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
  traceStep(trace, {
    fase: "itens",
    label: "subtabela de licitação (fallback por id_ata)",
    id_ata: ata.id_ata,
    numero_ata: ata.numero_ata,
    url: normalizeSubtableUrl(`/licitacao_ata_contrato_item/subtabela/${ata.id_ata}`, ata.id_ata),
    bloqueado: true,
    motivo: "endpoint usa id_licitacao_ata_contrato; id_ata pode apontar para registros de outra ata/processo",
  });
  attempts.push({
    label: "tabela da ata",
    url: `/ata_registro_precos/itens/tabela/${ata.id_ata}?page_size=1000`,
  });

  for (const attempt of attempts) {
    try {
      const doc = await fetchDocDetailed(attempt.url);
      const $ = doc.$;
      const items = extractItensFromDoc($, ata.id_ata);
      traceStep(trace, {
        fase: "itens",
        label: attempt.label,
        id_ata: ata.id_ata,
        numero_ata: ata.numero_ata,
        url: attempt.url,
        status: doc.status,
        finalUrl: doc.finalUrl,
        bytes: doc.bytes,
        decodedBytes: doc.decodedBytes,
        encontrados: { itens: items.length },
        amostra: items.slice(0, 5).map((item) => ({
          numero_item: item.numero_item,
          id_item: item.id_item,
          descricao: cleanTextValue(item.descricao).slice(0, 120),
        })),
        selecionado: items.length > 0,
      });
      if (items.length > 0) return items;
    } catch (err) {
      traceStep(trace, {
        fase: "itens",
        label: attempt.label,
        id_ata: ata.id_ata,
        numero_ata: ata.numero_ata,
        url: attempt.url,
        erro: String(err?.message ?? err),
      });
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

async function fetchContratosDaAta(ata, trace) {
  const url = `/ata_registro_precos/tabela_contratos/${ata.id_ata}?page_size=1000`;
  try {
    const doc = await fetchDocDetailed(url);
    const contratos = extractContratosFromDoc(doc.$, ata.id_ata);
    traceStep(trace, {
      fase: "contratos",
      label: "contratos da ata",
      id_ata: ata.id_ata,
      numero_ata: ata.numero_ata,
      url,
      status: doc.status,
      finalUrl: doc.finalUrl,
      bytes: doc.bytes,
      decodedBytes: doc.decodedBytes,
      encontrados: { contratos: contratos.length },
      amostra: contratos.slice(0, 5).map((contrato) => ({
        numero_contrato: contrato.numero_contrato,
        id_contrato_m2a: contrato.id_contrato_m2a,
        secretaria_nome: contrato.secretaria_nome,
      })),
    });
    return contratos;
  } catch (err) {
    traceStep(trace, {
      fase: "contratos",
      label: "contratos da ata",
      id_ata: ata.id_ata,
      numero_ata: ata.numero_ata,
      url,
      erro: String(err?.message ?? err),
    });
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
async function fetchAtasDoProcesso(processoId, trace) {
  // Endpoints reais usados pelo portal (descobertos via inspeção da página
  // /processo_administrativo/{id}/).
  const attempts = [
    `/processo_administrativo/tabela/ata_registro_de_preco/${processoId}/?page_size=1000`,
    `/processo_administrativo/tabela/ata_registro_de_preco/${processoId}/`,
    `/licitacao_ata_contrato/tabela/${processoId}/?page_size=1000`,
    `/licitacao_ata_contrato/tabela/${processoId}/`,
    `/processo_administrativo/${processoId}/`,
  ];
  let lastErr = null;
  for (const url of attempts) {
    try {
      const doc = await fetchDocDetailed(url);
      const atas = extractAtasFromDoc(doc.$);
      traceStep(trace, {
        fase: "atas",
        label: "buscar atas do processo",
        processo_id: processoId,
        url,
        status: doc.status,
        finalUrl: doc.finalUrl,
        bytes: doc.bytes,
        decodedBytes: doc.decodedBytes,
        encontrados: { atas: atas.length },
        amostra: atas.slice(0, 5).map((ata) => ({
          id_ata: ata.id_ata,
          id_licitacao_ata_contrato: ata.id_licitacao_ata_contrato,
          numero_ata: ata.numero_ata,
          fornecedor: ata.fornecedor?.nome,
          detail_url: ata.detail_url,
        })),
        selecionado: atas.length > 0,
      });
      if (atas.length) return atas;
    } catch (err) {
      lastErr = err;
      traceStep(trace, {
        fase: "atas",
        label: "buscar atas do processo",
        processo_id: processoId,
        url,
        erro: String(err?.message ?? err),
      });
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function runCascata(processoId) {
  const trace = [];
  traceStep(trace, { fase: "inicio", label: "iniciar sincronização", processo_id: processoId, url: `/processo_administrativo/${processoId}/` });
  const atas = await fetchAtasDoProcesso(processoId, trace);

  const resultados = await mapWithConcurrency(atas, SYNC_CONCURRENCY, async (ata) => {
    const [itens, contratos] = await Promise.all([fetchItensDaAta(ata, trace), fetchContratosDaAta(ata, trace)]);
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

  traceStep(trace, {
    fase: "fim",
    label: "sincronização finalizada",
    processo_id: processoId,
    encontrados: { atas: atas.length, itens: itens.length, contratos: contratos.length },
  });

  return { atas, itens, contratos_existentes: contratos, resumo, trace };
}

// ---------- helpers de URL ----------
export function extractProcessoIdFromUrl(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  const m =
    s.match(/\/processo_administrativo\/(\d+)/) ||
    s.match(/\/detail\/(\d+)/) ||
    s.match(/(\d+)\/?$/);
  return m ? m[1] : null;
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

  // Espelha M2A_START_SYNC_PROCESSO da extensão: aceita a URL crua do processo
  // (ou o próprio ID) e devolve o payload completo (atas, itens, contratos,
  // resumo com último número por secretaria). É esta saída que alimenta
  // depois o POST /contratos/processar.
  app.post("/processos/sync", async (req, reply) => {
    const body = req.body || {};
    const raw =
      body.m2a_processo_url || body.url || body.processoId || body.processo_id;
    const id = extractProcessoIdFromUrl(raw);
    if (!id) {
      return reply.code(400).send({
        error:
          "informe m2a_processo_url (ex.: https://.../processo_administrativo/68973/) ou processoId",
      });
    }
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
      const atas = await fetchAtasDoProcesso(id);
      return { processo_id: id, atas };
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

  // DEBUG: retorna o HTML cru de qualquer path autenticado para inspeção.
  // Ex.: GET /debug/raw?path=/processo_administrativo/68973/
  app.get("/debug/raw", async (req, reply) => {
    const path = String(req.query.path || "").trim();
    if (!path) return reply.code(400).send({ error: "path obrigatório" });
    try {
      const r = await m2a.get(path);
      reply.header("content-type", "text/plain; charset=utf-8");
      return `STATUS=${r.status}\nFINAL_URL=${r.finalUrl}\nLEN=${r.html.length}\n----HTML----\n${r.html}`;
    } catch (err) {
      return reply.code(500).send({ error: String(err?.message ?? err) });
    }
  });
}
