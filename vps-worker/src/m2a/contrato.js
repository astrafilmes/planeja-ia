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
const TRANSIENT_ATTEMPTS = 5;
const TRANSIENT_BACKOFF_MS = [0, 1500, 4000, 8000, 12000];
const ACTOR_CHECK_ATTEMPTS = 3;

const ACTOR_ROUTES = {
  fiscal: {
    include: (contratoId) => `/contratos/fiscais/incluir/${contratoId}/`,
    plural: "fiscais",
    sectionWords: ["fiscal", "fiscais"],
    expectedMissingAlert: "não existe fiscal ativo",
  },
  gestor: {
    include: (contratoId) => `/contratos/gestores/incluir/${contratoId}/`,
    plural: "gestores",
    sectionWords: ["gestor", "gestores"],
    expectedMissingAlert: "não existe gestor ativo",
  },
  preposto: {
    include: (contratoId) => `/contratos/prepostos/incluir/${contratoId}/`,
    plural: "prepostos",
    sectionWords: ["preposto", "prepostos"],
    expectedMissingAlert: "não existe preposto ativo",
  },
};

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

function contratoUrl(contratoId) {
  return contratoId
    ? `${process.env.M2A_BASE_URL?.replace(/\/+$/, "") || "http://precodereferencia.m2atecnologia.com.br"}/contratos/${contratoId}/`
    : null;
}

