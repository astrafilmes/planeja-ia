import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";
import { config } from "../config.js";

// =====================================================================
// Porta da lógica de m2a-extension/engine/processo_scraper.js
// para o worker Node (cheerio em vez de DOMParser, fetch via m2a client).
// Mantém os mesmos endpoints e formato de saída.
// =====================================================================

const SYNC_CONCURRENCY = 3;
const RETRYABLE_M2A_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableM2AError(err) {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (RETRYABLE_M2A_STATUS.has(status)) return true;
  return /timeout|tempor|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|M2A respondeu (408|425|429|500|502|503|504)/i.test(
    String(err?.message ?? err ?? ""),
  );
}

function isSuspiciousEmptyAjax(doc) {
  return Number(doc?.status ?? 0) === 200 && Number(doc?.decodedBytes ?? doc?.bytes ?? 0) < 80;
}

async function withM2ARetry(label, operation, trace, meta = {}) {
  const maxAttempts = meta.maxAttempts ?? 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation(attempt);
      if (attempt > 1) {
        traceStep(trace, {
          ...meta,
          fase: meta.fase ?? "retry",
          label: `${label} recuperado`,
          tentativa: attempt,
          selecionado: true,
        });
      }
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableM2AError(err);
      traceStep(trace, {
        ...meta,
        fase: meta.fase ?? "retry",
        label: `${label} falhou`,
        tentativa: attempt,
        maxTentativas: maxAttempts,
        retryable,
        erro: String(err?.message ?? err),
      });
      if (!retryable || attempt === maxAttempts) break;
      await sleep(1_500 * attempt);
    }
  }
  throw lastErr || new Error(`${label} falhou`);
}

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
  const detalhes = { ...step };
  delete detalhes.seq;
  delete detalhes.ts;
  delete detalhes.fase;
  delete detalhes.label;
  delete detalhes.url;
  delete detalhes.status;
  delete detalhes.encontrados;
  delete detalhes.selecionado;
  delete detalhes.bloqueado;
  const detailKeys = Object.keys(detalhes).filter((key) => detalhes[key] !== undefined && detalhes[key] !== null);
  if (detailKeys.length) {
    console.dir({ traceSeq: step.seq, detalhes }, { depth: 8, maxArrayLength: 200 });
  }
}

