import * as cheerio from "cheerio";
import { coerceHtmlPayload } from "./utils.js";

export function normM2AText(value) {
  return String(value ?? "")
    .replace(/\(\s*\d{4}\s*\)/g, "")
    .replace(/^\d+\s*-\s*/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normFull(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

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

function meaningfulTokens(value) {
  return normM2AText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
}

function tokenEquivalente(a, b) {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function nomeCompatibilidadeScore(alvo, candidato) {
  const alvoTokens = meaningfulTokens(alvo);
  const candidatoTokens = meaningfulTokens(candidato);
  if (!alvoTokens.length || !candidatoTokens.length) return 0;
  const overlap = alvoTokens.filter((a) =>
    candidatoTokens.some((c) => tokenEquivalente(a, c)),
  ).length;
  return overlap / Math.max(Math.min(alvoTokens.length, candidatoTokens.length), 1);
}

function extractYear(value) {
  const match = String(value ?? "").match(/\((20\d{2})\)/);
  return match?.[1] ?? null;
}

function textOf($, el) {
  return $(el).text().replace(/\s+/g, " ").trim();
}

export function extrairNomeUgSelecionada($, unidadeGestoraId) {
  const option = $(`select[name="unidade_gestora"] option[value="${unidadeGestoraId}"]`).first();
  return option.length ? textOf($, option) : null;
}

export function montarPayloadInclusaoUg($, { csrf, data, unidadeGestoraId }) {
  const body = new URLSearchParams();
  const forms = $("form").toArray();
  const form =
    forms.find((el) =>
      $(el).find('[name="unidade_gestora"], [name="data"]').length,
    ) ?? forms[0];
  const root = form ? $(form) : $.root();

  root.find("input[name], select[name], textarea[name]").each((_, el) => {
    const field = $(el);
    if (field.is(":disabled")) return;
    const name = field.attr("name");
    if (!name) return;
    const tag = String(el.tagName ?? "").toLowerCase();
    const type = String(field.attr("type") ?? "").toLowerCase();

    if (type === "submit" || type === "button" || type === "image" || type === "file") {
      if (name === "_salvar") body.set(name, field.attr("value") ?? "");
      return;
    }

    if (type === "checkbox" || type === "radio") {
      if (field.is(":checked")) body.append(name, field.attr("value") ?? "on");
      return;
    }

    if (tag === "select") {
      const selected = field.find("option:selected");
      const option = selected.length ? selected.first() : field.find("option").first();
      body.set(name, option.attr("value") ?? "");
      return;
    }

    if (tag === "textarea") {
      body.set(name, field.text() ?? "");
      return;
    }

    body.set(name, field.attr("value") ?? "");
  });

  if (csrf) body.set("csrfmiddlewaretoken", csrf);
  body.set("data", String(data));
  body.set("unidade_gestora", String(unidadeGestoraId));
  root.find('input[name], select[name]').each((_, el) => {
    const field = $(el);
    const name = field.attr("name") || "";
    const nameNorm = normFull(name);
    if (!/(^|\s)(PADRAO|PADRAO UNIDADE GESTORA|PRINCIPAL)(\s|$)/.test(nameNorm)) return;
    if (field.is("select")) {
      const truthy = field
        .find("option")
        .toArray()
        .find((option) => /\b(sim|true|yes|1)\b/i.test(`${$(option).attr("value") ?? ""} ${textOf($, option)}`));
      if (truthy) body.set(name, $(truthy).attr("value") ?? "");
      return;
    }
    const type = String(field.attr("type") ?? "").toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "hidden") {
      body.set(name, field.attr("value") || "on");
    }
  });
  if (!body.has("padrao")) body.set("padrao", "on");
  if (!body.has("_salvar")) body.set("_salvar", "");
  return body;
}

export function parseUnidadesGestorasDetalheHtml(rawHtml) {
  const $ = cheerio.load(coerceHtmlPayload(rawHtml));
  const rows = [];
  $("tr").each((_, el) => {
    const cells = $(el)
      .find("td")
      .toArray()
      .map((td) => textOf($, td));
    if (cells.length < 4) return;
    const unidadeGestoraNome = cells[0];
    const dataInicio = cells[1] || null;
    const padraoText = cells[2] || "";
    const situacao = cells[3] || "";
    if (!unidadeGestoraNome || !/(\(20\d{2}\)|^\d+\s*-|SECRETARIA|GABINETE|FUNDO|PREFEITURA)/i.test(unidadeGestoraNome)) {
      return;
    }
    rows.push({
      unidadeGestoraNome,
      dataInicio,
      ano: extractYear(unidadeGestoraNome),
      padrao: /\bSim\b/i.test(padraoText),
      situacao,
      ativo: /\bAtivo\b/i.test(situacao) && !/\bInativo\b/i.test(situacao),
    });
  });
  return rows;
}

export function unidadeGestoraDetalheConfirmaInclusao(
  rows,
  { unidadeGestoraNome, nomeSecretaria, ano } = {},
) {
  const activeRows = rows.filter((row) => row.ativo);
  const anoAlvo = ano ? String(ano) : null;
  const targetFull = unidadeGestoraNome ? normFull(unidadeGestoraNome) : "";

  if (targetFull) {
    const exact = activeRows.find((row) => normFull(row.unidadeGestoraNome) === targetFull);
    if (exact) return { incluida: true, row: exact, motivo: "ug_exata_ativa" };
  }

  const secretariaNorm = nomeSecretaria ? normM2AText(nomeSecretaria) : "";
  if (!secretariaNorm) return { incluida: false, row: null, motivo: "sem_nome_alvo" };

  const compatible = activeRows.find((row) => {
    if (anoAlvo && row.ano && row.ano !== anoAlvo) return false;
    const rowNorm = normM2AText(row.unidadeGestoraNome);
    if (!rowNorm) return false;
    if (rowNorm === secretariaNorm) return true;
    if (rowNorm.includes(secretariaNorm) || secretariaNorm.includes(rowNorm)) return true;
    return nomeCompatibilidadeScore(secretariaNorm, rowNorm) >= 0.75;
  });

  return compatible
    ? { incluida: true, row: compatible, motivo: "ug_compativel_ativa" }
    : { incluida: false, row: null, motivo: "ug_nao_encontrada_no_detalhe" };
}
