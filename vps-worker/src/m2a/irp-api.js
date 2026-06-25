// =====================================================================
// Fluxo de geração de IRP via API M2A (substitui importacao_planilha).
// 8 passos, todos no padrão do portal Django da M2A.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { loadDoc, sleep, formatQuantidadeM2A } from "./utils.js";

// Sanitiza quantidade para o Django M2A.
// Regras:
//  - aceita number, "1.500" (ponto = milhar do Excel) ou "1500,5" (vírgula = decimal);
//  - inteiro vira string sem decimais ("1500");
//  - decimal vira string com vírgula ("1500,5");
//  - inválido/<0 → "0".
export function sanitizeQuantidadeM2A(value) {
  let n;
  if (typeof value === "number") {
    n = value;
  } else {
    const raw = String(value ?? "").trim();
    if (!raw) {
      n = 0;
    } else if (raw.includes(",")) {
      // formato BR: "1.500,75" → 1500.75
      n = Number(raw.replace(/\./g, "").replace(",", "."));
    } else if ((raw.match(/\./g) || []).length > 1) {
      // múltiplos pontos = separador de milhar ("1.500.000")
      n = Number(raw.replace(/\./g, ""));
    } else {
      n = Number(raw);
    }
  }
  if (!Number.isFinite(n) || n < 0) n = 0;
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}
// alias retrocompatível
const sanitizeQuantidadeDFD = sanitizeQuantidadeM2A;
import { resolverNaturezaId } from "./irp-naturezas.js";
import { resolverUnidadeId, nomeUnidadeNormalizado } from "./irp-unidades.js";

const URL_ITEM_TEMP = "/catalogo/itemtemporario/incluir/";
const URL_ITEM_JSON = (id) => `/catalogo/itempadronizado-json/${id}`;
const URL_SOLICITACAO_ITEM = (dfdId) =>
  `/gestao_compras/solicitacao_item/incluir/${dfdId}/`;
const URL_SOLICITACAO_ITEM_TABELA = (dfdId) =>
  `/gestao_compras/solicitacao_item/tabela/${dfdId}/?page_size=1000`;
const URL_GERAR_INTENCOES = (dfdId) =>
  `/gestao_compras/formalizacao_demanda/gerar_intencoes/${dfdId}/`;
const URL_TABELA_INTENCOES = (dfdId) =>
  `/gestao_compras/intencao_registro_preco/tabela_solicitacao/${dfdId}?page_size=1000`;
const URL_DISPONIBILIZAR = (id) =>
  `/gestao_compras/intencao_registro_preco/disponibilizar/${id}/?detail_solicitacao=true`;
const URL_MANIFESTAR = (id) =>
  `/gestao_compras/intencao_registro_preco/manifestar_interesse/${id}/?detail_solicitacao=true`;
const URL_ITENS_INTENCAO = (intencaoId) =>
  `/gestao_compras/intencao_registro_item/tabela/${intencaoId}/?page_size=1000`;
const URL_ATUALIZAR_QTD_ITEM = (itemIntencaoId) =>
  `/gestao_compras/intencao_registro_item/atualizar_quantidade/${itemIntencaoId}/`;
const URL_FINALIZAR_CONSOLIDACAO = (id) =>
  `/gestao_compras/intencao_registro_preco/finalizar_para_consolidacao/${id}/?detail_solicitacao=true`;
const URL_CONSOLIDAR = (id) =>
  `/gestao_compras/intencao_registro_preco/consolidar/${id}/`;
const URL_EDITAR_INTENCAO = (id) =>
  `/gestao_compras/intencao_registro_preco/atualizar/${id}/?detail=true`;