function logTable(label, rows, limit = 500) {
  const list = Array.isArray(rows) ? rows : [];
  console.log(`[m2a-vps] ${label}: ${list.length} registro(s)`);
  if (!list.length) return;
  console.table(list.slice(0, limit));
  if (list.length > limit) {
    console.log(`[m2a-vps] ${label}: ${list.length - limit} registro(s) omitidos no console.table`);
  }
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
      traceStep(trace, {
        fase: "itens",
        label: `requisitar ${attempt.label}`,
        id_ata: ata.id_ata,
        numero_ata: ata.numero_ata,
        url: attempt.url,
      });
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
// Extrai TODOS os campos disponíveis na linha do contrato no portal M2A.
// Layout típico (kt-datatable tr.tr_contrato):
//   td vazio (details) | th checkbox | td(nº contrato a>span) | td(processo a>span)
//   | td.text-left (secretaria) | td.text-left (FORNECEDOR)
//   | td.text-center (vigência início) | td.text-center (vigência fim)
//   | td.text-right (valor) | td hidden status | td hidden modalidade
//   | td ações | td hidden objeto
function extractContratosFromDoc($, ataId, processoId = null) {
  const out = [];
  const seen = new Set();
  const expectedProcessoId = String(processoId ?? "").trim();
  let descartadosOutroProcesso = 0;
  let descartadosSemProcesso = 0;
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
    let fornecedor = "";
    let vigencia_inicio = "";
    let vigencia_fim = "";
    let vigencia = "";
    let valor_total = 0;
    let objeto = "";
    let cnpj;

    if (tr.length) {
      // Captura TODAS as células incluindo as ocultas (display:none).
      const tds = tr.find("td").toArray().map((td) => $(td));
      const tdText = (i) => (tds[i] ? cleanTextValue(tds[i].find("span").first().text() || tds[i].text()) : "");

      // text-left: 1ª = secretaria, 2ª = fornecedor.
      const textLeft = tr.find("td.text-left").toArray().map((td) => $(td));
      secretaria = textLeft[0] ? cleanTextValue(textLeft[0].find("span").first().text() || textLeft[0].text()) : "";
      fornecedor = textLeft[1] ? cleanTextValue(textLeft[1].find("span").first().text() || textLeft[1].text()) : "";

      // text-center com formato de data → vigência (1ª = início, 2ª = fim).
      const datas = [];
      tr.find("td.text-center").each((__, td) => {
        const t = cleanTextValue($(td).find("span").first().text() || $(td).text());
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) datas.push(t);
      });
      vigencia_inicio = datas[0] || "";
      vigencia_fim = datas[1] || "";
      vigencia = vigencia_inicio && vigencia_fim ? `${vigencia_inicio} - ${vigencia_fim}` : (vigencia_inicio || vigencia_fim);

      // text-right (ou qualquer td) com R$ → valor.
      tr.find("td").each((__, td) => {
        const t = cleanTextValue($(td).text());
        if (!valor_total && /R\$/.test(t)) {
          const v = parseValor(t);
          if (v > 0) valor_total = v;
        }
      });

      // Objeto: normalmente último td oculto (display:none) com texto longo.
      const hiddenTds = tr.find('td[style*="display: none"], td[style*="display:none"]').toArray();
      for (const td of hiddenTds) {
        const t = cleanTextValue($(td).text());
        if (t.length > 30 && !/R\$/.test(t) && !/^\d{2}\/\d{2}\/\d{4}/.test(t) && !/^(ativo|manual|finalizado|cancelado)/i.test(t)) {
          objeto = t;
          break;
        }
      }

      const cnpjMatch = cleanTextValue(tr.text()).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
      if (cnpjMatch) cnpj = cnpjMatch[0];
    }

    const processoAnchor = tr.find('a[href*="/processo_administrativo/"]').first();
    const processoHref = processoAnchor.attr("href") || "";
    const processoIdLinha = processoHref.match(/\/processo_administrativo\/(\d+)\/?/)?.[1] || "";
    const processoNumero = cleanTextValue(processoAnchor.find("span").first().text() || processoAnchor.text());

    if (expectedProcessoId) {
      if (!processoIdLinha) {
        descartadosSemProcesso += 1;
        return;
      }
      if (processoIdLinha !== expectedProcessoId) {
        descartadosOutroProcesso += 1;
        return;
      }
    }

    out.push({
      id_contrato_m2a: contratoId,
      numero_contrato: numero,
      sequencial: extrairNumeroSequencial(numero),
      id_ata: ataId,
      m2a_processo_id: processoIdLinha || null,
      processo_numero: processoNumero || null,
      secretaria_nome: secretaria || "",
      fornecedor_nome: fornecedor || "",
      fornecedor_cnpj: cnpj,
      vigencia_inicio,
      vigencia_fim,
      vigencia,
      valor_total,
      objeto,
    });
  });
  if (expectedProcessoId && (descartadosOutroProcesso || descartadosSemProcesso)) {
    console.warn(
      `[m2a-vps] ata ${ataId}: contratos descartados pelo filtro de processo ${expectedProcessoId} ` +
        `(outro processo=${descartadosOutroProcesso}, sem processo=${descartadosSemProcesso})`,
    );
  }
  return out;
}