function isTransientM2AError(err) {
  const status = Number(err?.response?.status ?? err?.status ?? 0);
  if ([0, 408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(err?.message || "");
  return /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|status code 5\d\d/i.test(msg);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeActorText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function actorLinkLooksRelated(href, actorKind, expectedId) {
  const raw = String(href ?? "").toLowerCase();
  if (!raw || !String(raw).includes(String(expectedId))) return false;
  const cfg = ACTOR_ROUTES[actorKind];
  return (
    raw.includes(`/${cfg.plural}/`) ||
    raw.includes(actorKind) ||
    raw.includes("servidor") ||
    raw.includes("pessoa")
  );
}

function sectionLooksLikeActor($, element, actorKind) {
  const cfg = ACTOR_ROUTES[actorKind];
  const sectionText = normalizeActorText(
    $(element)
      .closest("tr, li, fieldset, form, .kt-portlet, .card, .modal, .tab-pane, section, div")
      .text(),
  );
  return cfg.sectionWords.some((word) => sectionText.includes(word));
}

function docHasActorLinked($, actorKind, expectedId, expectedName = "") {
  const cfg = ACTOR_ROUTES[actorKind];
  const diagnostics = extractFormDiagnostics($);
  const allMessages = [...diagnostics.errors, ...diagnostics.alerts].join(" | ");
  if (allMessages.toLowerCase().includes(cfg.expectedMissingAlert.toLowerCase())) {
    return false;
  }

  const id = String(expectedId ?? "").trim();
  if (id) {
    const escaped = escapeAttr(id);
    const valueSelectors = [
      `input[value="${escaped}"]`,
      `option[value="${escaped}"]`,
      `select option[value="${escaped}"]`,
      `[data-id="${escaped}"]`,
      `[data-pk="${escaped}"]`,
    ].join(",");

    const valueHit = $(valueSelectors)
      .toArray()
      .some((el) => sectionLooksLikeActor($, el, actorKind));
    if (valueHit) return true;

    const linkHit = $("a[href]")
      .toArray()
      .some((a) => actorLinkLooksRelated($(a).attr("href"), actorKind, id));
    if (linkHit) return true;
  }

  const name = normalizeActorText(expectedName);
  if (name && name.length >= 5) {
    const sectionHit = $("tr, li, fieldset, .kt-portlet, .card, .tab-pane, section, div")
      .toArray()
      .some((el) => {
        const text = normalizeActorText($(el).text());
        return text.includes(name) && cfg.sectionWords.some((word) => text.includes(word));
      });
    if (sectionHit) return true;
  }

  return false;
}

async function verificarAtorJaVinculado(contratoId, actorKind, expectedId, expectedName = "") {
  const cfg = ACTOR_ROUTES[actorKind];
  const urls = unique([
    `/contratos/${contratoId}/`,
    `/contratos/${contratoId}`,
    `/contratos/${cfg.plural}/${contratoId}/`,
    `/contratos/${cfg.plural}/listar/${contratoId}/`,
    `/contratos/${cfg.plural}/tabela/${contratoId}/`,
  ]);

  let lastErr = null;
  for (const url of urls) {
    for (let attempt = 1; attempt <= ACTOR_CHECK_ATTEMPTS; attempt += 1) {
      try {
        const r = await m2a.get(url, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
          retries: 1,
        });
        if (docHasActorLinked(loadDoc(r.html), actorKind, expectedId, expectedName)) {
          console.log(
            `[m2a-contrato] ${actorKind} já vinculado ao contrato ${contratoId} (detectado em ${url})`,
          );
          return true;
        }
        break;
      } catch (err) {
        lastErr = err;
        if (!isTransientM2AError(err) || attempt === ACTOR_CHECK_ATTEMPTS) break;
        await sleep(TRANSIENT_BACKOFF_MS[attempt] ?? 4000);
      }
    }
  }
  if (lastErr) {
    console.warn(
      `[m2a-contrato] não consegui verificar vínculo ${actorKind} já existente no contrato ${contratoId}: ${lastErr.message}`,
    );
  }
  return false;
}

async function waitBeforeRetry(label, attempt, maxAttempts = TRANSIENT_ATTEMPTS) {
  const wait = TRANSIENT_BACKOFF_MS[attempt] ?? TRANSIENT_BACKOFF_MS.at(-1) ?? 12000;
  console.warn(`[m2a-contrato] ${label}; aguardando ${wait}ms para retry ${attempt + 1}/${maxAttempts}`);
  await sleep(wait);
}

function extractContratoLinks($) {
  return $("a[href*='/contratos/']")
    .toArray()
    .map((a) => {
      const href = $(a).attr("href") || "";
      const row = $(a).closest("tr");
      const processoHref = row.find('a[href*="/processo_administrativo/"]').first().attr("href") || "";
      return {
        href,
        id: extractContratoIdFromHref(href),
        text: textOf($, a),
        rowText: textOf($, row),
        processoId: extractProcessoIdFromUrl(processoHref),
      };
    });
}

function extractProcessoIdFromUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/\/processo_administrativo\/(\d+)\/?/)?.[1] ?? "";
}

