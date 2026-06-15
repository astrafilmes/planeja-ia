// =====================================================================
// Fluxo de geração de IRP via API M2A (substitui importacao_planilha).
// 8 passos, todos no padrão do portal Django da M2A.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { loadDoc, sleep, formatQuantidadeM2A, normalizeComparableText } from "./utils.js";
import { resolverNaturezaId } from "./irp-naturezas.js";
import { resolverUnidadeId, nomeUnidadeNormalizado } from "./irp-unidades.js";

const URL_ITEM_TEMP = "/catalogo/itemtemporario/incluir/";
const URL_ITEM_JSON = (id) => `/catalogo/itempadronizado-json/${id}`;
const URL_SOLICITACAO_ITEM = (dfdId) =>
  `/gestao_compras/solicitacao_item/incluir/${dfdId}/`;
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
  const ufId =
    json?.unidade_fornecimento?.id ??
    json?.unidade_fornecimento ??
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
  const csrf = await getCsrfGlobal();
  const fd = new FormData();
  fd.append("csrfmiddlewaretoken", csrf);
  fd.append("item_padronizado", String(itemPadronizadoId));
  fd.append("item_padronizado_especificacao_text", String(especificacao || ""));
  fd.append("natureza_despesa", String(naturezaId));
  fd.append("unidade_fornecimento", String(unidadeFornecimentoId));
  fd.append("quantidade", formatQuantidadeM2A(quantidade));
  fd.append("padrao_descritivo_processo", "");
  fd.append("_salvar", "");

  const res = await m2a.postMultipart(URL_SOLICITACAO_ITEM(dfdId), fd, {
    headers: { Referer: `${m2a.http.defaults.baseURL || ""}/gestao_compras/formalizacao_demanda/${dfdId}/` },
  });
  if (res.status >= 400) {
    throw new Error(
      `incluirItemNaDFD: status ${res.status} item_padronizado=${itemPadronizadoId}`,
    );
  }
  ensureOkJson(res, "incluirItemNaDFD", String(itemPadronizadoId));
  return { ok: true };
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
// PASSO 4 — lê a tabela e extrai INTENCAO_IDs (com nome do órgão p/ matching)
// =====================================================================
export async function listarIntencoes(dfdId) {
  const res = await m2a.get(URL_TABELA_INTENCOES(dfdId));
  if (res.status >= 400) throw new Error(`listarIntencoes: status ${res.status}`);
  const $ = loadDoc(res.html);
  const linhas = $("tr.kt-datatable__row, tr.tr_intencao_registro_preco").toArray();
  const out = [];
  for (const tr of linhas) {
    const $tr = $(tr);
    // Procura o PRIMEIRO checkbox com value numérico real (ignora "selecionar todos" cujo value="on").
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
    const textoLinha = $tr.text().replace(/\s+/g, " ").trim();
    const orgaoAttr =
      $tr.attr("data-orgao") ||
      $tr.attr("data-orgao-id") ||
      $tr.find("[data-orgao-id]").first().attr("data-orgao-id") ||
      $tr.find("[data-orgao]").first().attr("data-orgao") ||
      null;
    out.push({
      intencaoId: String(id),
      orgaoIdHint: orgaoAttr ? String(orgaoAttr) : null,
      texto: textoLinha,
    });
  }

  console.log(
    `[irp-api] listarIntencoes dfd=${dfdId} encontrou ${out.length} intenções`,
  );
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
  const out = [];
  // cada linha tem um checkbox .checkboxintencao_registro_itens com value=ITEM_INTENCAO_ID
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    // Procura o PRIMEIRO checkbox com value numérico real (ignora "on" do master selector).
    let id = "";
    $tr
      .find("input.checkboxintencao_registro_itens, input.checkboxes, input[type=checkbox]")
      .each((_i, el) => {
        if (id) return;
        const v = $(el).attr("value") || "";
        if (isValidNumericId(v)) id = v;
      });
    if (!isValidNumericId(id)) return;
    const texto = $tr.text().replace(/\s+/g, " ").trim();
    out.push({ itemIntencaoId: String(id), texto });
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
  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("intencao_registro_preco", String(intencaoId));
  body.set("quantidade", formatQuantidadeM2A(quantidade));
  const res = await m2a.request(
    "POST",
    URL_ATUALIZAR_QTD_ITEM(itemIntencaoId),
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
      `atualizarQuantidadeItem(${itemIntencaoId}): status ${res.status}`,
    );
  }
  ensureOkJson(res, "atualizarQuantidadeItem", itemIntencaoId);
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
  if (dataISO) body.set("data_input", String(dataISO));
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

// =====================================================================
// Casa cada INTENCAO (extraída do HTML) com a secretaria do nosso catálogo
// usando m2a_orgao_id (preferencial), depois sigla/nome no texto da linha.
// =====================================================================
export function casarIntencoesComSecretarias(intencoes, secretariasParticipantes) {
  // intencoes: [{ intencaoId, orgaoIdHint, texto }]
  // secretariasParticipantes: [{ numero, sigla, nome, m2a_orgao_id }]
  const matches = [];
  const orfas = [];
  const usadas = new Set();
  for (const it of intencoes) {
    let sec = null;
    if (it.orgaoIdHint) {
      sec = secretariasParticipantes.find(
        (s) => String(s.m2a_orgao_id || "") === String(it.orgaoIdHint),
      );
    }
    if (!sec) {
      const txt = normalizeComparableText(it.texto);
      sec = secretariasParticipantes.find((s) => {
        if (usadas.has(s.numero)) return false;
        const nomeNorm = normalizeComparableText(s.nome);
        const siglaNorm = normalizeComparableText(s.sigla);
        return (
          (nomeNorm && txt.includes(nomeNorm)) ||
          (siglaNorm && txt.includes(` ${siglaNorm} `))
        );
      });
    }
    if (sec) {
      usadas.add(sec.numero);
      matches.push({ intencao: it, secretaria: sec });
    } else {
      orfas.push(it);
    }
  }
  return { matches, orfas };
}