async function fetchAtaFornecedorFromDetail(idAta, trace) {
  const url = `/ata_registro_precos/${idAta}`;
  try {
    const { $, status } = await fetchDocDetailed(url);
    // 1) anchor para /fornecedores/{id}
    const fornAnchor = $('a[href*="/fornecedores/"]').first();
    let nome = "";
    let cnpj = "";
    if (fornAnchor.length) {
      nome = cleanTextValue(fornAnchor.find("span").first().text() || fornAnchor.text());
    }
    // 2) varre labels/dt buscando "Fornecedor" ou "Empresa"
    if (!nome) {
      $("label, dt, th, strong, b, .form-group, .kt-portlet__head-title").each((_, el) => {
        const t = cleanTextValue($(el).text());
        if (/^(fornecedor|empresa contratada|empresa)\b/i.test(t)) {
          const candidates = [
            $(el).next(),
            $(el).parent().find("input").first(),
            $(el).parent().find("span").last(),
            $(el).siblings("dd").first(),
          ];
          for (const c of candidates) {
            if (!c || !c.length) continue;
            const v = cleanTextValue(c.attr?.("value") || c.text?.() || "");
            if (v && v.length > 2 && !/^fornecedor/i.test(v)) { nome = v; return false; }
          }
        }
      });
    }
    // 3) CNPJ presente em qualquer lugar
    const cnpjMatch = cleanTextValue($("body").text()).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (cnpjMatch) cnpj = cnpjMatch[0];

    // 4) SITUAÇÃO da ata (Vigente / Expirada / Cancelado / Anulado / Suspenso ...).
    // Extraída do widget "Situação" no cabeçalho de detalhe da ata.
    let situacao = "";
    $(".kt-widget__title, .kt-widget12__desc, label, dt, th, strong, b").each((_, el) => {
      const t = cleanTextValue($(el).text());
      if (/^situa/i.test(t)) {
        const candidatos = [
          $(el).next(),
          $(el).parent().find(".kt-widget__value").last(),
          $(el).siblings().last(),
        ];
        for (const c of candidatos) {
          if (!c || !c.length) continue;
          const v = cleanTextValue(c.text?.() || "");
          if (v && v.length < 40) { situacao = v; return false; }
        }
      }
    });
    const cancelada = /cancelad|anulad|suspenso|revogad/i.test(situacao);

    traceStep(trace, {
      fase: "ata-detalhe",
      label: "detalhe da ata",
      id_ata: idAta,
      url,
      status,
      fornecedor: nome || null,
      cnpj: cnpj || null,
      situacao: situacao || null,
      cancelada,
    });
    return {
      nome: nome || "",
      cnpj: cnpj || undefined,
      situacao: situacao || null,
      cancelada,
    };
  } catch (err) {
    traceStep(trace, {
      fase: "ata-detalhe",
      label: "falha ao buscar detalhe da ata",
      id_ata: idAta,
      url,
      erro: String(err?.message ?? err),
    });
  }
  return null;
}