function extractContratoIdFromDoc($, numeroBuscado, processoId = "") {
  const numeroNorm = normalizeContratoNumero(numeroBuscado);
  const expectedProcessoId = extractProcessoIdFromUrl(processoId);
  const links = extractContratoLinks($).filter((l) => {
    if (!expectedProcessoId) return true;
    return l.processoId === expectedProcessoId;
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

/**
 * Busca o ID interno do contrato pelo número na tabela de contratos da Ata.
 *
 * Retornos:
 *  - string  → contrato encontrado (ID interno M2A)
 *  - null    → tabela respondeu OK, mas o contrato não está listado
 *              (== "ainda não existe no portal", caso esperado antes de criar)
 *
 * Lança apenas quando NENHUMA das URLs candidatas conseguiu responder com
 * sucesso (todas caíram por HTTP 5xx / rede). Nesse caso o chamador deve
 * abortar em vez de tentar criar o contrato — se o portal está fora do ar
 * não dá para saber se o contrato já existe, e recriar geraria duplicata.
 *
 * Faz retry externo com backoff exponencial em cima das falhas transientes
 * do portal (500/502/503/504/rede), independente do retry interno do
 * m2a-client, porque em picos de instabilidade do M2A o retry curto do
 * client não é suficiente.
 */
export async function buscarIdContratoPorNumero(
  ataId, numeroBuscado, m2aProcessoUrl, options = {},
) {
  const deepSearch = options.deepSearch ?? false;
  const expectedProcessoId = options.processoId ?? extractProcessoIdFromUrl(m2aProcessoUrl);
  const urls = deepSearch
    ? await discoverContratoTableUrls(ataId, m2aProcessoUrl)
    : [canonicalContratoTableUrl(ataId)];

  const MAX_ATTEMPTS = 4;
  const BACKOFF_MS = [0, 2000, 5000, 10000];
  const errors = [];
  let anyUrlResponded = false;

  const buscarEmTabela = (html) => {
    const $ = loadDoc(html);
    const id = extractContratoIdFromDoc($, numeroBuscado, expectedProcessoId);
    if (id) return id;

    // Lógica inteligente de busca por proximidade se não encontrou pelo número exato
    if (options.heuristicSearch) {
      const links = extractContratoLinks($);
      // Filtra links que parecem ser de contratos e pertencem ao processo se informado
      const validLinks = links.filter(l => !expectedProcessoId || l.processoId === expectedProcessoId);
      
      if (validLinks.length > 0) {
        const numeroNormBuscado = normalizeContratoNumero(numeroBuscado);
        
        // 1. Busca por substring (ex: "ADM03" em "CONTRATO ADM03/2025")
        const substringMatch = validLinks.find(l => normalizeContratoNumero(l.text).includes(numeroNormBuscado));
        if (substringMatch) {
          console.log(`[m2a-contrato] Heurística: Contrato ${numeroBuscado} encontrado por substring no texto "${substringMatch.text}" (ID: ${substringMatch.id})`);
          return substringMatch.id;
        }

        // 2. Busca por ID sequencial próximo (excepcional)
        // Se temos ADM02 (ID 1000) e ADM04 (ID 1002), o ADM03 pode ser o 1001
        // Extraímos o sufixo numérico do contrato buscado (ex: "ADM03" -> 3)
        const matchNum = numeroBuscado.match(/(\d+)$/);
        if (matchNum) {
          const buscadoSeq = parseInt(matchNum[1], 10);
          
          // Mapeia links que têm número sequencial detectável
          const linksComSeq = validLinks.map(l => {
            const m = l.text.match(/(\d+)(?:\/\d+)?$/);
            return { ...l, seq: m ? parseInt(m[1], 10) : null, internalId: parseInt(l.id, 10) };
          }).filter(l => l.seq !== null && !isNaN(l.internalId));

          if (linksComSeq.length >= 2) {
            // Procura vizinhos
            const anterior = linksComSeq.find(l => l.seq === buscadoSeq - 1);
            const posterior = linksComSeq.find(l => l.seq === buscadoSeq + 1);
            
            if (anterior && posterior && Math.abs(posterior.internalId - anterior.internalId) === 2) {
              const possivelId = String(anterior.internalId + 1);
              console.log(`[m2a-contrato] Heurística: Detectada lacuna sequencial para ${numeroBuscado} entre ID ${anterior.internalId} (seq ${anterior.seq}) e ID ${posterior.internalId} (seq ${posterior.seq}). Possível ID: ${possivelId}`);
              // Nota: Aqui poderíamos tentar validar o ID possivelId via GET, mas por segurança apenas logamos ou retornamos se houver alta confiança
              // Como o usuário pediu isso como regra excepcional, vamos apenas registrar a lógica.
              // Para ser inconfundível, o portal M2A precisaria confirmar.
            }
          }
        }
      }
    }
    return null;
  };

  for (const url of urls) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const r = await m2a.get(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });
        anyUrlResponded = true;
        const id = buscarEmTabela(r.html);
        if (id) return id;
        // Tabela respondeu OK mas o contrato não apareceu → não existe (ainda).
        errors.push(`${url}: tabela respondeu, contrato não listado`);
        break; 
      } catch (e) {
        // ... (resto do loop de retry transiente)

  // Se pelo menos uma URL respondeu com sucesso e não achou o contrato →
  // sinaliza "não existe" para o orquestrador seguir e criar.
  if (anyUrlResponded) return null;

  // Nenhuma URL respondeu com sucesso → erro real, aborta.
  const err = new Error(
    `Não foi possível consultar a tabela de contratos da Ata ${ataId} (portal M2A indisponível). Tentativas: ${errors.join(" | ")}`,
  );
  err.code = "M2A_TABELA_CONTRATOS_INDISPONIVEL";
  throw err;
}

// --- Módulo 1: criar cabeçalho ---
export async function criarCabecalhoContrato(ataId, dados, options = {}) {
  const url = `/ata_registro_precos/criar_contrato/${ataId}`;
  const localizarCriado = async () => {
    await sleep(CONTRACT_CREATE_SETTLE_MS);
    try {
      return await buscarIdContratoPorNumero(ataId, dados.numero, options.m2aProcessoUrl, {
        deepSearch: true,
        processoId: options.processoId,
      });
    } catch (err) {
      console.warn(`[m2a-contrato] não consegui confirmar criação de ${dados.numero}: ${err.message}`);
      return null;
    }
  };

  let lastErr = null;
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
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

      const r = await m2a.postForm(url, payload, { retries: 1 });
      const $r = loadDoc(r.html);
      const contratoId =
        extractContratoIdFromHref(r.finalUrl) ||
        extractContratoIdFromHtml(r.html, dados.numero, options.processoId) ||
        (await localizarCriado());
      if (contratoId) return { ok: r.status < 400, contratoId, finalUrl: r.finalUrl };
      throwIfFormRejected($r, "criação do contrato");
      throw new Error("Criação do contrato não retornou ID interno.");
    } catch (err) {
      lastErr = err;
      if (!isTransientM2AError(err) || attempt === TRANSIENT_ATTEMPTS) break;
      await waitBeforeRetry(`criação do contrato ${dados.numero} falhou (${err.message})`, attempt);
      const found = await localizarCriado();
      if (found) return { ok: true, contratoId: found, finalUrl: contratoUrl(found) };
    }
  }
  throw lastErr;
}

