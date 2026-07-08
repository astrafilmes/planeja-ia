// Port de processarContratoCompleto / submódulos do automation_engine.js.
import { m2a } from "../m2a-client.js";
import {
  assertNumericId, isNumericId, sleep, loadDoc, textOf, unique,
  ensureOperationAccepted, throwIfFormRejected, ensureActorLinked,
  extractFormDiagnostics, pickField,
  normalizeContratoNumero, normalizeItemNumero, normalizeComparableText,
  normalizeItensDesejados, descriptionScore, obterDiaUtilAnterior,
} from "./utils.js";

const CONTRACT_CREATE_SETTLE_MS = 600;
const ADD_ITEMS_SETTLE_MS = 350;
const ITEM_POST_PAUSE_MS = 75;
const DOC_GENERATE_SETTLE_MS = 700;
const DOC_POST_PAUSE_MS = 75;

// --- helpers locais ---
function shortLogText(value, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function logTable(label, rows, limit = 500) {
  const list = Array.isArray(rows) ? rows : [];
  console.log(`[m2a-contrato] ${label}: ${list.length} registro(s)`);
  if (!list.length) return;
  console.table(list.slice(0, limit));
  if (list.length > limit) {
    console.log(`[m2a-contrato] ${label}: ${list.length - limit} registro(s) omitidos`);
  }
}

function extractContratoIdFromHref(href) {
  return href?.match(/\/contratos\/(\d+)\/?/)?.[1] ?? null;
}

function extractContratoLinks($) {
  return $("a[href*='/contratos/']")
    .toArray()
    .map((a) => {
      const href = $(a).attr("href") || "";
      return {
        href,
        id: extractContratoIdFromHref(href),
        text: textOf($, a),
        rowText: textOf($, $(a).closest("tr")),
      };
    });
}

function extractProcessoIdFromUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/\/processo_administrativo\/(\d+)\/?/)?.[1] ?? "";
}

function processoIdFromContratoRow($, link) {
  const href = $(link).closest("tr").find('a[href*="/processo_administrativo/"]').first().attr("href") || "";
  return extractProcessoIdFromUrl(href);
}

function extractContratoIdFromDoc($, numeroBuscado, processoId = "") {
  const numeroNorm = normalizeContratoNumero(numeroBuscado);
  const expectedProcessoId = extractProcessoIdFromUrl(processoId);
  const links = extractContratoLinks($).filter((l) => {
    if (!expectedProcessoId) return true;
    const rowProcessoId = processoIdFromContratoRow($, l.href ? $(`a[href="${l.href}"]`).first() : null);
    return rowProcessoId === expectedProcessoId;
  });
  const exact = links.find((l) => normalizeContratoNumero(l.text) === numeroNorm);
  if (exact) return exact.id;
  const rowMatch = links.find((l) =>
    normalizeContratoNumero(l.rowText).includes(numeroNorm),
  );
  return rowMatch?.id ?? null;
}

function extractContratoIdFromHtml(html, numeroBuscado, processoId = "") {
  return extractContratoIdFromDoc(loadDoc(html), numeroBuscado, processoId);
}

function findContratoTableLinksInDoc($, ataId) {
  return unique(
    $("a[href]")
      .toArray()
      .map((a) => $(a).attr("href"))
      .filter((href) => {
        const v = href || "";
        return (
          v.includes("contrato") &&
          (v.includes(String(ataId)) ||
            v.includes("tabela_contratos") ||
            v.includes("contratos/tabela"))
        );
      }),
  );
}

async function discoverContratoTableUrls(ataId, m2aProcessoUrl) {
  const candidates = [
    `/ata_registro_precos/tabela_contratos/${ataId}?page_size=1000`,
    `/ata_registro_precos/${ataId}/contratos/?page_size=1000`,
    `/ata_registro_precos/${ataId}/contratos/tabela/?page_size=1000`,
    `/contratos/tabela/${ataId}/?page_size=1000`,
  ];
  if (m2aProcessoUrl) {
    try {
      const r = await m2a.get(m2aProcessoUrl);
      const discovered = findContratoTableLinksInDoc(loadDoc(r.html), ataId);
      if (discovered.length) candidates.unshift(...discovered);
    } catch {}
  }
  return unique(candidates);
}

function canonicalContratoTableUrl(ataId) {
  return `/ata_registro_precos/tabela_contratos/${ataId}?page_size=1000`;
}