async function fetchContratosDaAta(ata, trace = [], processoId = null) {
  const url = `/ata_registro_precos/tabela_contratos/${ata.id_ata}?page_size=1000`;
  try {
    traceStep(trace, {
      fase: "contratos",
      label: "requisitar contratos da ata",
      id_ata: ata.id_ata,
      numero_ata: ata.numero_ata,
      url,
    });
    const doc = await fetchDocDetailed(url);
    const contratos = extractContratosFromDoc(doc.$, ata.id_ata, processoId);
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
        m2a_processo_id: contrato.m2a_processo_id,
        processo_numero: contrato.processo_numero,
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

// =====================================================================
// NOVO ORQUESTRADOR (FASE 1 → 2 → 3)
// Regras estritas:
//   1) Tabela mestra de itens = fonte da verdade (sem duplicação).
//   2) Atas com badge "Desclassificado/Cancelado/Anulado" são ignoradas.
//   3) Subtabela da ata apenas VINCULA itens à mestra (não cria solto).
// =====================================================================

// ---------- FASE 1: TABELA MESTRA DE ITENS ----------
function parseNumeroBR(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractLoteNumero(value) {
  if (!value) return "";
  const s = cleanTextValue(value).replace(/lote/i, "").trim();
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

function extractItemMestraId(tr) {
  const trId = tr.attr("id") || "";
  const m = trId.match(/tr_processo_administrativo_item_(\d+)/i);
  if (m) return m[1];
  const fromInput = tr.find('input[type="checkbox"][value]').first().attr("value");
  if (fromInput && /^\d+$/.test(fromInput)) return fromInput;
  return "";
}

function extractTabelaMestraItens($, processoId) {
  const out = [];
  const seen = new Set();
  const rows = $("tr.kt-datatable__row.tr_processo_administrativo_item").toArray();
  rows.forEach((trEl, idx) => {
    const tr = $(trEl);
    const tds = tr.find("td").toArray().map((td) => $(td));
    if (tds.length < 9) return;
    const ordem = cleanTextValue(tds[2]?.text() || "");
    const descricao = cleanTextValue(tds[3]?.text() || "");
    const lote = extractLoteNumero(tds[4]?.text() || "");
    const unidade = cleanTextValue(tds[5]?.text() || "");
    const qtdTotal = parseNumeroBR(tds[6]?.text());
    const valorUnit = parseNumeroBR(tds[7]?.text());
    const valorTotal = parseNumeroBR(tds[8]?.text());
    let especificacao = "";
    const noneTd = tr.find("td.none").first();
    if (noneTd.length) especificacao = cleanTextValue(noneTd.text());
    else if (tds[12]) especificacao = cleanTextValue(tds[12].text());

    if (!ordem && !descricao) return;
    const mestraId = extractItemMestraId(tr) || `M:${processoId}:${ordem || idx + 1}`;
    const ordemNorm = String(ordem).replace(/^0+/, "") || String(idx + 1);
    if (seen.has(ordemNorm)) return;
    seen.add(ordemNorm);

    out.push({
      id_item_mestre: mestraId,
      ordem: ordemNorm,
      lote,
      descricao,
      especificacao,
      unidade,
      quantidade_total: qtdTotal,
      valor_unitario: valorUnit,
      valor_total: valorTotal,
    });
  });
  return out;
}

async function fetchTabelaMestraItens(processoId, trace) {
  const url = `/processo_administrativo/item/tabela/${processoId}/?page_size=1000`;
  traceStep(trace, { fase: "itens_mestre", label: "tabela mestra de itens", processo_id: processoId, url });
  const doc = await withM2ARetry(
    "tabela mestra de itens",
    async () => {
      const fetched = await fetchDocDetailed(url);
      if (isSuspiciousEmptyAjax(fetched)) {
        const err = new Error(
          `M2A retornou tabela mestra vazia/instável em ${url} (status=${fetched.status}, bytes=${fetched.decodedBytes})`,
        );
        err.status = 502;
        throw err;
      }
      return fetched;
    },
    trace,
    { fase: "itens_mestre", processo_id: processoId, url },
  );
  const itens = extractTabelaMestraItens(doc.$, processoId);
  logTable(
    `processo ${processoId} / tabela mestra completa`,
    itens.map((i) => ({
      ordem: i.ordem,
      lote: i.lote,
      id_item_mestre: i.id_item_mestre,
      unidade: i.unidade,
      qtd_total: i.quantidade_total,
      valor_unitario: i.valor_unitario,
      descricao: cleanTextValue(i.descricao).slice(0, 160),
      especificacao: cleanTextValue(i.especificacao).slice(0, 160),
    })),
  );
  traceStep(trace, {
    fase: "itens_mestre",
    label: "tabela mestra extraída",
    processo_id: processoId,
    url,
    status: doc.status,
    bytes: doc.bytes,
    decodedBytes: doc.decodedBytes,
    encontrados: { itens_mestre: itens.length },
    amostra: itens.slice(0, 5).map((i) => ({ ordem: i.ordem, descricao: i.descricao.slice(0, 80) })),
    por_lote: itens.reduce((acc, item) => {
      const lote = item.lote || "SEM_LOTE";
      acc[lote] = (acc[lote] || 0) + 1;
      return acc;
    }, {}),
    itens: itens.map((i) => ({
      ordem: i.ordem,
      lote: i.lote,
      id_item_mestre: i.id_item_mestre,
      unidade: i.unidade,
      qtd_total: i.quantidade_total,
      valor_unitario: i.valor_unitario,
      descricao: cleanTextValue(i.descricao).slice(0, 220),
    })),
    selecionado: itens.length > 0,
  });
  return itens;
}

// ---------- FASE 2: ATAS VÁLIDAS (filtro anti-lixo) ----------
const STATUS_BLOQUEADOS = /(desclassificad|cancelad|anulad)/i;

function extractAtasValidasFromDoc($) {
  const out = [];
  const ignoradas = [];
  const seen = new Set();
  const rows = $("tr.kt-datatable__row.tr_licitacao_ata_contrato").toArray();
  for (const trEl of rows) {
    const tr = $(trEl);

    // REGRA CRÍTICA: bloqueia linhas com badge danger contendo Desclassificado/Cancelado/Anulado
    let statusBloqueado = "";
    tr.find("span.kt-badge--danger, .kt-badge.kt-badge--danger").each((_, el) => {
      const t = cleanTextValue($(el).text());
      if (STATUS_BLOQUEADOS.test(t)) statusBloqueado = t;
    });
    if (statusBloqueado) {
      const trId = tr.attr("id") || "";
      const id = (trId.match(/tr_licitacao_ata_contrato_(\d+)/i) || [])[1] || "";
      ignoradas.push({ id_licitacao_ata_contrato: id, status: statusBloqueado });
      continue;
    }

    const trId = tr.attr("id") || "";
    const idLicAta = (trId.match(/tr_licitacao_ata_contrato_(\d+)/i) || [])[1] || "";
    if (!idLicAta || seen.has(idLicAta)) continue;
    seen.add(idLicAta);

    const cells = tr.find("td").toArray().map((td) => $(td));
    const spanText = (i) => {
      if (!cells[i]) return "";
      const sp = cells[i].find("span").first();
      return cleanTextValue(sp.length ? sp.text() : cells[i].text());
    };

    const ataAnchor = tr.find('a[href*="/ata_registro_precos/"]').first();
    const ataIdFromHref = ataAnchor.attr("href")?.match(/\/ata_registro_precos\/(\d+)/)?.[1] || "";
    const numeroAta =
      cleanTextValue(ataAnchor.find("span").first().text() || ataAnchor.text()) ||
      spanText(0) ||
      `ATA-${idLicAta}`;

    const secretaria = spanText(1);
    const fornecedor = spanText(2);
    const cnpjMatch = cleanTextValue(tr.text()).match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);

    out.push({
      id_ata: ataIdFromHref || idLicAta,
      id_licitacao_ata_contrato: idLicAta,
      numero_ata: numeroAta,
      secretaria_nome: secretaria,
      fornecedor: { nome: fornecedor || "", cnpj: cnpjMatch?.[0] },
      detail_url: `/licitacao_ata_contrato_item/subtabela/${idLicAta}`,
    });
  }
  return { atas: out, ignoradas };
}

async function fetchAtasValidasDoProcesso(processoId, trace) {
  const url = `/licitacao_ata_contrato/tabela/${processoId}/?page_size=1000`;
  traceStep(trace, { fase: "atas", label: "tabela licitacao_ata_contrato", processo_id: processoId, url });
  const doc = await withM2ARetry(
    "tabela de atas do processo",
    async () => {
      const fetched = await fetchDocDetailed(url);
      if (isSuspiciousEmptyAjax(fetched)) {
        const err = new Error(
          `M2A retornou tabela de atas vazia/instável em ${url} (status=${fetched.status}, bytes=${fetched.decodedBytes})`,
        );
        err.status = 502;
        throw err;
      }
      return fetched;
    },
    trace,
    { fase: "atas", processo_id: processoId, url },
  );
  const { atas, ignoradas } = extractAtasValidasFromDoc(doc.$);
  logTable(
    `processo ${processoId} / atas válidas extraídas`,
    atas.map((a) => ({
      id_ata: a.id_ata,
      id_lic: a.id_licitacao_ata_contrato,
      numero_ata: a.numero_ata,
      fornecedor: a.fornecedor?.nome,
      detail_url: a.detail_url,
    })),
  );
  logTable(`processo ${processoId} / atas ignoradas por status na tabela`, ignoradas);
  traceStep(trace, {
    fase: "atas",
    label: "atas válidas filtradas",
    processo_id: processoId,
    url,
    status: doc.status,
    bytes: doc.bytes,
    decodedBytes: doc.decodedBytes,
    encontrados: { atas_validas: atas.length, ignoradas: ignoradas.length },
    ignoradas,
    amostra: atas.slice(0, 5).map((a) => ({
      id_ata: a.id_ata,
      id_lic: a.id_licitacao_ata_contrato,
      numero_ata: a.numero_ata,
      fornecedor: a.fornecedor?.nome,
    })),
    selecionado: atas.length > 0,
  });
  return atas;
}

// ---------- FASE 3: VÍNCULOS (sem duplicação) ----------
function normalizarOrdem(value) {
  const s = String(value ?? "").trim();
  const m = s.match(/\d+/);
  if (!m) return "";
  return String(Number(m[0]));
}

function extractVinculosSubtabela($, ataId, mapaMestraPorOrdem) {
  const out = [];
  const rows = $(
    "tr.tr_licitacao_ata_contrato_item, tr.tr_ata_registro_preco_item, tr.kt-datatable__row",
  ).toArray();
  for (const trEl of rows) {
    const tr = $(trEl);
    const cells = tr.find("td");
    if (!cells.length) continue;
    const cellsText = cells.toArray().map((c) => txt($, $(c))).filter(Boolean);
    if (cellsText.length < 3) continue;

    let numero = "";
    let descricaoLinha = "";
    for (let i = 0; i < cellsText.length; i++) {
      const t = cellsText[i];
      const inline = t.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
      if (inline) { numero = inline[1]; descricaoLinha = inline[2]; break; }
      if (/^\d{1,5}$/.test(t)) { numero = t; descricaoLinha = cellsText[i + 1] || ""; break; }
    }
    const ordemNorm = normalizarOrdem(numero);
    if (!ordemNorm) continue;

    const mestra = mapaMestraPorOrdem.get(ordemNorm);
    if (!mestra) continue; // não cria item solto

    let quantidade = 0;
    for (const t of cellsText) {
      if (/\d/.test(t) && !/R\$/.test(t) && !/^\d{1,5}$/.test(t) && /,/.test(t)) {
        const v = parseNumeroBR(t);
        if (v > 0) { quantidade = v; break; }
      }
    }

    // Valor unitário CONTRATADO (não o estimado da tabela mestra do processo).
    // Aparece como célula com prefixo "R$" na subtabela da ata.
    let valorContratado = 0;
    for (const t of cellsText) {
      if (looksLikeCurrency(t)) {
        const v = parseValor(t);
        if (v > 0) { valorContratado = v; break; }
      }
    }

    out.push({
      id_item_mestre: mestra.id_item_mestre,
      ordem: ordemNorm,
      id_ata: ataId,
      quantidade,
      valor_unitario_contratado: valorContratado,
      descricao_linha: descricaoLinha || mestra.descricao,
    });
  }
  return out;
}

async function fetchVinculosDaAta(ata, mapaMestraPorOrdem, trace) {
  const idLic = ata.id_licitacao_ata_contrato || ata.id_ata;
  const url = `/licitacao_ata_contrato_item/subtabela/${idLic}/?page_size=1000`;
  traceStep(trace, { fase: "vinculos", label: "subtabela de itens da ata", id_ata: ata.id_ata, id_lic: idLic, url });
  try {
    const doc = await withM2ARetry(
      "subtabela de vínculos da ata",
      async () => {
        const fetched = await fetchDocDetailed(url);
        if (isSuspiciousEmptyAjax(fetched)) {
          const err = new Error(
            `M2A retornou subtabela de vínculos vazia/instável para ata ${ata.numero_ata || ata.id_ata} (status=${fetched.status}, bytes=${fetched.decodedBytes})`,
          );
          err.status = 502;
          throw err;
        }
        return fetched;
      },
      trace,
      { fase: "vinculos", id_ata: ata.id_ata, numero_ata: ata.numero_ata, id_lic: idLic, url },
    );
    const vinculos = extractVinculosSubtabela(doc.$, ata.id_ata, mapaMestraPorOrdem);
    traceStep(trace, {
      fase: "vinculos",
      label: "vínculos extraídos",
      id_ata: ata.id_ata,
      id_lic: idLic,
      url,
      status: doc.status,
      bytes: doc.bytes,
      decodedBytes: doc.decodedBytes,
      encontrados: { vinculos: vinculos.length },
      amostra: vinculos.slice(0, 5).map((v) => ({ ordem: v.ordem, qtd: v.quantidade })),
      vinculos: vinculos.map((v) => ({
        ordem: v.ordem,
        id_item_mestre: v.id_item_mestre,
        qtd: v.quantidade,
        valor_unitario_contratado: v.valor_unitario_contratado,
        descricao_linha: cleanTextValue(v.descricao_linha).slice(0, 160),
      })),
    });
    logTable(
      `ata ${ata.numero_ata} (${ata.id_ata}) / vínculos extraídos`,
      vinculos.map((v) => ({
        ordem: v.ordem,
        id_item_mestre: v.id_item_mestre,
        qtd: v.quantidade,
        valor_unitario_contratado: v.valor_unitario_contratado,
        descricao_linha: cleanTextValue(v.descricao_linha).slice(0, 160),
      })),
    );
    return vinculos;
  } catch (err) {
    traceStep(trace, {
      fase: "vinculos",
      label: "subtabela falhou",
      id_ata: ata.id_ata,
      id_lic: idLic,
      url,
      erro: String(err?.message ?? err),
    });
    return [];
  }
}

// ---------- CASCATA REFATORADA ----------
async function runCascata(processoId) {
  const trace = [];
  traceStep(trace, {
    fase: "inicio",
    label: "iniciar sincronização v2 (mestra → atas válidas → vínculos)",
    processo_id: processoId,
  });

  // FASE 1 — Fonte da verdade
  const itensMestre = await fetchTabelaMestraItens(processoId, trace);
  const mapaMestraPorOrdem = new Map(itensMestre.map((i) => [i.ordem, i]));

  // FASE 2 — Atas válidas (filtra cancelados/desclassificados/anulados)
  const atas = await fetchAtasValidasDoProcesso(processoId, trace);

  // FASE 3 — Vínculos + contratos por ata
  const resultados = await mapWithConcurrency(atas, SYNC_CONCURRENCY, async (ata) => {
    // Detalhe da ata SEMPRE — para descobrir Situação (Cancelada/Anulada/Suspensa).
    // Atas canceladas ainda entregam contratos (para numeração), mas seus vínculos
    // de itens são descartados, liberando os itens para a próxima ata válida.
    const detalhe = await fetchAtaFornecedorFromDetail(ata.id_ata, trace);
    ata.situacao = detalhe?.situacao ?? null;
    ata.cancelada = !!detalhe?.cancelada;
    if (!ata.fornecedor) ata.fornecedor = { nome: "", cnpj: undefined };
    if (detalhe?.nome && !(ata.fornecedor.nome || "").trim()) ata.fornecedor.nome = detalhe.nome;
    if (detalhe?.cnpj && !(ata.fornecedor.cnpj || "")) ata.fornecedor.cnpj = detalhe.cnpj;

    const vinculosPromise = ata.cancelada
      ? Promise.resolve([])
      : fetchVinculosDaAta(ata, mapaMestraPorOrdem, trace);
    const [vinculos, contratos] = await Promise.all([
      vinculosPromise,
      fetchContratosDaAta(ata, trace, processoId),
    ]);
    if (ata.cancelada) {
      traceStep(trace, {
        fase: "vinculos",
        label: "ata cancelada — vínculos ignorados",
        id_ata: ata.id_ata,
        numero_ata: ata.numero_ata,
        situacao: ata.situacao,
        contratos: contratos.length,
      });
    }
    return { ata, vinculos, contratos };
  });

  const vinculosValidosPorOrdem = new Map();
  for (const { ata, vinculos } of resultados) {
    if (ata.cancelada) continue;
    for (const v of vinculos) {
      const list = vinculosValidosPorOrdem.get(v.ordem) || [];
      list.push({
        id_ata: ata.id_ata,
        numero_ata: ata.numero_ata,
        id_lic: ata.id_licitacao_ata_contrato,
        fornecedor: ata.fornecedor?.nome || "",
        qtd: v.quantidade,
        valor_unitario_contratado: v.valor_unitario_contratado,
      });
      vinculosValidosPorOrdem.set(v.ordem, list);
    }
  }

  const diagnosticoDistribuicao = resultados.map(({ ata, vinculos, contratos }) => ({
    id_ata: ata.id_ata,
    id_lic: ata.id_licitacao_ata_contrato,
    numero_ata: ata.numero_ata,
    situacao: ata.situacao || "",
    cancelada: !!ata.cancelada,
    fornecedor: ata.fornecedor?.nome || "",
    contratos: contratos.length,
    vinculos_considerados: ata.cancelada ? 0 : vinculos.length,
    vinculos_lidos: vinculos.length,
    ordens: vinculos.map((v) => v.ordem).join(", "),
  }));
  const itensSemVinculo = itensMestre
    .filter((m) => !vinculosValidosPorOrdem.has(m.ordem))
    .map((m) => ({
      ordem: m.ordem,
      lote: m.lote,
      id_item_mestre: m.id_item_mestre,
      descricao: cleanTextValue(m.descricao).slice(0, 180),
    }));
  const itensComMultiplasAtas = Array.from(vinculosValidosPorOrdem.entries())
    .filter(([, list]) => list.length > 1)
    .map(([ordem, list]) => ({
      ordem,
      atas: list.map((v) => v.numero_ata || v.id_ata).join(" | "),
      detalhes: list,
    }));

  console.group(`[m2a-vps] diagnóstico de distribuição processo ${processoId}`);
  logTable("distribuição por ata", diagnosticoDistribuicao);
  logTable("itens da mestra sem vínculo em ata válida", itensSemVinculo);
  logTable("itens da mestra presentes em mais de uma ata válida", itensComMultiplasAtas);
  console.groupEnd();

  // Enriquecimento adicional de fornecedor (herda para contratos sem coluna própria).
  for (const r of resultados) {
    const nomeFinal = (r.ata.fornecedor?.nome || "").trim();
    const cnpjFinal = (r.ata.fornecedor?.cnpj || "").trim?.() || r.ata.fornecedor?.cnpj || "";
    if (nomeFinal || cnpjFinal) {
      for (const c of r.contratos) {
        if (!(c.fornecedor_nome || "").trim() && nomeFinal) c.fornecedor_nome = nomeFinal;
        if (!c.fornecedor_cnpj && cnpjFinal) c.fornecedor_cnpj = cnpjFinal;
      }
    }
  }

  // Payload compatível com sync_m2a_snapshot:
  // 1 item por VÍNCULO ata+ordem, não apenas a primeira ata por ordem.
  // O mesmo item mestre pode existir em atas/fornecedores diferentes; se o
  // snapshot colapsar por ordem, o front nunca encontra a ata correta da
  // empresa (ex.: item 42 em MF e também em GUIATELLI). Por isso o id_item é
  // sintético por ata+item_mestre.
  const itens = resultados
    .filter(({ ata }) => !ata.cancelada)
    .flatMap(({ ata, vinculos }) =>
      vinculos.map((v) => {
        const mestra = mapaMestraPorOrdem.get(String(v.ordem));
        if (!mestra) return null;
        const valorContratado = Number(v.valor_unitario_contratado) || 0;
        return {
          id_item: `${ata.id_ata}:${mestra.id_item_mestre}`,
          id_item_mestre: mestra.id_item_mestre,
          numero_item: mestra.ordem,
          descricao: v.descricao_linha || mestra.descricao,
          unidade: mestra.unidade,
          // Prefere o valor unitário CONTRATADO (subtabela da ata).
          // Cai para o estimado da tabela mestra apenas se o contratado não existir.
          valor_unitario: valorContratado > 0 ? valorContratado : mestra.valor_unitario,
          id_ata: ata.id_ata,
        };
      }),
    )
    .filter(Boolean)
    .sort((a, b) => {
      const ataCmp = String(a.id_ata).localeCompare(String(b.id_ata), "pt-BR", { numeric: true });
      if (ataCmp !== 0) return ataCmp;
      return (Number(a.numero_item) || 0) - (Number(b.numero_item) || 0);
    });

  const itensPayloadDiagnostico = itens.map((item) => {
    const mestra = mapaMestraPorOrdem.get(String(item.numero_item));
    const ata = atas.find((a) => a.id_ata === item.id_ata);
    return {
      ordem: item.numero_item,
      lote: mestra?.lote || "",
      id_item: item.id_item,
      id_item_mestre: item.id_item_mestre || mestra?.id_item_mestre || "",
      id_ata: item.id_ata,
      numero_ata: ata?.numero_ata || "",
      fornecedor: ata?.fornecedor?.nome || "",
      valor_unitario: item.valor_unitario,
      descricao: cleanTextValue(item.descricao).slice(0, 180),
    };
  });
  logTable(`processo ${processoId} / payload final de itens enviado ao app`, itensPayloadDiagnostico);

  const contratos = resultados.flatMap((r) => r.contratos);

  const resumo = {
    qtd_atas: atas.length,
    qtd_itens_mestre: itensMestre.length,
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
    encontrados: {
      itens_mestre: itensMestre.length,
      atas_validas: atas.length,
      itens_vinculados: itens.length,
      contratos: contratos.length,
    },
    diagnostico: {
      distribuicao_por_ata: diagnosticoDistribuicao,
      itens_sem_vinculo: itensSemVinculo,
      itens_com_multiplas_atas: itensComMultiplasAtas,
      itens_payload: itensPayloadDiagnostico,
    },
  });

  return {
    atas,
    itens,
    itens_mestre: itensMestre,
    contratos_existentes: contratos,
    resumo,
    trace,
  };
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
      const atas = await fetchAtasValidasDoProcesso(id, []);
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
      const contratos = await fetchContratosDaAta({ id_ata: ataId }, [], id);
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