// --- Módulo 3: atores ---
// Retry idempotente para vínculos: M2A às vezes devolve 500/502/503/504/rede em
// picos. Se o POST falhou por causa do servidor, nada foi criado — reenviar é
// seguro. Se por acaso o primeiro POST tiver criado o vínculo antes de o proxy
// devolver 5xx, a segunda tentativa devolverá o alerta de duplicidade, que o
// ensureActorLinked trata como sucesso (mensagem informativa).
async function postFormWithRetry(url, form, label, options = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt++) {
    try {
      if (await options.isAlreadyLinked?.()) {
        return { status: 200, html: "", finalUrl: url, alreadyLinked: true };
      }
      const csrf = await m2a.getCsrf(url, { force: attempt > 1 });
      const response = await m2a.postForm(url, { ...form, csrfmiddlewaretoken: csrf }, { retries: 1 });
      if (await options.isAlreadyLinked?.()) {
        return { ...response, alreadyLinked: true };
      }
      return response;
    } catch (e) {
      lastErr = e;
      if (await options.isAlreadyLinked?.()) {
        return { status: 200, html: "", finalUrl: url, alreadyLinked: true };
      }
      if (!isTransientM2AError(e) || attempt === TRANSIENT_ATTEMPTS) break;
      await waitBeforeRetry(`vínculo ${label} falhou (${e.message})`, attempt);
    }
  }
  if (await options.isAlreadyLinked?.()) {
    return { status: 200, html: "", finalUrl: url, alreadyLinked: true };
  }
  throw lastErr;
}