export async function buscarIdContratoPorNumero(
  ataId, numeroBuscado, m2aProcessoUrl, options = {},
) {
  const deepSearch = options.deepSearch ?? false;
  const expectedProcessoId = options.processoId ?? extractProcessoIdFromUrl(m2aProcessoUrl);
  const urls = deepSearch
    ? await discoverContratoTableUrls(ataId, m2aProcessoUrl)
    : [canonicalContratoTableUrl(ataId)];
  const errors = [];
  for (const url of urls) {
    try {
      const r = await m2a.get(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
      const id = extractContratoIdFromDoc(loadDoc(r.html), numeroBuscado, expectedProcessoId);
      if (id) return id;
      errors.push(`${url}: tabela respondeu, contrato não apareceu`);
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }
  throw new Error(
    `Não foi possível localizar o contrato '${numeroBuscado}' na Ata ${ataId}. Tentativas: ${errors.join(" | ")}`,
  );
}

// --- Módulo 1: criar cabeçalho ---
export async function criarCabecalhoContrato(ataId, dados) {
  const url = `/ata_registro_precos/criar_contrato/${ataId}`;
  const formPage = await m2a.get(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  const $form = loadDoc(formPage.html);
  const csrf = $form('input[name="csrfmiddlewaretoken"]').attr("value");
  if (!csrf) throw new Error(`CSRF ausente em ${url}`);

  const numeroField = pickField($form, ["numero", "numero_contrato", "num_contrato", "contrato"], "numero");
  const objetoField = pickField($form, ["objeto", "descricao", "objeto_contrato"], "objeto");
  const dataField = pickField($form, ["data_contrato", "data", "data_assinatura"], "data_contrato");
  const dataFimField = pickField($form, ["data_fim", "vigencia_fim", "data_termino"], "data_fim");
  const unidadeField = pickField($form, ["unidade_gestora", "unidade", "orgao"], "unidade_gestora");

  const payload = {
    csrfmiddlewaretoken: csrf,
    [numeroField]: dados.numero,
    [objetoField]: dados.objeto,
    [dataField]: dados.data,
    [dataFimField]: dados.data_fim || "",
    [unidadeField]: dados.unidade_gestora,
    _salvar: "",
  };

  const r = await m2a.postForm(url, payload);
  const $r = loadDoc(r.html);
  const contratoId =
    extractContratoIdFromHref(r.finalUrl) ||
    extractContratoIdFromHtml(r.html, dados.numero);
  if (!contratoId) throwIfFormRejected($r, "criação do contrato");
  await sleep(CONTRACT_CREATE_SETTLE_MS);
  return { ok: r.status < 400, contratoId, finalUrl: r.finalUrl };
}

// --- Módulo 3: atores ---
export async function vincularFiscal(contratoId, fiscalId, dataBatch) {
  const url = `/contratos/fiscais/incluir/${contratoId}/`;
  const csrf = await m2a.getCsrf(url);
  const r = await m2a.postForm(url, {
    csrfmiddlewaretoken: csrf,
    tipo: "1",
    data_nomeacao: dataBatch,
    servidor: fiscalId,
    ativo: "on",
    _salvar: "",
  });
  ensureActorLinked(loadDoc(r.html), "fiscal", "não existe fiscal ativo");
}

export async function vincularGestor(contratoId, gestorId, dataBatch) {
  const url = `/contratos/gestores/incluir/${contratoId}/`;
  const csrf = await m2a.getCsrf(url);
  const r = await m2a.postForm(url, {
    csrfmiddlewaretoken: csrf,
    data_nomeacao: dataBatch,
    servidor: gestorId,
    ativo: "on",
    _salvar: "",
  });
  ensureActorLinked(loadDoc(r.html), "gestor", "não existe gestor ativo");
}

export async function vincularPreposto(contratoId, nomePreposto, dataBatch, prepostoIdInformado) {
  let prepostoId = prepostoIdInformado;
  if (!prepostoId) {
    const searchUrl = `/pessoa/pessoa-fisica-autocomplete/?is_entidade=False&query=${encodeURIComponent(nomePreposto)}`;
    const search = await m2a.get(searchUrl, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,*/*" },
    });
    let json;
    try { json = JSON.parse(search.html); } catch {
      throw new Error(`Resposta de autocomplete inválida para preposto '${nomePreposto}'.`);
    }
    if (!json.suggestions?.length) {
      throw new Error(`Preposto '${nomePreposto}' não encontrado via autocomplete da M2A.`);
    }
    prepostoId = json.suggestions[0].id;
  }
  const url = `/contratos/prepostos/incluir/${contratoId}/`;
  const csrf = await m2a.getCsrf(url);
  const r = await m2a.postForm(url, {
    csrfmiddlewaretoken: csrf,
    data_nomeacao: dataBatch,
    pessoa_fisica: prepostoId,
    ativo: "on",
    _salvar: "",
  });
  ensureActorLinked(loadDoc(r.html), "preposto", "não existe preposto ativo");
}

// --- Módulo 4: adicionar itens ---
function findItemDescriptionCell($, tr) {
  const cells = $(tr).find("td").toArray();
  return (
    cells.find((c) => /^\s*\d+\s*[-–.]/.test(textOf($, c))) ||
    cells.find((c) => /\b\d+\s*[-–.]\s*\S/.test(textOf($, c))) ||
    cells[0]
  );
}

function scrapeItensDisponiveis($) {
  const rows = $(
    "tr.kt-datatable__row.tr_unidade_participante_item_contrato, tr.tr_unidade_participante_item_contrato",
  ).toArray();
  return rows
    .map((row) => {
      const checkbox = $(row).find(
        "input.check-box-arp-item-contrato[type='checkbox'], input.check-box-arp-item-contrato, input[type='checkbox'][value]",
      ).first();
      const descricao = textOf($, findItemDescriptionCell($, row));
      return {
        ataItemId: checkbox.attr("value") || "",
        numero: normalizeItemNumero(descricao),
        descricao,
        descricaoNorm: normalizeComparableText(descricao),
      };
    })
    .filter((it) => it.ataItemId && (it.numero || it.descricaoNorm));
}

function findDisponivelForDesejado(desejado, disponiveis, used, preferDescription) {
  const by = (pred) => disponiveis.find((it) => !used.has(it.ataItemId) && pred(it));

  if (desejado.ataItemId) {
    const m = by((it) => it.ataItemId === desejado.ataItemId);
    if (m) return m;
  }
  const tryDesc = () => {
    if (!desejado.descricaoNorm) return null;
    const exato = by((it) => it.descricaoNorm === desejado.descricaoNorm);
    if (exato) return exato;
    const contem = by(
      (it) =>
        it.descricaoNorm.includes(desejado.descricaoNorm) ||
        desejado.descricaoNorm.includes(it.descricaoNorm),
    );
    if (contem) return contem;
    const scored = disponiveis
      .filter((it) => !used.has(it.ataItemId))
      .map((it) => ({ it, score: descriptionScore(it.descricao, desejado.descricao) }))
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score >= 0.6) return scored[0].it;
    return null;
  };
  const tryNum = () => desejado.numero ? by((it) => it.numero === desejado.numero) : null;
  if (preferDescription) return tryDesc() || tryNum();
  return tryNum() || tryDesc();
}

export async function adicionarItensAoContrato(contratoId, itensDesejados) {
  const itens = normalizeItensDesejados(itensDesejados);
  if (!itens.length) return { adicionados: 0 };

  console.group(`[m2a-contrato] contrato ${contratoId} / módulo 4 adicionar itens`);
  logTable(
    "itens desejados recebidos do app",
    itens.map((item) => ({
      numero: item.numero,
      ataItemId: item.ataItemId,
      quantidade: item.quantidade,
      descricao: shortLogText(item.descricao, 180),
    })),
  );

  const tabelaUrl = `/contratos/ata_registro_preco_contrato/tabela/${contratoId}/?page_size=1000`;
  const tabela = await m2a.get(tabelaUrl, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  const $tab = loadDoc(tabela.html);
  const disponiveis = scrapeItensDisponiveis($tab);
  logTable(
    "itens disponíveis na tabela M2A para adicionar",
    disponiveis.map((item) => ({
      ataItemId: item.ataItemId,
      numero: item.numero,
      descricao: shortLogText(item.descricao, 180),
    })),
  );
  const numerosDisp = new Set(disponiveis.map((it) => it.numero));
  const comNumero = itens.filter((it) => it.numero);
  const hits = comNumero.filter((it) => numerosDisp.has(it.numero)).length;
  const preferDescription = comNumero.length ? hits / comNumero.length < 0.8 : false;
  console.log("[m2a-contrato] estratégia de matching:", {
    contratoId,
    totalDesejados: itens.length,
    totalDisponiveis: disponiveis.length,
    itensComNumero: comNumero.length,
    hitsPorNumero: hits,
    preferDescription,
  });

  const used = new Set();
  const matches = itens.map((item) => {
    const d = findDisponivelForDesejado(item, disponiveis, used, preferDescription);
    if (d) used.add(d.ataItemId);
    return { desejado: item, disponivel: d };
  });
  logTable(
    "resultado desejado → disponível",
    matches.map((m) => ({
      desejado_numero: m.desejado.numero,
      desejado_ataItemId: m.desejado.ataItemId,
      desejado_desc: shortLogText(m.desejado.descricao, 120),
      disponivel: !!m.disponivel,
      disponivel_ataItemId: m.disponivel?.ataItemId ?? "",
      disponivel_numero: m.disponivel?.numero ?? "",
      disponivel_desc: shortLogText(m.disponivel?.descricao, 120),
    })),
  );
  const avisos = [];
  const encontrados = matches.filter((m) => m.disponivel);
  const ausentes = matches.filter((m) => !m.disponivel).map((m) => m.desejado);
  for (const it of ausentes) {
    avisos.push(
      `Item pulado (não localizado na Ata): ${it.numero || it.descricao || "sem-ref"}`,
    );
  }
  const itemIds = encontrados.map((m) => m.disponivel.ataItemId).join(" ");
  if (!itemIds) {
    console.warn("[m2a-contrato] nenhum item disponível encontrado para adicionar", { avisos });
    console.groupEnd();
    return { adicionados: 0, avisos };
  }
  console.log("[m2a-contrato] ids enviados para /contratos/adicionar_item_ata:", itemIds);

  const csrf =
    $tab('input[name="csrfmiddlewaretoken"]').attr("value") ||
    (await m2a.getCsrf(`/contratos/${contratoId}/`));

  const r = await m2a.postForm(`/contratos/adicionar_item_ata/${contratoId}/`, {
    csrfmiddlewaretoken: csrf,
    itens_unidade_participante: itemIds,
  });
  ensureOperationAccepted(loadDoc(r.html), "adição de itens ao contrato");
  await sleep(ADD_ITEMS_SETTLE_MS);
  console.log("[m2a-contrato] itens adicionados:", encontrados.length, { avisos });
  console.groupEnd();
  return { adicionados: encontrados.length, avisos };
}

// --- Módulo 5: quantidades ---
function scrapeContratoItens($) {
  const rows = $("tr.kt-datatable__row.tr_contrato_item, tr.tr_contrato_item").toArray();
  return rows
    .map((row) => {
      const rowId = $(row).attr("id") || "";
      const contratoItemId =
        rowId.match(/^tr_(\d+)$/)?.[1] ||
        $(row).find("[data-id]").attr("data-id") || "";
      const descricao = textOf($, findItemDescriptionCell($, row));
      return {
        contratoItemId,
        numero: normalizeItemNumero(descricao),
        descricao,
        descricaoNorm: normalizeComparableText(descricao),
      };
    })
    .filter((it) => it.contratoItemId && (it.numero || it.descricao));
}

export async function atualizarQuantidadesItens(contratoId, itensDesejados) {
  const itens = normalizeItensDesejados(itensDesejados);
  if (!itens.length) return { atualizados: 0 };

  console.group(`[m2a-contrato] contrato ${contratoId} / módulo 5 atualizar quantidades`);
  logTable(
    "quantidades desejadas recebidas do app",
    itens.map((item) => ({
      numero: item.numero,
      ataItemId: item.ataItemId,
      quantidade: item.quantidade,
      descricao: shortLogText(item.descricao, 180),
    })),
  );

  const tabela = await m2a.get(
    `/contratos/itens/tabela/${contratoId}/?page_size=1000`,
    { headers: { "X-Requested-With": "XMLHttpRequest" } },
  );
  const itensContrato = scrapeContratoItens(loadDoc(tabela.html));
  logTable(
    "itens já presentes no contrato M2A",
    itensContrato.map((item) => ({
      contratoItemId: item.contratoItemId,
      numero: item.numero,
      descricao: shortLogText(item.descricao, 180),
    })),
  );
  const numerosContrato = new Set(itensContrato.map((it) => it.numero));
  const comNumero = itens.filter((it) => it.numero);
  const hits = comNumero.filter((it) => numerosContrato.has(it.numero)).length;
  const preferDescription = comNumero.length ? hits / comNumero.length < 0.8 : false;
  const pool = itensContrato.map((it) => ({ ...it, ataItemId: it.contratoItemId }));
  const used = new Set();
  const matches = itens.map((item) => {
    const enc = findDisponivelForDesejado(item, pool, used, preferDescription);
    if (enc) used.add(enc.ataItemId);
    return { desejado: item, encontrado: enc ? { ...enc, contratoItemId: enc.ataItemId } : null };
  });
  console.log("[m2a-contrato] estratégia de matching de quantidades:", {
    contratoId,
    totalDesejados: itens.length,
    totalNoContrato: itensContrato.length,
    itensComNumero: comNumero.length,
    hitsPorNumero: hits,
    preferDescription,
  });
  logTable(
    "resultado quantidade desejada → item do contrato",
    matches.map((m) => ({
      desejado_numero: m.desejado.numero,
      desejado_ataItemId: m.desejado.ataItemId,
      desejado_qtd: m.desejado.quantidade,
      desejado_desc: shortLogText(m.desejado.descricao, 120),
      encontrado: !!m.encontrado,
      contratoItemId: m.encontrado?.contratoItemId ?? "",
      encontrado_numero: m.encontrado?.numero ?? "",
      encontrado_desc: shortLogText(m.encontrado?.descricao, 120),
    })),
  );
  const avisos = [];
  const ausentes = matches.filter((m) => !m.encontrado).map((m) => m.desejado);
  for (const it of ausentes) {
    avisos.push(
      `Quantidade não atualizada (item ausente no contrato): ${it.numero || it.descricao || "sem-ref"}`,
    );
  }

  const csrf = await m2a.getCsrf(`/contratos/${contratoId}/`);
  let atualizados = 0;
  for (const m of matches) {
    if (!m.encontrado) continue;
    const url = `/contratos/itens/atualizar_quantidade_contrato_item/${m.encontrado.contratoItemId}/`;
    try {
      const r = await m2a.postForm(url, {
        csrfmiddlewaretoken: csrf,
        quantidade: m.desejado.quantidade,
      });
      ensureOperationAccepted(loadDoc(r.html), `quantidade do item ${m.desejado.numero}`);
      atualizados += 1;
    } catch (err) {
      avisos.push(
        `Item pulado (quantidade insuficiente ou rejeitada) ${m.desejado.numero || m.desejado.descricao || "sem-ref"}: ${err.message}`,
      );
    }
    await sleep(ITEM_POST_PAUSE_MS);
  }
  console.log("[m2a-contrato] quantidades atualizadas:", atualizados, { avisos });
  console.groupEnd();
  return { atualizados, avisos };
}

// --- Módulo 6: dotação ---
export async function incluirDotacao(contratoId, dadosDotacao) {
  if (!dadosDotacao) return { incluida: false };
  assertNumericId("dadosDotacao.orgao", String(dadosDotacao.orgao));
  assertNumericId("dadosDotacao.unidade_orcamentaria", String(dadosDotacao.unidade_orcamentaria));
  assertNumericId("dadosDotacao.despesa_projeto_atividade", String(dadosDotacao.despesa_projeto_atividade));

  const url = `/contratos/contrato_projeto_atividade/incluir/${contratoId}/`;
  const csrf = await m2a.getCsrf(url);
  const r = await m2a.postForm(url, {
    csrfmiddlewaretoken: csrf,
    orgao: dadosDotacao.orgao,
    unidade_orcamentaria: dadosDotacao.unidade_orcamentaria,
    despesa_projeto_atividade: dadosDotacao.despesa_projeto_atividade,
    _salvar: "",
  });
  ensureOperationAccepted(loadDoc(r.html), "inclusão de dotação orçamentária");
  return { incluida: true };
}

// --- Módulo 7: documentos ---
function extrairMetadadosDocumentos($) {
  const seen = new Set();
  const out = [];
  $("tr.tr_contrato_documento").toArray().forEach((row) => {
    const id_m2a =
      $(row).attr("id_item") || $(row).find("[id_item]").attr("id_item") || "";
    if (!isNumericId(id_m2a)) return;
    const nome =
      $(row).find("td").toArray().map((c) => textOf($, c)).find((v) => {
        if (!v) return false;
        if (/^\d+$/.test(v)) return false;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return false;
        if (/visualizar|excluir|baixar|editar|ações/i.test(v)) return false;
        return /[A-Za-zÀ-ÿ]/.test(v);
      }) || textOf($, row);
    const key = `${id_m2a}|${nome}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id_m2a, nome: nome.replace(/\s+/g, " ").trim() });
  });
  return out;
}

async function obterDocumentosContrato(contratoId) {
  const url = `/contratos/documentos/tabela/${contratoId}/`;
  const r = await m2a.get(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  const metadados = extrairMetadadosDocumentos(loadDoc(r.html));
  return { ids: metadados.map((m) => m.id_m2a), metadados };
}

async function excluirDocumentos(ids, contratoId) {
  const uniq = unique((ids ?? []).filter((id) => isNumericId(String(id))));
  if (!uniq.length) return { excluidos: 0 };
  const csrf = await m2a.getCsrf(`/contratos/${contratoId}/`);
  const r = await m2a.postForm("/contratos/documentos/excluir_varios/", {
    csrfmiddlewaretoken: csrf,
    ids_excluir: uniq.join(","),
  });
  ensureOperationAccepted(loadDoc(r.html), "exclusão de documentos antigos");
  return { excluidos: uniq.length };
}

async function gerarDocumentosEntidade(contratoId) {
  const url = `/contratos/documentos/utilizar_documentos/${contratoId}/?padrao_sistema=false`;
  const r = await m2a.get(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  ensureOperationAccepted(loadDoc(r.html), "geração de documentos da entidade");
}

async function atualizarDatasDocumentos(contratoId, dataContrato) {
  if (!dataContrato) throw new Error("Data do contrato ausente.");
  const { ids, metadados } = await obterDocumentosContrato(contratoId);
  if (!ids.length) throw new Error("Nenhum documento encontrado após geração.");
  const csrf = await m2a.getCsrf(`/contratos/${contratoId}/`);
  const dataAnterior = obterDiaUtilAnterior(dataContrato);
  let atualizados = 0;
  for (const [index, docId] of ids.entries()) {
    const dataDoc = index < 2 ? dataAnterior : dataContrato;
    const r = await m2a.postForm(`/contratos/documentos/atualizar_data/${docId}/`, {
      csrfmiddlewaretoken: csrf,
      data: dataDoc,
    });
    ensureOperationAccepted(loadDoc(r.html), `atualização da data do documento ${docId}`);
    atualizados += 1;
    await sleep(DOC_POST_PAUSE_MS);
  }
  return { atualizados, documentosM2A: metadados };
}

export async function configurarDocumentos(contratoId, dataContrato) {
  const antigos = (await obterDocumentosContrato(contratoId)).ids;
  await excluirDocumentos(antigos, contratoId);
  await gerarDocumentosEntidade(contratoId);
  await sleep(DOC_GENERATE_SETTLE_MS);
  return atualizarDatasDocumentos(contratoId, dataContrato);
}

// --- Diagnóstico ---
export async function diagnosticarContrato(payload) {
  const { m2aAtaId, contrato, dadosM2A } = payload;
  const numeroContrato = contrato?.numero_contrato || contrato?.numero;
  assertNumericId("m2aAtaId", String(m2aAtaId));
  assertNumericId("dadosM2A.unidade_gestora", String(dadosM2A?.unidade_gestora));
  assertNumericId("dadosM2A.fiscal_id", String(dadosM2A?.fiscal_id));
  assertNumericId("dadosM2A.gestor_id", String(dadosM2A?.gestor_id));
  assertNumericId("dadosM2A.preposto_id", dadosM2A?.preposto_id, false);

  const formUrl = `/ata_registro_precos/criar_contrato/${m2aAtaId}`;
  const form = await m2a.get(formUrl, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  const diag = extractFormDiagnostics(loadDoc(form.html));

  const tableUrl = `/ata_registro_precos/tabela_contratos/${m2aAtaId}?page_size=1000`;
  const table = await m2a.get(tableUrl, { headers: { "X-Requested-With": "XMLHttpRequest" } });
  const links = extractContratoLinks(loadDoc(table.html));

  return {
    sucesso: true,
    formUrl, tableUrl, numeroContrato,
    numeroBuscadoNormalizado: normalizeContratoNumero(numeroContrato),
    formulario: diag,
    totalLinks: links.length,
    amostraLinks: links.slice(0, 40),
  };
}
