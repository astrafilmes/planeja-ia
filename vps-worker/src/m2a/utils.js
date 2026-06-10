// Helpers genéricos portados do automation_engine.js.
// Substituem DOMParser/CSS.escape por cheerio.

import * as cheerio from "cheerio";

const NUMERIC_ID = /^\d+$/;

export function isNumericId(value) {
  return typeof value === "string" && NUMERIC_ID.test(value);
}

export function assertNumericId(label, value, required = true) {
  if ((value === undefined || value === null || value === "") && !required)
    return;
  if (!isNumericId(String(value))) {
    throw new Error(
      `${label} inválido: esperado ID numérico da M2A, recebido "${value}".`,
    );
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatIsoDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

export function obterDiaUtilAnterior(dataISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataISO ?? ""))) {
    throw new Error(`Data inválida: ${dataISO}`);
  }
  const date = new Date(`${dataISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  const day = date.getUTCDay();
  if (day === 0) date.setUTCDate(date.getUTCDate() - 2);
  if (day === 6) date.setUTCDate(date.getUTCDate() - 1);
  return formatIsoDateUTC(date);
}

// ---------- decode AJAX (JSON com HTML escapado) ----------
function decodeEscapedHtmlString(value) {
  return String(value ?? "")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\\\/g, "\\");
}
function findHtmlLikeString(node) {
  if (typeof node === "string") {
    if (
      node.includes("<tr") ||
      node.includes("<table") ||
      node.includes("kt-datatable__row") ||
      node.includes("\\n<td")
    )
      return node;
    return null;
  }
  if (Array.isArray(node)) {
    for (const it of node) {
      const f = findHtmlLikeString(it);
      if (f) return f;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) {
      const f = findHtmlLikeString(v);
      if (f) return f;
    }
  }
  return null;
}
export function coerceHtmlPayload(rawText) {
  const text = String(rawText ?? "");
  try {
    const parsed = JSON.parse(text);
    const htmlStr = findHtmlLikeString(parsed);
    if (htmlStr) return decodeEscapedHtmlString(htmlStr);
  } catch {}
  if (text.includes('\\"') || text.includes("\\n<") || text.includes("\\u")) {
    const decoded = decodeEscapedHtmlString(text);
    if (/<(html|table|tbody|tr|td|input)\b/i.test(decoded)) return decoded;
  }
  return text;
}

export function loadDoc(rawText) {
  return cheerio.load(coerceHtmlPayload(rawText));
}

export function textOf($, el) {
  return ($(el).text() ?? "").replace(/\s+/g, " ").trim();
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

// ---------- diagnostics ----------
function pickFields($) {
  return $("input[name], select[name], textarea[name]")
    .toArray()
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      name: $(el).attr("name") || "",
      type: $(el).attr("type") || "",
      value: $(el).attr("value") || "",
      required: $(el).is("[required]"),
    }))
    .filter((f) => f.name && f.name !== "csrfmiddlewaretoken");
}

export function extractFormDiagnostics($) {
  const fields = pickFields($);
  const errors = $(
    ".errorlist, .invalid-feedback, .help-block, .alert-danger, .alert-error, .has-error, .text-danger",
  )
    .toArray()
    .map((el) => textOf($, el))
    .filter(Boolean);
  const alerts = $(".alert, .messages li, [role='alert']")
    .toArray()
    .map((el) => textOf($, el))
    .filter(Boolean);
  return { fields, errors: unique(errors), alerts: unique(alerts) };
}

function getRejectedMessages($) {
  const diagnostics = extractFormDiagnostics($);
  const rejectedMessages = unique([
    ...diagnostics.errors,
    ...diagnostics.alerts,
  ]).filter(
    (m) => !/sucesso|salv|inclu[ií]d|cadastrad/i.test(m),
  );
  return { diagnostics, rejectedMessages };
}

const IGNORABLE_INFORMATIVE =
  /não existe fiscal ativo|não existe gestor ativo|não existe preposto ativo|contrato ainda não foi publicado no pncp|existem \d+ alertas/i;

export function ensureOperationAccepted($, contexto) {
  const { rejectedMessages } = getRejectedMessages($);
  const blocking = rejectedMessages.filter(
    (m) => !IGNORABLE_INFORMATIVE.test(m),
  );
  if (blocking.length) {
    throw new Error(`M2A rejeitou ${contexto}: ${blocking.join(" | ")}`);
  }
}

export function throwIfFormRejected($, contexto) {
  const { rejectedMessages } = getRejectedMessages($);
  if (rejectedMessages.length) {
    throw new Error(
      `M2A rejeitou ${contexto}: ${rejectedMessages.join(" | ")}`,
    );
  }
}

export function ensureActorLinked($, actorLabel, expectedMissingAlert) {
  const { rejectedMessages } = getRejectedMessages($);
  const stillMissing = rejectedMessages.some((m) =>
    m.toLowerCase().includes(expectedMissingAlert.toLowerCase()),
  );
  if (stillMissing) {
    throw new Error(
      `M2A não confirmou o vínculo de ${actorLabel}: ${rejectedMessages.join(" | ")}`,
    );
  }
  const blocking = rejectedMessages.filter((m) => !IGNORABLE_INFORMATIVE.test(m));
  if (blocking.length) {
    throw new Error(
      `M2A rejeitou o vínculo de ${actorLabel}: ${blocking.join(" | ")}`,
    );
  }
}

export function fieldExists($, name) {
  return $(`[name="${name}"]`).length > 0;
}
export function pickField($, candidates, fallback) {
  return candidates.find((n) => fieldExists($, n)) ?? fallback;
}

// ---------- itens / contratos ----------
export function normalizeContratoNumero(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim()
    .toUpperCase();
}

export function normalizeItemNumero(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^\s*0*(\d+)(?:\D|$)/) || text.match(/0*(\d+)/);
  if (!match) return "";
  return String(Number(match[1]));
}

export function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d+)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

const DESCRIPTION_STOP_WORDS = new Set([
  "A","AS","AO","AOS","O","OS","DE","DA","DAS","DO","DOS","E","EM","NA","NAS",
  "NO","NOS","PARA","POR","COM","COR","CORES","TAM","TAMANHO","DIMENSOES",
  "ESPECIFICACAO","UNIDADE","MATERIAL","FABRICADO","FABRICADA",
]);

export function descriptionTokens(value) {
  return normalizeComparableText(value)
    .replace(/^\d+\s+/, "")
    .split(/\s+/)
    .filter((t) => {
      if (!t) return false;
      if (DESCRIPTION_STOP_WORDS.has(t)) return false;
      return t.length > 1 || /^\d+$/.test(t);
    });
}

export function descriptionScore(needleText, haystackText) {
  const needle = descriptionTokens(needleText);
  const haystack = new Set(descriptionTokens(haystackText));
  if (!needle.length || !haystack.size) return 0;
  let hits = 0;
  for (const t of needle) if (haystack.has(t)) hits += 1;
  return hits / needle.length;
}

export function normalizeAtaItemId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /^\d+$/.test(raw) ? raw : "";
}

export function formatQuantidadeM2A(value) {
  if (value === null || value === undefined || value === "") return "0,00";
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  const raw = String(value).trim();
  if (raw.includes(",")) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  return raw;
}

export function normalizeItensDesejados(itens) {
  return (itens ?? [])
    .map((item) => ({
      ...item,
      numero: normalizeItemNumero(item?.numero ?? item?.numero_item),
      descricao: String(item?.descricao ?? item?.especificacao ?? "").trim(),
      descricaoNorm: normalizeComparableText(
        item?.descricao ?? item?.especificacao ?? "",
      ),
      ataItemId: normalizeAtaItemId(
        item?.ata_item_id ??
          item?.m2a_ata_item_id ??
          item?.m2a_item_id ??
          item?.ataItemId,
      ),
      quantidade: formatQuantidadeM2A(item?.quantidade),
    }))
    .filter((item) => item.numero || item.descricaoNorm || item.ataItemId);
}