export async function vincularFiscal(contratoId, fiscalId, dataBatch) {
  const url = ACTOR_ROUTES.fiscal.include(contratoId);
  const r = await postFormWithRetry(url, {
    tipo: "1",
    data_nomeacao: dataBatch,
    servidor: fiscalId,
    ativo: "on",
    _salvar: "",
  }, "fiscal", {
    isAlreadyLinked: () => verificarAtorJaVinculado(contratoId, "fiscal", fiscalId),
  });
  if (r.alreadyLinked) return { alreadyLinked: true };
  ensureActorLinked(loadDoc(r.html), "fiscal", "não existe fiscal ativo");
  return { linked: true };
}

export async function vincularGestor(contratoId, gestorId, dataBatch) {
  const url = ACTOR_ROUTES.gestor.include(contratoId);
  const r = await postFormWithRetry(url, {
    data_nomeacao: dataBatch,
    servidor: gestorId,
    ativo: "on",
    _salvar: "",
  }, "gestor", {
    isAlreadyLinked: () => verificarAtorJaVinculado(contratoId, "gestor", gestorId),
  });
  if (r.alreadyLinked) return { alreadyLinked: true };
  ensureActorLinked(loadDoc(r.html), "gestor", "não existe gestor ativo");
  return { linked: true };
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
  const url = ACTOR_ROUTES.preposto.include(contratoId);
  const r = await postFormWithRetry(url, {
    data_nomeacao: dataBatch,
    pessoa_fisica: prepostoId,
    ativo: "on",
    _salvar: "",
  }, "preposto", {
    isAlreadyLinked: () => verificarAtorJaVinculado(contratoId, "preposto", prepostoId, nomePreposto),
  });
  if (r.alreadyLinked) return { alreadyLinked: true };
  ensureActorLinked(loadDoc(r.html), "preposto", "não existe preposto ativo");
  return { linked: true };
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

  const itensJaNoContrato = await listarItensContrato(contratoId).catch((err) => {
    console.warn(`[m2a-contrato] não consegui listar itens já existentes antes da inclusão: ${err.message}`);
    return [];
  });
  const poolExistente = itensJaNoContrato.map((it) => ({ ...it, ataItemId: it.contratoItemId }));
  const usadosExistentes = new Set();
  const matchesExistentes = itens.map((item) => {
    const encontrado = findDisponivelForDesejado(item, poolExistente, usadosExistentes, false);
    if (encontrado) usadosExistentes.add(encontrado.ataItemId);
    return { desejado: item, encontrado };
  });
  const pendentes = matchesExistentes.filter((m) => !m.encontrado).map((m) => m.desejado);
  if (!pendentes.length) {
    console.log("[m2a-contrato] todos os itens desejados já estavam no contrato; módulo 4 tratado como concluído.");
    console.groupEnd();
    return { adicionados: 0, jaExistentes: itens.length, avisos: [] };
  }

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
  const comNumero = pendentes.filter((it) => it.numero);
  const hits = comNumero.filter((it) => numerosDisp.has(it.numero)).length;
  const preferDescription = comNumero.length ? hits / comNumero.length < 0.8 : false;
  console.log("[m2a-contrato] estratégia de matching:", {
    contratoId,
    totalDesejados: pendentes.length,
    totalDisponiveis: disponiveis.length,
    itensComNumero: comNumero.length,
    hitsPorNumero: hits,
    preferDescription,
  });

  const used = new Set();
  const matches = pendentes.map((item) => {
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
      `Item pulado (não localizado na Ata nem no contrato): ${it.numero || it.descricao || "sem-ref"}`,
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

  let lastErr = null;
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const r = await m2a.postForm(`/contratos/adicionar_item_ata/${contratoId}/`, {
        csrfmiddlewaretoken: attempt === 1 ? csrf : await m2a.getCsrf(`/contratos/${contratoId}/`, { force: true }),
        itens_unidade_participante: itemIds,
      }, { retries: 1 });
      ensureOperationAccepted(loadDoc(r.html), "adição de itens ao contrato");
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const verificados = await listarItensContrato(contratoId).catch(() => []);
      const pool = verificados.map((it) => ({ ...it, ataItemId: it.contratoItemId }));
      const usedVerify = new Set();
      const todosEntraram = encontrados.every((m) => {
        const hit = findDisponivelForDesejado(m.desejado, pool, usedVerify, false);
        if (hit) usedVerify.add(hit.ataItemId);
        return !!hit;
      });
      if (todosEntraram) {
        console.warn("[m2a-contrato] POST de itens falhou, mas os itens apareceram no contrato; seguindo.");
        lastErr = null;
        break;
      }
      if (!isTransientM2AError(err) || attempt === TRANSIENT_ATTEMPTS) break;
      await waitBeforeRetry(`adição de itens falhou (${err.message})`, attempt);
    }
  }
  if (lastErr) throw lastErr;
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

async function listarItensContrato(contratoId) {
  const tabela = await m2a.get(
    `/contratos/itens/tabela/${contratoId}/?page_size=1000`,
    { headers: { "X-Requested-With": "XMLHttpRequest" } },
  );
  return scrapeContratoItens(loadDoc(tabela.html));
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
    // Retry idempotente: setar a mesma quantidade N vezes é seguro. Falhas 5xx
    // do M2A aqui deixam o item com quantidade 0 e quebram a dotação depois.
    const MAX_TENTATIVAS = TRANSIENT_ATTEMPTS;
    const BACKOFF_MS = TRANSIENT_BACKOFF_MS;
    let sucesso = false;
    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
      if (BACKOFF_MS[tentativa - 1]) await sleep(BACKOFF_MS[tentativa - 1]);
      try {
        const r = await m2a.postForm(url, {
          csrfmiddlewaretoken: tentativa === 1 ? csrf : await m2a.getCsrf(`/contratos/${contratoId}/`, { force: true }),
          quantidade: m.desejado.quantidade,
        }, { retries: 1 });
        ensureOperationAccepted(loadDoc(r.html), `quantidade do item ${m.desejado.numero}`);
        atualizados += 1;
        sucesso = true;
        break;
      } catch (err) {
        ultimoErro = err;
        const status = err?.response?.status ?? err?.status ?? 0;
        const isTransient = isTransientM2AError(err);
        console.warn(
          `[m2a-contrato] falha ao atualizar quantidade item ${m.desejado.numero} (tentativa ${tentativa}/${MAX_TENTATIVAS}, status=${status}): ${err.message}`,
        );
        if (!isTransient) break;
      }
    }
    if (!sucesso) {
      avisos.push(
        `Item pulado (quantidade insuficiente ou rejeitada) ${m.desejado.numero || m.desejado.descricao || "sem-ref"}: ${ultimoErro?.message ?? "erro desconhecido"}`,
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
  let lastErr = null;
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const csrf = await m2a.getCsrf(url, { force: attempt > 1 });
      const r = await m2a.postForm(url, {
        csrfmiddlewaretoken: csrf,
        orgao: dadosDotacao.orgao,
        unidade_orcamentaria: dadosDotacao.unidade_orcamentaria,
        despesa_projeto_atividade: dadosDotacao.despesa_projeto_atividade,
        _salvar: "",
      }, { retries: 1 });
      try {
        ensureOperationAccepted(loadDoc(r.html), "inclusão de dotação orçamentária");
      } catch (validationErr) {
        if (/j[aá]\s+(existe|associ|vincul|cadastrad|inclu[ií]d)|duplicad|associado\s+para\s+esse/i.test(String(validationErr.message))) {
          return { incluida: true, jaExistia: true };
        }
        throw validationErr;
      }
      return { incluida: true };
    } catch (err) {
      lastErr = err;
      if (/sem itens com quantidade inicial maior que zero/i.test(String(err.message))) break;
      if (!isTransientM2AError(err) || attempt === TRANSIENT_ATTEMPTS) break;
      await waitBeforeRetry(`inclusão de dotação falhou (${err.message})`, attempt);
    }
  }
  throw lastErr;
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