// Lê a página de edição da IRP e extrai os IDs canônicos do formulário.
// Retorna { orgaoId, unidadeId } como strings (ou null se ausentes).
export async function obterUnidadeOrcamentariaDaIntencao(intencaoId) {
  if (!isValidNumericId(String(intencaoId))) {
    throw new Error(
      `obterUnidadeOrcamentariaDaIntencao: intencaoId inválido "${intencaoId}".`,
    );
  }
  const res = await m2a.get(URL_EDITAR_INTENCAO(intencaoId));
  if (res.status >= 400) {
    throw new Error(
      `obterUnidadeOrcamentariaDaIntencao(${intencaoId}): status ${res.status}`,
    );
  }
  const $ = loadDoc(res.html);

  const pegarCampo = (name) => {
    // 1) <input> com value numérico (hidden ou não)
    let inpVal = null;
    $(`input[name="${name}"]`).each((_i, el) => {
      if (inpVal) return;
      const v = String($(el).attr("value") || "").trim();
      if (/^\d+$/.test(v)) inpVal = v;
    });
    if (inpVal) return inpVal;

    // 2) <select> com <option selected>
    const $sel = $(`select[name="${name}"]`);
    if ($sel.length) {
      let val = null;
      $sel.find("option").each((_i, el) => {
        if (val) return;
        const attrs = el.attribs || {};
        const isSel = attrs.selected !== undefined;
        if (!isSel) return;
        const v = String(attrs.value || "").trim();
        if (/^\d+$/.test(v)) val = v;
      });
      if (val) return val;

      // 3) Select2/AJAX: o portal pode renderizar apenas a opção atual.
      const numericos = $sel
        .find("option")
        .toArray()
        .map((el) => String((el.attribs || {}).value || "").trim())
        .filter((v) => /^\d+$/.test(v));
      if (numericos.length === 1) return numericos[0];
    }
    return null;
  };

  let unidadeId = pegarCampo("unidade_orcamentaria");
  let orgaoId = pegarCampo("orgao");

  // 4) Fallback regex no HTML cru (templates que populam via JS).
  if (!unidadeId) {
    const m = res.html.match(/name=["']unidade_orcamentaria["'][^>]*?value=["'](\d+)["']/i);
    if (m) unidadeId = m[1];
  }
  if (!orgaoId) {
    const m = res.html.match(/name=["']orgao["'][^>]*?value=["'](\d+)["']/i);
    if (m) orgaoId = m[1];
  }

  if (!unidadeId || !orgaoId) {
    const trechos = res.html.match(/name=["'](?:orgao|unidade_orcamentaria)["'][\s\S]{0,400}/gi) || [];
    console.warn(
      `[irp-api] obterUnidadeOrcamentariaDaIntencao(${intencaoId}) → orgao=${orgaoId || "?"} unidade=${unidadeId || "?"} (HTML não expôs IDs; trechos=${trechos.length})`,
    );
    if (trechos[0]) console.warn(`[irp-api]   trecho: ${trechos[0].replace(/\s+/g, " ").slice(0, 300)}`);
  } else {
    console.log(
      `[irp-api] obterUnidadeOrcamentariaDaIntencao(${intencaoId}) → orgao=${orgaoId} unidade=${unidadeId}`,
    );
  }
  return { orgaoId, unidadeId };
}

// página com CSRF "global" — qualquer página interna serve
const URL_DFD_LIST = "/gestao_compras/formalizacao_demanda/tabela/?page_size=10";

async function getCsrfGlobal() {
  return await m2a.getCsrf(URL_DFD_LIST, { force: false });
}

// Valida que o value de checkbox é um ID numérico real (não "on", não vazio).
function isValidNumericId(v) {
  return typeof v === "string" && /^\d+$/.test(v);
}

// Lê a resposta de um POST de formulário Django e detecta a "tela vermelha".
// Em sucesso o Django responde 302 → axios segue o redirect (status 200) e a
// página final NÃO contém .has-error/.alert-danger/.help-block (form-errors).
// Em falha, o Django re-renderiza a MESMA url do form com classes de erro
// preenchidas — é isso que detectamos aqui.
function detectDjangoFormErrors(html) {
  if (!html || typeof html !== "string") return [];
  // Acelera: só carrega Cheerio se houver marcador suspeito.
  if (
    !/has-error|alert-danger|errorlist|invalid-feedback|help-block|text-danger/i.test(
      html,
    )
  ) {
    return [];
  }
  const $ = loadDoc(html);
  const errs = [];
  $(".has-error, .form-group.has-error, .invalid-feedback, .errorlist li, .alert-danger, .alert.alert-error, .help-block.text-danger, span.text-danger, ul.errorlist li").each(
    (_i, el) => {
      const $el = $(el);
      const msg = ($el.text() || "").replace(/\s+/g, " ").trim();
      if (!msg) return;
      // ignora ruído informativo
      if (/sucesso|salv|inclu[ií]d|cadastrad/i.test(msg)) return;
      // tenta achar o label do campo
      let field = "";
      const $grp = $el.closest(".form-group, .field, .row");
      if ($grp.length) {
        field = ($grp.find("label").first().text() || "").replace(/\s+/g, " ").trim();
      }
      errs.push({ field: field || "?", message: msg });
    },
  );
  // dedup
  const seen = new Set();
  return errs.filter((e) => {
    const k = `${e.field}::${e.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ensureDjangoFormAccepted(res, contexto, extra = "") {
  if (res.status >= 300 && res.status < 400) return null;
  // 1) se for JSON e disser error, propaga (ex: cadastrar item temporário).
  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {}
  if (json) {
    const ok =
      json.ok === true ||
      json.success === true ||
      json.status === "ok" ||
      json.status === "success";
    if (!ok) {
      const msg =
        json.mensagem || json.message || json.msg || json.error || json.erro || JSON.stringify(json);
      throw new Error(`${contexto}${extra ? ` (${extra})` : ""}: ${msg}`);
    }
    return json;
  }
  // 2) HTTP error
  if (res.status >= 400) {
    throw new Error(`${contexto}${extra ? ` (${extra})` : ""}: HTTP ${res.status}`);
  }
  // 3) Django "200 OK + tela vermelha" — armadilha clássica
  const erros = detectDjangoFormErrors(res.html);
  if (erros.length) {
    for (const e of erros) {
      console.error(
        `[irp-api] M2A recusou ${contexto}${extra ? ` (${extra})` : ""} — campo="${e.field}" erro="${e.message}"`,
      );
    }
    const resumo = erros.map((e) => `${e.field}: ${e.message}`).join(" | ");
    throw new Error(
      `${contexto}${extra ? ` (${extra})` : ""}: M2A rejeitou o formulário → ${resumo}`,
    );
  }
  return null;
}

function extractIdsFromRows(html, selectors) {
  const $ = loadDoc(html);
  const ids = [];
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    let id = "";
    $tr.find(selectors).each((_i, el) => {
      if (id) return;
      const v = $(el).attr("value") || "";
      if (isValidNumericId(v)) id = v;
    });
    if (!id) {
      const m = ($tr.attr("id") || "").match(/(\d+)$/);
      if (m && isValidNumericId(m[1])) id = m[1];
    }
    if (id) ids.push(id);
  });
  return [...new Set(ids)];
}

function ensureOkJson(res, contexto, arquivo = "") {
  return ensureDjangoFormAccepted(res, contexto, arquivo);
}


// =====================================================================
// PASSO 1 — cadastra item temporário no catálogo
// =====================================================================
export async function cadastrarItemTemporario({
  descricao,
  especificacao,
  unidade,
  natureza,
}) {
  const naturezaId = resolverNaturezaId(natureza);
  if (!naturezaId) {
    throw new Error(
      `Natureza "${natureza}" não está mapeada em irp-naturezas.js`,
    );
  }
  const unidadeId = resolverUnidadeId(unidade);
  if (!unidadeId) {
    throw new Error(
      `Unidade "${unidade}" (normalizada: "${nomeUnidadeNormalizado(unidade)}") não está mapeada em irp-unidades.js`,
    );
  }

  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("descricao", String(descricao || "").trim().toUpperCase());
  body.set("especificacao", String(especificacao || "").trim());
  body.set("unidade", unidadeId);
  body.set("natureza_despesa", naturezaId);

  const res = await m2a.request("POST", URL_ITEM_TEMP, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}${URL_ITEM_TEMP}`,
    },
  });

  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {
    /* */
  }
  const itemPadronizadoId =
    json?.item_padronizado_id ?? json?.item_padronizado ?? json?.id ?? null;
  if (!itemPadronizadoId) {
    throw new Error(
      `cadastrarItemTemporario: portal não retornou item_padronizado_id (resp=${String(res.html || "").slice(0, 300)})`,
    );
  }
  console.log(
    `[irp-api] item temporário criado: id=${itemPadronizadoId} descr="${descricao.slice(0, 60)}"`,
  );
  return {
    itemPadronizadoId: String(itemPadronizadoId),
    naturezaId,
    unidadeId,
  };
}

// =====================================================================
// PASSO 2 (helper) — pega unidade_fornecimento_id do item padronizado
// =====================================================================
export async function obterUnidadeFornecimento(itemPadronizadoId) {
  const res = await m2a.get(URL_ITEM_JSON(itemPadronizadoId));
  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {
    throw new Error(
      `obterUnidadeFornecimento: resposta não-JSON (${res.html.slice(0, 200)})`,
    );
  }
  // o portal devolve { unidade_fornecimento: { id: 92797, ... } } ou
  // {unidades_fornecimento: [{id, ...}]} — cobrimos os dois.
  // A Bíblia da M2A define a forma canônica: unidade_fornecimento[0].id (array).
  // Mantemos fallbacks defensivos para outras formas já vistas em produção.
  const ufId =
    json?.unidade_fornecimento?.[0]?.id ??
    json?.unidade_fornecimento?.id ??
    (typeof json?.unidade_fornecimento === "number" || typeof json?.unidade_fornecimento === "string"
      ? json.unidade_fornecimento
      : null) ??
    json?.unidades_fornecimento?.[0]?.id ??
    json?.id_unidade_fornecimento ??
    null;
  if (!ufId) {
    throw new Error(
      `obterUnidadeFornecimento: id ausente no JSON (${JSON.stringify(json).slice(0, 300)})`,
    );
  }
  return String(ufId);
}

// =====================================================================
// PASSO 2 — adiciona item na DFD (Solicitação) da Gerenciadora
// =====================================================================
export async function incluirItemNaDFD({
  dfdId,
  itemPadronizadoId,
  unidadeFornecimentoId,
  naturezaId,
  especificacao,
  quantidade,
}) {
  const beforeIds = await listarItensDFD(dfdId).catch((err) => {
    console.warn(`[irp-api] não consegui listar itens da DFD antes do POST: ${err?.message ?? err}`);
    return [];
  });
  const csrf = await m2a.getCsrf(URL_SOLICITACAO_ITEM(dfdId), { force: true });
  const fd = new FormData();
  fd.append("csrfmiddlewaretoken", csrf);
  fd.append("item_padronizado", String(itemPadronizadoId));
  fd.append("item_padronizado_especificacao_text", String(especificacao || ""));
  fd.append("natureza_despesa", String(naturezaId));
  fd.append("unidade_fornecimento", String(unidadeFornecimentoId));
  const qtyStr = sanitizeQuantidadeDFD(quantidade);
  fd.append("quantidade", qtyStr);
  fd.append("padrao_descritivo_processo", "");
  fd.append("_salvar", "");

  const res = await m2a.postMultipart(URL_SOLICITACAO_ITEM(dfdId), fd, {
    ajax: false,
    maxRedirects: 0,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Origin: m2a.http.defaults.baseURL || "",
      Referer: `${m2a.http.defaults.baseURL || ""}${URL_SOLICITACAO_ITEM(dfdId)}`,
    },
  });
  if (res.status >= 400) {
    throw new Error(
      `incluirItemNaDFD: status ${res.status} item_padronizado=${itemPadronizadoId}`,
    );
  }
  try {
    ensureOkJson(res, "incluirItemNaDFD", String(itemPadronizadoId));
  } catch (err) {
    const msg = String(err?.message ?? err);
    // Item já existe na DFD: tratamos como sucesso idempotente.
    if (/já existe um item com o mesmo produto\/serviço/i.test(msg)) {
      console.warn(
        `[irp-api] item ${itemPadronizadoId} já presente na DFD ${dfdId} — tratado como sucesso (idempotente).`,
      );
      return { ok: true, duplicate: true };
    }
    throw err;
  }
  const afterIds = await listarItensDFD(dfdId);
  const before = new Set(beforeIds.map(String));
  const created = afterIds.filter((id) => !before.has(String(id)));
  if (!created.length && afterIds.length <= beforeIds.length) {
    throw new Error(
      `incluirItemNaDFD (${itemPadronizadoId}): M2A aceitou o POST, mas o item não apareceu na tabela da DFD ${dfdId}.`,
    );
  }
  console.log(
    `[irp-api] item ${itemPadronizadoId} vinculado à DFD ${dfdId}; itens antes=${beforeIds.length} depois=${afterIds.length}`,
  );
  return { ok: true };
}

export async function listarItensDFD(dfdId) {
  const res = await m2a.get(URL_SOLICITACAO_ITEM_TABELA(dfdId));
  if (res.status >= 400) throw new Error(`listarItensDFD(${dfdId}): status ${res.status}`);
  const ids = extractIdsFromRows(
    res.html,
    "input.checkboxsolicitacao_item, input.checkbox-solicitacao-item, input.checkboxes, input[type=checkbox]",
  );
  console.log(`[irp-api] listarItensDFD(${dfdId}) → ${ids.length} itens`);
  return ids;
}

// =====================================================================
// PASSO 3 — dispara geração das intenções para todas as participantes
// =====================================================================
export async function gerarIntencoes(dfdId) {
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  const res = await m2a.request("POST", URL_GERAR_INTENCOES(dfdId), {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (res.status >= 400) throw new Error(`gerarIntencoes: status ${res.status}`);
  ensureOkJson(res, "gerarIntencoes");
  return { ok: true };
}

// =====================================================================
// PASSO 4 — lê a tabela e extrai apenas os INTENCAO_IDs numéricos.
// A identificação da Unidade Orçamentária é feita depois, abrindo a
// página de edição de cada IRP (obterUnidadeOrcamentariaDaIntencao),
// onde o portal expõe os IDs canônicos do Django (orgao + unidade_orcamentaria).
// =====================================================================
export async function listarIntencoes(dfdId) {
  const res = await m2a.get(URL_TABELA_INTENCOES(dfdId));
  if (res.status >= 400) throw new Error(`listarIntencoes: status ${res.status}`);
  const $ = loadDoc(res.html);
  const linhas = $("tr.tr_intencao_registro_preco, tr.kt-datatable__row").toArray();
  const out = [];
  for (const tr of linhas) {
    const $tr = $(tr);
    let id = "";
    $tr
      .find("input.checkboxes, input.checkbox-intencao, input[type=checkbox]")
      .each((_i, el) => {
        if (id) return;
        const v = $(el).attr("value") || "";
        if (isValidNumericId(v)) id = v;
      });
    if (!id) {
      const m = ($tr.attr("id") || "").match(/(\d+)$/);
      if (m && isValidNumericId(m[1])) id = m[1];
    }
    if (!isValidNumericId(id)) continue;
    out.push({ intencaoId: String(id) });
  }
  console.log(`[irp-api] listarIntencoes dfd=${dfdId} → ${out.length} intenções`);
  return out;
}


// =====================================================================
// PASSO 5.1 — disponibilizar
// =====================================================================
export async function disponibilizarIntencao(intencaoId) {
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  body.set("detail_solicitacao", "true");
  const res = await m2a.request("POST", URL_DISPONIBILIZAR(intencaoId), {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (res.status >= 400) throw new Error(`disponibilizarIntencao(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "disponibilizarIntencao", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 5.2 — manifestar interesse
// =====================================================================
export async function manifestarInteresse(intencaoId, dataISO) {
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  body.set("detail_solicitacao", "true");
  body.set("data_input", String(dataISO));
  const res = await m2a.request("POST", URL_MANIFESTAR(intencaoId), {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (res.status >= 400) throw new Error(`manifestarInteresse(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "manifestarInteresse", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 6 — lista itens da intenção (ITEM_INTENCAO_IDs)
// =====================================================================
export async function listarItensIntencao(intencaoId) {
  const res = await m2a.get(URL_ITENS_INTENCAO(intencaoId));
  if (res.status >= 400) throw new Error(`listarItensIntencao(${intencaoId}): status ${res.status}`);
  const $ = loadDoc(res.html);
  const ids = extractIdsFromRows(
    res.html,
    "input.checkboxintencao_registro_itens, input.checkboxes, input[type=checkbox]",
  );
  const out = ids.map((id) => {
    const $row = $(`input[value="${id}"]`).first().closest("tr");
    return {
      itemIntencaoId: String(id),
      texto: $row.text().replace(/\s+/g, " ").trim(),
    };
  });
  console.log(
    `[irp-api] listarItensIntencao(${intencaoId}) → ${out.length} itens (ids válidos)`,
  );
  return out;
}


// =====================================================================
// PASSO 7 — atualiza a quantidade que esta participante quer daquele item
// =====================================================================
export async function atualizarQuantidadeItem({
  itemIntencaoId,
  intencaoId,
  quantidade,
}) {
  // Trava extra contra IDs contaminados ("on") chegando aqui.
  if (!isValidNumericId(String(itemIntencaoId))) {
    throw new Error(
      `atualizarQuantidadeItem: itemIntencaoId inválido "${itemIntencaoId}" (esperado numérico).`,
    );
  }
  if (!isValidNumericId(String(intencaoId))) {
    throw new Error(
      `atualizarQuantidadeItem: intencaoId inválido "${intencaoId}" (esperado numérico).`,
    );
  }
  const csrf = await getCsrfGlobal();
  const qtyStr = sanitizeQuantidadeM2A(quantidade);
  // Bíblia M2A: application/x-www-form-urlencoded, sem _salvar.
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("intencao_registro_preco", String(intencaoId));
  body.set("quantidade", qtyStr);
  const res = await m2a.request("POST", URL_ATUALIZAR_QTD_ITEM(itemIntencaoId), {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}/gestao_compras/intencao_registro_preco/${intencaoId}/`,
    },
  });
  if (res.status >= 400) {
    throw new Error(
      `atualizarQuantidadeItem(${itemIntencaoId}): status ${res.status}`,
    );
  }
  ensureOkJson(res, "atualizarQuantidadeItem", `item=${itemIntencaoId} qty=${qtyStr}`);
  return { ok: true };
}


// =====================================================================
// PASSO 8.1 — finalizar para consolidação
// =====================================================================
export async function finalizarParaConsolidacao(intencaoId, dataISO) {
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  body.set("detail_solicitacao", "true");
  body.set("data_input", String(dataISO));
  const res = await m2a.request(
    "POST",
    URL_FINALIZAR_CONSOLIDACAO(intencaoId),
    {
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
  );
  if (res.status >= 400) {
    throw new Error(
      `finalizarParaConsolidacao(${intencaoId}): status ${res.status}`,
    );
  }
  ensureOkJson(res, "finalizarParaConsolidacao", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 8.2 — consolidar oficialmente
// =====================================================================
export async function consolidarIntencao(intencaoId, dataISO) {
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  // Bíblia M2A: consolidar não recebe data_input (só csrf + text=true).
  const res = await m2a.request("POST", URL_CONSOLIDAR(intencaoId), {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (res.status >= 400) throw new Error(`consolidarIntencao(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "consolidarIntencao", intencaoId);
  return { ok: true };
}

// =====================================================================
// Macro: cria 1 item completo no catálogo + insere na DFD da gerenciadora
// =====================================================================
export async function criarItemEAdicionarNaDFD({
  dfdGerenciadoraId,
  descricao,
  especificacao,
  natureza,
  unidade,
  quantidadeGerenciadora,
}) {
  const { itemPadronizadoId, naturezaId } = await cadastrarItemTemporario({
    descricao,
    especificacao,
    unidade,
    natureza,
  });
  await sleep(300);
  const ufId = await obterUnidadeFornecimento(itemPadronizadoId);
  await sleep(200);
  await incluirItemNaDFD({
    dfdId: dfdGerenciadoraId,
    itemPadronizadoId,
    unidadeFornecimentoId: ufId,
    naturezaId,
    especificacao,
    quantidade: quantidadeGerenciadora ?? 0,
  });
  return { itemPadronizadoId, naturezaId, unidadeFornecimentoId: ufId };
}

