// automation_engine.js — Executa no MAIN world da aba do portal M2A.
// Versão: 1.7.9
// Reproduz a sequência do portal_client.py original: criar contrato ->
// incluir itens/dotações -> incluir atores -> enviar documentos.
//
// Como este script está no MAIN world, ele pode chamar fetch() com os
// cookies de sessão do usuário no portal (sem CORS, sem CSRF externo).

(function () {
  const ENGINE_VERSION = "1.7.9";
  const REQUEST_TIMEOUT_MS = 30000;
  // Timeout estendido (10 min) para uploads pesados como importação de planilha
  // de itens com muitas linhas — o portal pode demorar para responder.
  const LONG_REQUEST_TIMEOUT_MS = 600000;
  const CSRF_CACHE_TTL_MS = 10 * 60 * 1000;
  const CONTRACT_CREATE_SETTLE_MS = 600;
  const PROCESS_CREATE_SETTLE_MS = 3000;
  const ADD_ITEMS_SETTLE_MS = 350;
  const ITEM_POST_PAUSE_MS = 75;
  const DOC_GENERATE_SETTLE_MS = 700;
  const DOC_POST_PAUSE_MS = 75;
  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const NUMERIC_ID = /^\d+$/;
  let requestCounter = 0;
  let sessionCsrfToken = null;
  const csrfCache = new Map();

  console.log(`[M2A Engine] Carregado v${ENGINE_VERSION}`);
  if (window.__M2A_ENGINE_LOADED__) return;
  window.__M2A_ENGINE_LOADED__ = true;

  function trace(level, message, data) {
    const method = console[level] ? level : "log";
    const prefix = `[M2A Engine v${ENGINE_VERSION}]`;
    if (data === undefined) console[method](prefix, message);
    else console[method](prefix, message, data);
  }

  function traceStep(step, message, data) {
    console.info(`[M2A Etapa ${step}] ${message}`, data ?? "");
  }

  function isNumericId(value) {
    return typeof value === "string" && NUMERIC_ID.test(value);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatIsoDateUTC(date) {
    return date.toISOString().slice(0, 10);
  }

  function obterDiaUtilAnterior(dataStringISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataStringISO ?? ""))) {
      throw new Error(
        `Data inválida para cálculo de dia útil anterior: ${dataStringISO}`,
      );
    }

    const date = new Date(`${dataStringISO}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);

    const day = date.getUTCDay();
    if (day === 0) date.setUTCDate(date.getUTCDate() - 2);
    if (day === 6) date.setUTCDate(date.getUTCDate() - 1);

    return formatIsoDateUTC(date);
  }

  function adicionarDiaUtil(dataStringISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataStringISO ?? ""))) {
      throw new Error(
        `Data invalida para calculo de dia util seguinte: ${dataStringISO}`,
      );
    }

    const date = new Date(`${dataStringISO}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);

    const day = date.getUTCDay();
    if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
    if (day === 0) date.setUTCDate(date.getUTCDate() + 1);

    return formatIsoDateUTC(date);
  }

  function assertNumericId(label, value, required = true) {
    if (!value && !required) return;
    if (!isNumericId(String(value))) {
      throw new Error(
        `${label} inválido: esperado ID numérico da M2A, recebido "${value}".`,
      );
    }
  }

  function absoluteUrl(path) {
    return path.startsWith("http") ? path : `${location.origin}${path}`;
  }

  function normalizeCacheUrl(url) {
    return absoluteUrl(url).replace(/#.*$/, "");
  }

  function isLoginHtml(html) {
    return (
      /name=["']password["']/i.test(html) ||
      /\/login\//i.test(location.pathname)
    );
  }

  function decodeEscapedHtmlString(value) {
    return String(value ?? "")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) =>
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
      ) {
        return node;
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findHtmlLikeString(item);
        if (found) return found;
      }
      return null;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) {
        const found = findHtmlLikeString(value);
        if (found) return found;
      }
    }
    return null;
  }

  function coerceHtmlPayload(rawText) {
    const text = String(rawText ?? "");

    try {
      const parsed = JSON.parse(text);
      const htmlStr = findHtmlLikeString(parsed);
      if (htmlStr) return decodeEscapedHtmlString(htmlStr);
    } catch (_error) {
      // Respostas HTML comuns seguem para os fallbacks abaixo.
    }

    if (text.includes('\\"') || text.includes("\\n<") || text.includes("\\u")) {
      const decoded = decodeEscapedHtmlString(text);
      if (/<(html|table|tbody|tr|td|input)\b/i.test(decoded)) return decoded;
    }

    return text;
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const { timeoutMs, ...rest } = options;
    const effectiveTimeout =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? timeoutMs
        : REQUEST_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    try {
      return await fetch(url, { ...rest, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestM2A(method, path, options = {}) {
    const id = ++requestCounter;
    const started = performance.now();
    const url = absoluteUrl(path);
    const headers = {
      Accept: "text/html,application/json,*/*",
      ...(options.headers ?? {}),
    };

    console.groupCollapsed(`[M2A HTTP #${id}] ${method} ${path}`);
    console.info("URL absoluta:", url);
    if (options.body) console.info("Body:", options.body);

    try {
      const response = await fetchWithTimeout(url, {
        ...options,
        method,
        credentials: "include",
        headers,
      });
      const text = await response.text();
      const duration = Math.round(performance.now() - started);
      console.info("Status:", response.status, response.statusText);
      console.info("URL final:", response.url);
      console.info("Tempo:", `${duration}ms`);
      console.info("Tamanho da resposta:", `${text.length} bytes`);

      const htmlPayload = coerceHtmlPayload(text);

      if (isLoginHtml(htmlPayload)) {
        console.error(
          "Diagnóstico: sessão expirada ou portal redirecionou para login.",
        );
        throw new Error("SESSAO_EXPIRADA: Usuário não logado na M2A.");
      }

      if (!response.ok) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 600);
        console.error("Prévia da resposta com erro:", preview);
        const error = new Error(`HTTP ${response.status} em ${path}`);
        error.status = response.status;
        error.path = path;
        error.responseText = text;
        throw error;
      }

      const doc = new DOMParser().parseFromString(htmlPayload, "text/html");
      rememberCsrfFromDoc(doc, path);

      return {
        response,
        text,
        htmlPayload,
        doc,
      };
    } finally {
      console.groupEnd();
    }
  }

  function isLoginPage() {
    return (
      /\/login\//i.test(location.pathname) ||
      (!!document.querySelector('input[name="username"]') &&
        !!document.querySelector('input[name="password"]'))
    );
  }

  function progress(contratoId, etapa, mensagem, extra = {}) {
    window.postMessage(
      { type: "M2A_PROGRESS", contratoId, etapa, mensagem, ...extra },
      location.origin,
    );
  }

  function progressProcesso(requestId, etapa, mensagem, extra = {}) {
    window.postMessage(
      {
        type: "M2A_PROGRESS",
        requestId,
        scope: "processo_srp",
        etapa,
        mensagem,
        ...extra,
      },
      location.origin,
    );
  }

  function rememberCsrfFromDoc(doc, sourceUrl) {
    const token = doc.querySelector("input[name='csrfmiddlewaretoken']")?.value;
    if (!token) return null;

    sessionCsrfToken = token;
    if (sourceUrl) {
      csrfCache.set(normalizeCacheUrl(sourceUrl), {
        token,
        createdAt: performance.now(),
      });
    }
    return token;
  }

  function fieldExists(doc, name) {
    return !!doc.querySelector(`[name="${CSS.escape(name)}"]`);
  }

  function pickField(doc, candidates, fallback) {
    return candidates.find((name) => fieldExists(doc, name)) ?? fallback;
  }

  function extractFormDiagnostics(doc) {
    const fields = Array.from(
      doc.querySelectorAll("input[name], select[name], textarea[name]"),
    )
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute("name"),
        type: el.getAttribute("type") || "",
        value: el.value || "",
        required: el.required || el.hasAttribute("required"),
      }))
      .filter((field) => field.name && field.name !== "csrfmiddlewaretoken");

    const errors = Array.from(
      doc.querySelectorAll(
        ".errorlist, .invalid-feedback, .help-block, .alert-danger, .alert-error, .has-error, .text-danger",
      ),
    )
      .map(textOf)
      .filter(Boolean);

    const alerts = Array.from(
      doc.querySelectorAll(".alert, .messages li, [role='alert']"),
    )
      .map(textOf)
      .filter(Boolean);

    return { fields, errors: unique(errors), alerts: unique(alerts) };
  }

  function throwIfFormRejected(doc, contexto) {
    const diagnostics = extractFormDiagnostics(doc);
    const rejectedMessages = unique([
      ...diagnostics.errors,
      ...diagnostics.alerts,
    ]).filter((message) => !/sucesso|salv|inclu[ií]d|cadastrad/i.test(message));

    console.groupCollapsed(
      `[M2A Diagnóstico] Resposta do formulário: ${contexto}`,
    );
    console.info("Campos detectados:", diagnostics.fields);
    console.info("Mensagens/alertas:", diagnostics.alerts);
    console.info("Erros detectados:", diagnostics.errors);
    console.groupEnd();

    if (rejectedMessages.length) {
      throw new Error(
        `M2A rejeitou ${contexto}: ${rejectedMessages.join(" | ")}`,
      );
    }

    return diagnostics;
  }

  function getRejectedMessages(doc) {
    const diagnostics = extractFormDiagnostics(doc);
    return {
      diagnostics,
      rejectedMessages: unique([
        ...diagnostics.errors,
        ...diagnostics.alerts,
      ]).filter(
        (message) => !/sucesso|salv|inclu[ií]d|cadastrad/i.test(message),
      ),
    };
  }

  function logFormDiagnostics(doc, contexto) {
    const diagnostics = extractFormDiagnostics(doc);
    console.groupCollapsed(
      `[M2A Diagnóstico] Resposta do formulário: ${contexto}`,
    );
    console.info("Campos detectados:", diagnostics.fields);
    console.info("Mensagens/alertas:", diagnostics.alerts);
    console.info("Erros detectados:", diagnostics.errors);
    console.groupEnd();
    return diagnostics;
  }

  function ensureActorLinked(doc, actorLabel, expectedMissingAlert) {
    const { rejectedMessages } = getRejectedMessages(doc);
    const actorStillMissing = rejectedMessages.some((message) =>
      message.toLowerCase().includes(expectedMissingAlert.toLowerCase()),
    );

    logFormDiagnostics(doc, `vínculo de ${actorLabel}`);

    if (actorStillMissing) {
      throw new Error(
        `M2A não confirmou o vínculo de ${actorLabel}: ${rejectedMessages.join(" | ")}`,
      );
    }

    const blocking = rejectedMessages.filter(
      (message) =>
        !/não existe fiscal ativo|não existe gestor ativo|não existe preposto ativo|contrato ainda não foi publicado no pncp|existem \d+ alertas/i.test(
          message,
        ),
    );

    if (blocking.length) {
      throw new Error(
        `M2A rejeitou o vínculo de ${actorLabel}: ${blocking.join(" | ")}`,
      );
    }
  }

  function ensureOperationAccepted(doc, contexto) {
    const { diagnostics, rejectedMessages } = getRejectedMessages(doc);
    const ignoredInformativeMessages =
      /não existe fiscal ativo|não existe gestor ativo|não existe preposto ativo|contrato ainda não foi publicado no pncp|existem \d+ alertas/i;
    const blocking = rejectedMessages.filter(
      (message) => !ignoredInformativeMessages.test(message),
    );

    console.groupCollapsed(`[M2A Diagnóstico] Resposta: ${contexto}`);
    console.info("Campos detectados:", diagnostics.fields);
    console.info("Mensagens/alertas:", diagnostics.alerts);
    console.info("Erros detectados:", diagnostics.errors);
    console.info("Bloqueios considerados:", blocking);
    console.groupEnd();

    if (blocking.length) {
      throw new Error(`M2A rejeitou ${contexto}: ${blocking.join(" | ")}`);
    }

    return diagnostics;
  }

  /**
   * Captura o CSRF Token dinamicamente via GET silencioso
   */
  async function capturarCsrf(url, options = {}) {
    const cacheKey = normalizeCacheUrl(url);
    const cached = csrfCache.get(cacheKey);
    if (
      !options.force &&
      cached &&
      performance.now() - cached.createdAt < CSRF_CACHE_TTL_MS
    ) {
      trace("info", `CSRF reutilizado do cache em ${url}`);
      return cached.token;
    }
    if (!options.force && sessionCsrfToken) {
      trace("info", `CSRF reutilizado da sessão em ${url}`);
      return sessionCsrfToken;
    }

    traceStep("CSRF", `Capturando token em ${url}`);
    const { doc } = await requestM2A("GET", url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const token = doc.querySelector("input[name='csrfmiddlewaretoken']")?.value;
    if (!token)
      throw new Error(`Não foi possível capturar o CSRF Token na URL: ${url}`);
    sessionCsrfToken = token;
    csrfCache.set(cacheKey, { token, createdAt: performance.now() });
    trace("info", `CSRF capturado em ${url}`);
    return token;
  }

  /**
   * Realiza requisições POST seguindo as diretrizes técnicas globais
   */
  async function postM2A(url, payload) {
    return await requestM2A("POST", url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams(payload).toString(),
    });
  }

  function normalizeProcessParagraph(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getPayloadValue(payload, names) {
    for (const name of names) {
      const value = payload?.[name];
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  }

  function requirePayloadValue(payload, names, label) {
    const value = getPayloadValue(payload, names);
    if (!value) throw new Error(`Campo obrigatorio ausente: ${label}`);
    return value;
  }

  function setRequiredUrlParam(params, payload, names, targetName, label) {
    params.set(
      targetName,
      requirePayloadValue(payload, names, label || targetName),
    );
  }

  function extractProcessoIdFromHref(href) {
    return href?.match(/\/processo_administrativo\/(\d+)\/?/)?.[1] ?? null;
  }

  function extractProcessoNumero(text) {
    return (
      String(text ?? "").match(/\b\d{5}\.\d{8}\/\d{4}-\d{2}\b/)?.[0] ??
      String(text ?? "").match(/\b\d{5,}\D+\d{6,}\D+\d{3,}\D+\d{2}\b/)?.[0] ??
      ""
    );
  }

  function limparNumeroProcesso(value) {
    return String(value ?? "")
      .replace(/[./-]/g, "")
      .replace(/\s+/g, "");
  }

  function rowMatchesObjeto(rowText, objeto) {
    const objetoNorm = normalizeComparableText(objeto);
    const rowNorm = normalizeComparableText(rowText);
    if (!objetoNorm || !rowNorm) return false;
    if (rowNorm.includes(objetoNorm)) return true;
    if (
      rowNorm.includes(objetoNorm.slice(0, Math.min(objetoNorm.length, 80)))
    ) {
      return true;
    }
    return descriptionScore(objetoNorm, rowNorm) >= 0.65;
  }

  function getArquivoSource(importacao) {
    const arquivo =
      importacao?.arquivo_xlsx ??
      importacao?.arquivoXlsx ??
      importacao?.arquivo ??
      importacao?.file ??
      importacao?.blob ??
      null;

    if (typeof arquivo === "string") return { raw: arquivo };
    if (arquivo && typeof arquivo === "object") {
      return {
        raw:
          arquivo.dataUrl ??
          arquivo.data_url ??
          arquivo.base64 ??
          arquivo.content ??
          arquivo.raw ??
          "",
        signedUrl: arquivo.signedUrl ?? arquivo.signed_url ?? arquivo.url,
        filename: arquivo.filename ?? arquivo.name ?? arquivo.nome,
        mimeType: arquivo.mimeType ?? arquivo.mime_type ?? arquivo.type,
      };
    }

    return {
      raw:
        importacao?.dataUrl ??
        importacao?.data_url ??
        importacao?.base64 ??
        importacao?.content ??
        "",
      signedUrl:
        importacao?.signedUrl ?? importacao?.signed_url ?? importacao?.url,
      filename: importacao?.filename ?? importacao?.nome_arquivo,
      mimeType: importacao?.mimeType ?? importacao?.mime_type,
    };
  }

  async function decodeArquivoXlsx(importacao, index) {
    const source = getArquivoSource(importacao);
    const filename =
      String(
        source.filename ??
          importacao?.filename ??
          importacao?.nome_arquivo ??
          `importacao-${index + 1}.xlsx`,
      ).trim() || `importacao-${index + 1}.xlsx`;

    if (source.signedUrl) {
      const response = await fetchWithTimeout(source.signedUrl, {
        method: "GET",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao baixar ${filename}.`);
      }
      const blob = await response.blob();
      return new File([blob], filename, {
        type: blob.type || source.mimeType || XLSX_MIME,
      });
    }

    const raw = String(source.raw ?? "").trim();
    if (!raw) throw new Error(`Arquivo XLSX ausente em ${filename}.`);

    const dataUrl = raw.match(/^data:([^;]+);base64,(.*)$/);
    const mimeType = dataUrl?.[1] || source.mimeType || XLSX_MIME;
    const base64 = dataUrl ? dataUrl[2] : raw.replace(/^base64,/, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], filename, { type: mimeType });
  }

  async function criarDFDProcesso(payloadReact) {
    const url = "/gestao_compras/formalizacao_demanda/incluir/";
    try {
      traceStep("P1", "Criando DFD para processo SRP", {
        objeto: payloadReact?.objeto,
      });

      const csrf = await capturarCsrf(url, { force: true });
      const params = new URLSearchParams();
      params.set("csrfmiddlewaretoken", csrf);
      params.set(
        "descricao",
        normalizeProcessParagraph(
          requirePayloadValue(payloadReact, ["objeto"], "objeto"),
        ).toLocaleUpperCase("pt-BR"),
      );
      params.set("fundamentacao", "2");
      params.set("is_registro_de_preco", "on");
      setRequiredUrlParam(params, payloadReact, ["data"], "data", "data");
      setRequiredUrlParam(
        params,
        payloadReact,
        ["ano_orcamento", "anoOrcamento"],
        "ano_orcamento",
        "ano_orcamento",
      );
      setRequiredUrlParam(
        params,
        payloadReact,
        ["orgao_solicitante", "orgaoSolicitante"],
        "orgao_solicitante",
        "orgao_solicitante",
      );
      setRequiredUrlParam(
        params,
        payloadReact,
        ["unidade_orcamentaria", "unidadeOrcamentaria"],
        "unidade_orcamentaria",
        "unidade_orcamentaria",
      );
      setRequiredUrlParam(
        params,
        payloadReact,
        ["responsavel_dfd", "responsavelDfd"],
        "responsavel_dfd",
        "responsavel_dfd",
      );
      setRequiredUrlParam(
        params,
        payloadReact,
        ["comissao_planejamento", "comissaoPlanejamento"],
        "comissao_planejamento",
        "comissao_planejamento",
      );
      params.set("_salvar", "");

      const result = await requestM2A("POST", url, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: params.toString(),
      });
      ensureOperationAccepted(result.doc, "criacao da DFD");
      await sleep(PROCESS_CREATE_SETTLE_MS);
      return { ok: true, finalUrl: result.response.url };
    } catch (error) {
      trace("error", "Falha ao criar DFD do processo SRP.", error);
      throw error;
    }
  }

  async function capturarIdsProcesso(payloadReact = {}) {
    const url = "/gestao_compras/formalizacao_demanda/tabela/?page_size=1000";
    try {
      traceStep("P2", "Buscando IDs da DFD e do processo administrativo");
      const { doc } = await requestM2A("GET", url, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });

      const rows = Array.from(
        doc.querySelectorAll("tr.kt-datatable__row.tr_solicitacao_despesa"),
      );
      if (!rows.length) {
        throw new Error("Nenhuma linha de DFD encontrada na tabela da M2A.");
      }

      const candidates = rows
        .map((row, index) => {
          const rowText = textOf(row);
          const dfdId =
            row.getAttribute("id")?.match(/tr_(\d+)/)?.[1] ??
            row.getAttribute("data-id") ??
            "";
          const processoLink =
            row.querySelector(
              "a.btn-success[href*='/processo_administrativo/']",
            ) ?? row.querySelector("a[href*='/processo_administrativo/']");
          const processoHref = processoLink?.getAttribute("href") ?? "";
          const processoId = extractProcessoIdFromHref(processoHref);
          const numeroProcesso = extractProcessoNumero(rowText);
          return {
            index,
            rowText,
            dfdId,
            processoId,
            processoHref,
            numeroProcesso,
            numeroLimpo: limparNumeroProcesso(numeroProcesso),
            matchesObjeto: rowMatchesObjeto(rowText, payloadReact?.objeto),
          };
        })
        .filter((row) => row.dfdId && row.processoId);

      if (!candidates.length) {
        throw new Error(
          "A tabela de DFD foi localizada, mas nenhum processo vinculado foi encontrado.",
        );
      }

      const selected =
        candidates.find((row) => row.matchesObjeto) ?? candidates[0];

      if (!selected.numeroProcesso || !selected.numeroLimpo) {
        throw new Error(
          `Processo ${selected.processoId} encontrado, mas o numero nao foi localizado na linha da DFD.`,
        );
      }

      trace("info", "IDs de processo SRP capturados.", selected);
      return {
        dfdId: selected.dfdId,
        processoId: selected.processoId,
        numeroProcesso: selected.numeroProcesso,
        numeroLimpo: selected.numeroLimpo,
        href: selected.processoHref,
      };
    } catch (error) {
      trace("error", "Falha ao capturar IDs do processo SRP.", error);
      throw error;
    }
  }

  async function atualizarParametrosProcesso(
    processoId,
    numeroLimpo,
    payloadReact,
  ) {
    assertNumericId("processoId", String(processoId));
    const url = `/processo_administrativo/atualizar/${processoId}/`;
    try {
      traceStep("P3", "Atualizando parametros do processo SRP", {
        processoId,
        numeroLimpo,
      });

      const csrf = await capturarCsrf(url, { force: true });
      const params = new URLSearchParams();
      params.set("csrfmiddlewaretoken", csrf);
      params.set("numero", numeroLimpo);
      params.set(
        "objeto",
        normalizeProcessParagraph(
          requirePayloadValue(payloadReact, ["objeto"], "objeto"),
        ),
      );
      params.set(
        "data_processo",
        requirePayloadValue(
          payloadReact,
          ["data_processo", "dataProcesso", "data"],
          "data_processo",
        ),
      );
      params.set(
        "unidade_orcamentaria_gerenciadora",
        requirePayloadValue(
          payloadReact,
          [
            "unidade_orcamentaria_gerenciadora",
            "unidadeOrcamentariaGerenciadora",
            "unidade_orcamentaria",
            "unidadeOrcamentaria",
          ],
          "unidade_orcamentaria_gerenciadora",
        ),
      );
      params.set("modalidade", "7");
      params.set("modo_disputa", "1");
      params.set("fundamentacao_legal", "66");
      params.set(
        "classificacao",
        requirePayloadValue(payloadReact, ["classificacao"], "classificacao"),
      );
      params.set("criterio_julgamento", "1");
      params.set("criterio_apuracao", "1");
      params.set("comissao_licitacao", "3909");
      params.set("periodo_vigencia", "2");
      params.set("valor_periodo_vigencia", "12");
      params.set("permitir_adesao_registro_preco", "on");
      params.set("regime_execucao", "1");
      params.set("valor_intervalo_lance", "0,1000");
      params.set("prazo_habilitacao_obrigatoria", "on");
      params.set("_salvar", "true");

      const result = await requestM2A("POST", url, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: params.toString(),
      });
      ensureOperationAccepted(result.doc, "atualizacao do processo SRP");
      return { ok: true, finalUrl: result.response.url };
    } catch (error) {
      trace("error", "Falha ao atualizar parametros do processo SRP.", error);
      throw error;
    }
  }

  // --- MÓDULO 1: CRIAÇÃO DO CABEÇALHO DO CONTRATO ---
  async function importarPlanilhasItens(
    processoId,
    dataAviso,
    listaImportacoes,
    requestId,
  ) {
    assertNumericId("processoId", String(processoId));
    const dataAvisoISO = String(dataAviso ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAvisoISO)) {
      throw new Error(`Data de aviso invalida: ${dataAviso}`);
    }
    const importacoes = Array.isArray(listaImportacoes) ? listaImportacoes : [];
    const dataConsolidacao = adicionarDiaUtil(dataAvisoISO);
    const dataManifestacao = dataConsolidacao;
    const url = `/processo_administrativo/importacao_planilha/${processoId}/`;
    const resultados = [];

    for (const [index, importacao] of importacoes.entries()) {
      const orgaoPk = requirePayloadValue(
        importacao,
        ["orgao_pk", "orgaoPk"],
        "orgao_pk",
      );
      const unidadePk = requirePayloadValue(
        importacao,
        ["unidade_orcamentaria_pk", "unidadeOrcamentariaPk"],
        "unidade_orcamentaria_pk",
      );

      progressProcesso(
        requestId,
        "importar_planilhas",
        `Importando tabela do Orgao ${orgaoPk}...`,
        {
          fase: 4,
          itemAtual: index + 1,
          totalItens: importacoes.length,
          progresso: 60 + ((index + 1) / Math.max(importacoes.length, 1)) * 35,
        },
      );

      try {
        const csrf = await capturarCsrf(url, { force: true });
        const file = await decodeArquivoXlsx(importacao, index);
        const form = new FormData();
        form.set("csrfmiddlewaretoken", csrf);
        form.set("orgao_pk", orgaoPk);
        form.set("unidade_orcamentaria_pk", unidadePk);
        form.set("data_aviso", dataAvisoISO);
        form.set("data_consolidacao", dataConsolidacao);
        form.set("data_manifestacao", dataManifestacao);
        form.set("valores_pesquisa_importacao", "false");
        form.set("FileUpload", file, file.name);

        const result = await requestM2A("POST", url, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": csrf,
          },
          body: form,
          // Importação em lote pode demorar muito no portal — usa timeout estendido.
          timeoutMs: LONG_REQUEST_TIMEOUT_MS,
        });
        ensureOperationAccepted(
          result.doc,
          `importacao da planilha ${index + 1}`,
        );
        resultados.push({
          ok: true,
          orgao_pk: orgaoPk,
          unidade_orcamentaria_pk: unidadePk,
          filename: file.name,
        });
      } catch (error) {
        console.error("[M2A SRP] Falha na importacao de planilha:", error);
        resultados.push({
          ok: false,
          orgao_pk: orgaoPk,
          unidade_orcamentaria_pk: unidadePk,
          erro: String(error?.message ?? error),
        });
        progressProcesso(
          requestId,
          "importar_planilhas",
          `Falha ao importar tabela do Orgao ${orgaoPk}; continuando...`,
          {
            fase: 4,
            itemAtual: index + 1,
            totalItens: importacoes.length,
            erroItem: String(error?.message ?? error),
          },
        );
      }
    }

    return {
      data_aviso: dataAvisoISO,
      data_consolidacao: dataConsolidacao,
      data_manifestacao: dataManifestacao,
      resultados,
    };
  }

  async function orquestrarCriacaoProcesso(payloadReact) {
    const requestId =
      payloadReact?.requestId ||
      `processo_srp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.group("[M2A SRP] Criacao de processo administrativo");
    try {
      progressProcesso(requestId, "criar_dfd", "1. Criando DFD...", {
        fase: 1,
        progresso: 10,
      });
      await criarDFDProcesso(payloadReact);

      progressProcesso(requestId, "buscar_ids", "2. Buscando IDs...", {
        fase: 2,
        progresso: 32,
      });
      const ids = await capturarIdsProcesso(payloadReact);

      progressProcesso(
        requestId,
        "atualizar_processo",
        "3. Atualizando Processo...",
        {
          fase: 3,
          progresso: 50,
          dfdId: ids.dfdId,
          processoId: ids.processoId,
          numeroProcesso: ids.numeroProcesso,
          numeroLimpo: ids.numeroLimpo,
        },
      );
      await atualizarParametrosProcesso(
        ids.processoId,
        ids.numeroLimpo,
        payloadReact,
      );

      const listaImportacoes = payloadReact?.listaImportacoes ?? [];
      progressProcesso(
        requestId,
        "importar_planilhas",
        `4. Importando Planilha (0 de ${listaImportacoes.length})...`,
        {
          fase: 4,
          progresso: 60,
          totalItens: listaImportacoes.length,
        },
      );
      const importacoes = await importarPlanilhasItens(
        ids.processoId,
        getPayloadValue(payloadReact, ["data_aviso", "dataAviso", "data"]),
        listaImportacoes,
        requestId,
      );

      progressProcesso(
        requestId,
        "concluido",
        "Processo SRP criado e planilhas importadas.",
        {
          sucesso: true,
          status: "concluido",
          progresso: 100,
          dfdId: ids.dfdId,
          processoId: ids.processoId,
          numeroProcesso: ids.numeroProcesso,
          numeroLimpo: ids.numeroLimpo,
          importacoes,
        },
      );
    } catch (error) {
      console.error("[M2A SRP] Erro na criacao do processo:", error);
      progressProcesso(requestId, "erro", String(error?.message ?? error), {
        sucesso: false,
        status: "erro",
      });
    } finally {
      console.groupEnd();
    }
  }

  async function criarCabecalhoContrato(ataId, dados) {
    const url = `/ata_registro_precos/criar_contrato/${ataId}`;
    traceStep("1", "Criando cabeçalho do contrato", {
      ataId,
      numero: dados.numero,
      unidade_gestora: dados.unidade_gestora,
    });
    traceStep("1.1", "Lendo formulário real de criação antes do POST", { url });
    const formPage = await requestM2A("GET", url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const csrf = formPage.doc.querySelector(
      "input[name='csrfmiddlewaretoken']",
    )?.value;
    if (!csrf)
      throw new Error(`Não foi possível capturar o CSRF Token na URL: ${url}`);

    const numeroField = pickField(
      formPage.doc,
      ["numero", "numero_contrato", "num_contrato", "contrato"],
      "numero",
    );
    const objetoField = pickField(
      formPage.doc,
      ["objeto", "descricao", "objeto_contrato"],
      "objeto",
    );
    const dataField = pickField(
      formPage.doc,
      ["data_contrato", "data", "data_assinatura"],
      "data_contrato",
    );
    const dataFimField = pickField(
      formPage.doc,
      ["data_fim", "vigencia_fim", "data_termino"],
      "data_fim",
    );
    const unidadeField = pickField(
      formPage.doc,
      ["unidade_gestora", "unidade", "orgao"],
      "unidade_gestora",
    );

    console.table([
      { dado: "numero", campo: numeroField, valor: dados.numero },
      { dado: "objeto", campo: objetoField, valor: dados.objeto },
      { dado: "data_contrato", campo: dataField, valor: dados.data },
      { dado: "data_fim", campo: dataFimField, valor: dados.data_fim || "" },
      {
        dado: "unidade_gestora",
        campo: unidadeField,
        valor: dados.unidade_gestora,
      },
    ]);
    const formDiagnostics = extractFormDiagnostics(formPage.doc);
    console.groupCollapsed("[M2A Diagnóstico] Formulário de criação carregado");
    console.info("Campos detectados:", formDiagnostics.fields);
    console.info("Mensagens/alertas:", formDiagnostics.alerts);
    console.info("Erros visíveis:", formDiagnostics.errors);
    console.groupEnd();

    const payload = {
      csrfmiddlewaretoken: csrf,
      [numeroField]: dados.numero,
      [objetoField]: dados.objeto,
      [dataField]: dados.data,
      [dataFimField]: dados.data_fim || "",
      [unidadeField]: dados.unidade_gestora,
      _salvar: "",
    };

    const result = await postM2A(url, payload);
    const contratoId =
      extractContratoIdFromHref(result.response.url) ||
      extractContratoIdFromHtml(result.text, dados.numero);
    if (contratoId) {
      trace("info", "Contrato encontrado diretamente na resposta de criação.", {
        contratoId,
      });
      logFormDiagnostics(
        result.doc,
        "pós-criação do contrato (alertas informativos)",
      );
    } else {
      throwIfFormRejected(result.doc, "criação do contrato");
      trace(
        "warn",
        "Resposta de criação não trouxe link direto do contrato. O motor vai tentar localizar pela tabela/listagem.",
        {
          finalUrl: result.response.url,
          preview: result.text.replace(/\s+/g, " ").trim().slice(0, 500),
        },
      );
    }
    await sleep(CONTRACT_CREATE_SETTLE_MS);
    return {
      ok: result.response.ok,
      contratoId,
      finalUrl: result.response.url,
    };
  }

  // --- MÓDULO 2: RECUPERAÇÃO DO ID DO CONTRATO ---
  function textOf(el) {
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeContratoNumero(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .trim()
      .toUpperCase();
  }

  function extractContratoIdFromHref(href) {
    return href?.match(/\/contratos\/(\d+)\/?/)?.[1] ?? null;
  }

  function extractContratoIdFromHtml(html, numeroBuscado) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return extractContratoIdFromDoc(doc, numeroBuscado);
  }

  function extractContratoLinks(doc) {
    return Array.from(doc.querySelectorAll("a[href*='/contratos/']")).map(
      (a) => ({
        href: a.getAttribute("href") || "",
        id: extractContratoIdFromHref(a.getAttribute("href")),
        text: textOf(a),
        rowText: textOf(a.closest("tr")),
      }),
    );
  }

  function extractContratoIdFromDoc(doc, numeroBuscado) {
    const numeroNormalizado = normalizeContratoNumero(numeroBuscado);
    const links = extractContratoLinks(doc);

    trace("info", `Analisando ${links.length} links de contrato na resposta.`);

    const exact = links.find(
      (link) => normalizeContratoNumero(link.text) === numeroNormalizado,
    );
    if (exact) return exact.id;

    const rowMatch = links.find((link) =>
      normalizeContratoNumero(link.rowText).includes(numeroNormalizado),
    );
    if (rowMatch) return rowMatch.id;

    return null;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function findContratoTableLinksInDoc(doc, ataId) {
    return unique(
      Array.from(doc.querySelectorAll("a[href]"))
        .map((a) => a.getAttribute("href"))
        .filter((href) => {
          const value = href || "";
          return (
            value.includes("contrato") &&
            (value.includes(String(ataId)) ||
              value.includes("tabela_contratos") ||
              value.includes("contratos/tabela"))
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

    try {
      const page = await requestM2A("GET", m2aProcessoUrl || location.href);
      const discovered = findContratoTableLinksInDoc(page.doc, ataId);
      if (discovered.length) {
        trace(
          "info",
          "Links de contratos descobertos na página do processo.",
          discovered,
        );
        candidates.unshift(...discovered);
      } else {
        trace(
          "warn",
          "Nenhum link de tabela de contratos foi descoberto na página do processo.",
        );
      }
    } catch (error) {
      trace(
        "warn",
        "Não foi possível varrer a página do processo para descobrir links.",
        error,
      );
    }

    return unique(candidates);
  }

  function getCanonicalContratoTableUrl(ataId) {
    return `/ata_registro_precos/tabela_contratos/${ataId}?page_size=1000`;
  }

  async function buscarIdContratoPorNumero(
    ataId,
    numeroBuscado,
    m2aProcessoUrl,
    options = {},
  ) {
    const deepSearch = options.deepSearch ?? false;
    const urls = deepSearch
      ? await discoverContratoTableUrls(ataId, m2aProcessoUrl)
      : [getCanonicalContratoTableUrl(ataId)];
    const errors = [];

    traceStep("2", "Recuperando ID interno do contrato", {
      ataId,
      numeroBuscado,
      tentativas: urls,
      deepSearch,
    });

    for (const url of urls) {
      try {
        const { doc } = await requestM2A("GET", url, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const contratoId = extractContratoIdFromDoc(doc, numeroBuscado);
        if (contratoId) {
          trace("info", `Contrato localizado em ${url}`, { contratoId });
          return contratoId;
        }
        console.groupCollapsed(
          `[M2A Diagnóstico] Contrato não encontrado em ${url}`,
        );
        console.info(
          "Número buscado normalizado:",
          normalizeContratoNumero(numeroBuscado),
        );
        console.table(
          extractContratoLinks(doc)
            .filter((link) => link.id || link.text || link.rowText)
            .slice(0, 25),
        );
        console.groupEnd();
        errors.push(`${url}: tabela respondeu, mas o contrato não apareceu`);
      } catch (error) {
        errors.push(`${url}: ${error.message}`);
      }
    }

    console.table(
      errors.map((erro, index) => ({ tentativa: index + 1, erro })),
    );
    throw new Error(
      `Não foi possível localizar o contrato '${numeroBuscado}' na Ata ${ataId}. Veja a tabela de tentativas no console.`,
    );
  }

  async function diagnosticarContrato(payload) {
    const { contratoId, m2aProcessoUrl, m2aAtaId, contrato, dadosM2A } =
      payload;
    const numeroContrato = contrato?.numero_contrato || contrato?.numero;

    console.group(
      `[M2A Diagnóstico] Teste sem gravação do contrato ${numeroContrato}`,
    );
    try {
      assertNumericId("m2aAtaId", String(m2aAtaId));
      assertNumericId(
        "dadosM2A.unidade_gestora",
        String(dadosM2A?.unidade_gestora),
      );
      assertNumericId("dadosM2A.fiscal_id", String(dadosM2A?.fiscal_id));
      assertNumericId("dadosM2A.gestor_id", String(dadosM2A?.gestor_id));
      assertNumericId("dadosM2A.preposto_id", dadosM2A?.preposto_id, false);

      const formUrl = `/ata_registro_precos/criar_contrato/${m2aAtaId}`;
      const form = await requestM2A("GET", formUrl, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const diagnostics = extractFormDiagnostics(form.doc);
      console.info("Formulário de criação:", {
        url: formUrl,
        campos: diagnostics.fields,
        alertas: diagnostics.alerts,
        erros: diagnostics.errors,
      });

      const tableUrl = `/ata_registro_precos/tabela_contratos/${m2aAtaId}?page_size=1000`;
      const table = await requestM2A("GET", tableUrl, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const links = extractContratoLinks(table.doc);
      console.info("Tabela de contratos:", {
        url: tableUrl,
        totalLinks: links.length,
        numeroBuscado: numeroContrato,
        numeroBuscadoNormalizado: normalizeContratoNumero(numeroContrato),
      });
      console.table(links.slice(0, 40));
      progress(
        contratoId,
        "diagnostico",
        "Diagnóstico M2A concluído sem gravação.",
        {
          sucesso: true,
        },
      );
    } catch (error) {
      console.error("[M2A Diagnóstico] Falhou:", error);
      progress(contratoId, "erro", error.message, { sucesso: false });
    } finally {
      console.groupEnd();
    }
  }

  // --- MÓDULO 3: VINCULAÇÃO DE ATORES ---
  async function vincularFiscal(contratoId, fiscalId, dataBatch) {
    traceStep("3.1", "Vinculando fiscal ao contrato", {
      contratoId,
      fiscalId,
      dataBatch,
    });
    const url = `/contratos/fiscais/incluir/${contratoId}/`;
    const csrf = await capturarCsrf(url);
    const payload = {
      csrfmiddlewaretoken: csrf,
      tipo: "1",
      data_nomeacao: dataBatch,
      servidor: fiscalId,
      ativo: "on",
      _salvar: "",
    };
    const result = await postM2A(url, payload);
    ensureActorLinked(result.doc, "fiscal", "não existe fiscal ativo");
    return result;
  }

  async function vincularGestor(contratoId, gestorId, dataBatch) {
    traceStep("3.2", "Vinculando gestor ao contrato", {
      contratoId,
      gestorId,
      dataBatch,
    });
    const url = `/contratos/gestores/incluir/${contratoId}/`;
    const csrf = await capturarCsrf(url);
    const payload = {
      csrfmiddlewaretoken: csrf,
      data_nomeacao: dataBatch,
      servidor: gestorId,
      ativo: "on",
      _salvar: "",
    };
    const result = await postM2A(url, payload);
    ensureActorLinked(result.doc, "gestor", "não existe gestor ativo");
    return result;
  }

  async function vincularPreposto(
    contratoId,
    nomePreposto,
    dataBatch,
    prepostoIdInformado,
  ) {
    let prepostoId = prepostoIdInformado;
    traceStep("3.3", "Vinculando preposto ao contrato", {
      contratoId,
      prepostoIdInformado,
      nomePreposto,
      dataBatch,
    });

    if (!prepostoId) {
      const searchUrl = `/pessoa/pessoa-fisica-autocomplete/?is_entidade=False&query=${encodeURIComponent(nomePreposto)}`;
      const search = await requestM2A("GET", searchUrl, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json,*/*",
        },
      });
      const json = JSON.parse(search.text);

      if (!json.suggestions || json.suggestions.length === 0) {
        throw new Error(
          `Preposto '${nomePreposto}' não encontrado via autocomplete da M2A.`,
        );
      }
      prepostoId = json.suggestions[0].id;
      trace("info", "Preposto localizado via autocomplete.", {
        prepostoId,
        nome: json.suggestions[0].value ?? json.suggestions[0].label,
      });
    }

    // 3.3.2 Vínculo efetivo
    const url = `/contratos/prepostos/incluir/${contratoId}/`;
    const csrf = await capturarCsrf(url);
    const payload = {
      csrfmiddlewaretoken: csrf,
      data_nomeacao: dataBatch,
      pessoa_fisica: prepostoId,
      ativo: "on",
      _salvar: "",
    };
    const result = await postM2A(url, payload);
    ensureActorLinked(result.doc, "preposto", "não existe preposto ativo");
    return result;
  }

  // --- MÓDULO 4: BUSCA E ADIÇÃO DE ITENS AO CONTRATO ---
  function normalizeItemNumero(value) {
    const text = String(value ?? "").trim();
    const match = text.match(/^\s*0*(\d+)(?:\D|$)/) || text.match(/0*(\d+)/);
    if (!match) return "";
    return String(Number(match[1]));
  }

  function normalizeComparableText(value) {
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
    "A",
    "AS",
    "AO",
    "AOS",
    "O",
    "OS",
    "DE",
    "DA",
    "DAS",
    "DO",
    "DOS",
    "E",
    "EM",
    "NA",
    "NAS",
    "NO",
    "NOS",
    "PARA",
    "POR",
    "COM",
    "COR",
    "CORES",
    "TAM",
    "TAMANHO",
    "DIMENSOES",
    "ESPECIFICACAO",
    "UNIDADE",
    "MATERIAL",
    "FABRICADO",
    "FABRICADA",
  ]);

  function descriptionTokens(value) {
    return normalizeComparableText(value)
      .replace(/^\d+\s+/, "")
      .split(/\s+/)
      .filter((token) => {
        if (!token) return false;
        if (DESCRIPTION_STOP_WORDS.has(token)) return false;
        return token.length > 1 || /^\d+$/.test(token);
      });
  }

  function descriptionScore(needleText, haystackText) {
    const needle = descriptionTokens(needleText);
    const haystack = new Set(descriptionTokens(haystackText));
    if (!needle.length || !haystack.size) return 0;

    let hits = 0;
    for (const token of needle) {
      if (haystack.has(token)) hits += 1;
    }
    return hits / needle.length;
  }

  function normalizeAtaItemId(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return /^\d+$/.test(raw) ? raw : "";
  }

  function formatQuantidadeM2A(value) {
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

  function normalizeItensDesejados(itensDesejados) {
    return (itensDesejados ?? [])
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

  function findItemDescriptionCell(row) {
    const cells = Array.from(row.querySelectorAll("td"));
    return (
      cells.find((cell) => /^\s*\d+\s*[-–.]/.test(textOf(cell))) ||
      cells.find((cell) => /\b\d+\s*[-–.]\s*\S/.test(textOf(cell))) ||
      cells[0]
    );
  }

  function scrapeItensDisponiveis(doc) {
    const rows = Array.from(
      doc.querySelectorAll(
        "tr.kt-datatable__row.tr_unidade_participante_item_contrato, tr.tr_unidade_participante_item_contrato",
      ),
    );

    const itens = rows
      .map((row) => {
        const checkbox = row.querySelector(
          "input.check-box-arp-item-contrato[type='checkbox'], input.check-box-arp-item-contrato, input[type='checkbox'][value]",
        );
        const descricao = textOf(findItemDescriptionCell(row));
        return {
          ataItemId: checkbox?.value ?? "",
          numero: normalizeItemNumero(descricao),
          descricao,
          descricaoNorm: normalizeComparableText(descricao),
          rowText: textOf(row),
        };
      })
      .filter((item) => item.ataItemId && (item.numero || item.descricaoNorm));

    console.groupCollapsed("[M2A Diagnóstico] Scraping de itens disponíveis");
    console.info("Linhas candidatas encontradas:", rows.length);
    console.table(
      itens.map((item) => ({
        numero: item.numero,
        codigo: item.ataItemId,
        descricao: item.descricao,
      })),
    );
    console.groupEnd();

    return itens;
  }

  function findDisponivelForDesejado(
    desejado,
    disponiveis,
    usedAtaItemIds,
    preferDescription = false,
  ) {
    const by = (predicate) =>
      disponiveis.find(
        (item) => !usedAtaItemIds.has(item.ataItemId) && predicate(item),
      );

    if (desejado.ataItemId) {
      const byAtaItemId = by((item) => item.ataItemId === desejado.ataItemId);
      if (byAtaItemId) return byAtaItemId;
    }

    const tryByDescricao = () => {
      if (!desejado.descricaoNorm) return null;
      const byDescricaoExata = by(
        (item) => item.descricaoNorm === desejado.descricaoNorm,
      );
      if (byDescricaoExata) return byDescricaoExata;

      const byDescricaoContem = by(
        (item) =>
          item.descricaoNorm.includes(desejado.descricaoNorm) ||
          desejado.descricaoNorm.includes(item.descricaoNorm),
      );
      if (byDescricaoContem) return byDescricaoContem;

      const scored = disponiveis
        .filter((item) => !usedAtaItemIds.has(item.ataItemId))
        .map((item) => ({
          item,
          score: descriptionScore(item.descricao, desejado.descricao),
        }))
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best?.score >= 0.6) {
        trace("info", "Item casado por similaridade de descrição.", {
          desejado: desejado.descricao,
          disponivel: best.item.descricao,
          ataItemId: best.item.ataItemId,
          score: best.score,
        });
        return best.item;
      }

      return null;
    };

    const tryByNumero = () => {
      if (!desejado.numero) return null;
      return by((item) => item.numero === desejado.numero);
    };

    if (preferDescription) {
      const byDescricao = tryByDescricao();
      if (byDescricao) return byDescricao;
      const byNumero = tryByNumero();
      if (byNumero) return byNumero;
    } else {
      const byNumero = tryByNumero();
      if (byNumero) return byNumero;
      const byDescricao = tryByDescricao();
      if (byDescricao) return byDescricao;
    }

    return null;
  }

  async function adicionarItensAoContrato(contratoId, itensDesejados) {
    const itens = normalizeItensDesejados(itensDesejados);
    if (!itens.length) {
      trace("warn", "Nenhum item informado no payload. Etapa de itens pulada.");
      return { adicionados: 0 };
    }

    const tabelaUrl = `/contratos/ata_registro_preco_contrato/tabela/${contratoId}/?page_size=1000`;
    traceStep("4.1", "Buscando itens disponíveis da Ata para o contrato", {
      contratoId,
      tabelaUrl,
      itensDesejados: itens,
    });
    const tabela = await requestM2A("GET", tabelaUrl, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    const disponiveis = scrapeItensDisponiveis(tabela.doc);
    const numerosDisponiveis = new Set(disponiveis.map((item) => item.numero));
    const itensComNumero = itens.filter((item) => item.numero);
    const hitsNumero = itensComNumero.filter((item) =>
      numerosDisponiveis.has(item.numero),
    ).length;
    const confiancaNumero =
      itensComNumero.length > 0 ? hitsNumero / itensComNumero.length : 0;
    const preferDescription = confiancaNumero < 0.8;
    trace(
      "info",
      "Diagnóstico de confiança da numeração dos itens recebidos.",
      {
        itensComNumero: itensComNumero.length,
        hitsNumero,
        confiancaNumero,
        preferDescription,
      },
    );
    const usedAtaItemIds = new Set();
    const matches = itens.map((item) => {
      const disponivel = findDisponivelForDesejado(
        item,
        disponiveis,
        usedAtaItemIds,
        preferDescription,
      );
      if (disponivel) usedAtaItemIds.add(disponivel.ataItemId);
      return {
        desejado: item,
        disponivel,
      };
    });
    const encontrados = matches.filter((match) => !!match.disponivel);
    const ausentes = matches
      .filter((match) => !match.disponivel)
      .map((match) => match.desejado);

    console.groupCollapsed("[M2A Etapa 4.2] Match de itens da Ata");
    console.info("Itens disponíveis encontrados:", disponiveis.length);
    console.table(
      disponiveis.map((item) => ({
        numero: item.numero,
        ata_item_id: item.ataItemId,
        descricao: item.descricao,
      })),
    );
    console.info("Itens desejados:", itens);
    console.table(
      encontrados.map((match) => ({
        numero: match.desejado.numero,
        descricao: match.desejado.descricao,
        quantidade: match.desejado.quantidade,
        ata_item_id: match.disponivel.ataItemId,
      })),
    );
    if (ausentes.length)
      console.warn("Itens desejados não encontrados:", ausentes);
    console.groupEnd();

    if (ausentes.length) {
      throw new Error(
        `Itens não localizados na lista de itens disponíveis da Ata: ${ausentes
          .map((item) => item.numero || item.descricao || "sem-referencia")
          .join(", ")}`,
      );
    }

    const csrf =
      tabela.doc.querySelector("input[name='csrfmiddlewaretoken']")?.value ||
      (await capturarCsrf(`/contratos/${contratoId}/`));
    const itemIds = encontrados
      .map((match) => match.disponivel.ataItemId)
      .join(" ");
    const payload = {
      csrfmiddlewaretoken: csrf,
      itens_unidade_participante: itemIds,
    };

    if (!itemIds) {
      trace(
        "info",
        "Todos os itens desejados já estavam adicionados ao contrato.",
        { contratoId },
      );
      return { adicionados: 0 };
    }

    traceStep("4.3", "Adicionando itens ao contrato", {
      contratoId,
      itemIds,
    });
    const result = await postM2A(
      `/contratos/adicionar_item_ata/${contratoId}/`,
      payload,
    );
    ensureOperationAccepted(result.doc, "adição de itens ao contrato");
    console.log(`[M2A - OK] ${encontrados.length} item(ns) adicionados.`);
    await sleep(ADD_ITEMS_SETTLE_MS);
    return { adicionados: encontrados.length };
  }

  // --- MÓDULO 5: MAPEAMENTO DOS NOVOS IDS E ATUALIZAÇÃO DE QUANTIDADES ---
  function scrapeContratoItens(doc) {
    const rows = Array.from(
      doc.querySelectorAll(
        "tr.kt-datatable__row.tr_contrato_item, tr.tr_contrato_item",
      ),
    );

    return rows
      .map((row) => {
        const rowId = row.getAttribute("id") || "";
        const contratoItemId =
          rowId.match(/^tr_(\d+)$/)?.[1] ||
          row.querySelector("[data-id]")?.getAttribute("data-id") ||
          "";
        const descricao = textOf(findItemDescriptionCell(row));
        return {
          contratoItemId,
          numero: normalizeItemNumero(descricao),
          descricao,
          descricaoNorm: normalizeComparableText(descricao),
          rowText: textOf(row),
        };
      })
      .filter((item) => item.contratoItemId && (item.numero || item.descricao));
  }

  async function atualizarQuantidadesItens(contratoId, itensDesejados) {
    const itens = normalizeItensDesejados(itensDesejados);
    if (!itens.length) {
      trace(
        "warn",
        "Nenhum item informado no payload. Atualização de quantidades pulada.",
      );
      return { atualizados: 0 };
    }

    const tabelaUrl = `/contratos/itens/tabela/${contratoId}/?page_size=1000`;
    traceStep("5.1", "Buscando novos IDs internos dos itens do contrato", {
      contratoId,
      tabelaUrl,
    });
    const tabela = await requestM2A("GET", tabelaUrl, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    const itensContrato = scrapeContratoItens(tabela.doc);
    const numerosContrato = new Set(itensContrato.map((item) => item.numero));
    const itensComNumero = itens.filter((item) => item.numero);
    const hitsNumero = itensComNumero.filter((item) =>
      numerosContrato.has(item.numero),
    ).length;
    const preferDescription =
      itensComNumero.length > 0
        ? hitsNumero / itensComNumero.length < 0.8
        : false;
    const usadosContratoItem = new Set();
    const itensContratoMatchPool = itensContrato.map((it) => ({
      ...it,
      ataItemId: it.contratoItemId,
    }));
    const matches = itens.map((item) => {
      const encontrado = findDisponivelForDesejado(
        item,
        itensContratoMatchPool,
        usadosContratoItem,
        preferDescription,
      );
      if (encontrado) usadosContratoItem.add(encontrado.ataItemId);
      return {
        desejado: item,
        encontrado: encontrado
          ? {
              ...encontrado,
              contratoItemId: encontrado.ataItemId,
            }
          : null,
      };
    });
    const ausentes = matches
      .filter((match) => !match.encontrado)
      .map((match) => match.desejado);

    console.groupCollapsed("[M2A Etapa 5.2] Mapeamento dos itens adicionados");
    console.table(
      itensContrato.map((item) => ({
        numero: item.numero,
        contrato_item_id: item.contratoItemId,
        descricao: item.descricao,
      })),
    );
    if (ausentes.length) console.warn("Itens sem ID interno:", ausentes);
    console.groupEnd();

    if (ausentes.length) {
      throw new Error(
        `Itens adicionados não apareceram na tabela do contrato: ${ausentes
          .map((item) => item.numero || item.descricao || "sem-referencia")
          .join(", ")}`,
      );
    }

    const csrf = await capturarCsrf(`/contratos/${contratoId}/`);
    let atualizados = 0;
    for (const match of matches) {
      if (!match.encontrado) continue;
      const item = match.desejado;
      const encontrado = match.encontrado;
      const url = `/contratos/itens/atualizar_quantidade_contrato_item/${encontrado.contratoItemId}/`;
      traceStep("5.3", "Atualizando quantidade do item", {
        contratoId,
        numero: item.numero || "(sem número)",
        descricao: item.descricao || "",
        contratoItemId: encontrado.contratoItemId,
        quantidade: item.quantidade,
        url,
      });
      const result = await postM2A(url, {
        csrfmiddlewaretoken: csrf,
        quantidade: item.quantidade,
      });
      ensureOperationAccepted(result.doc, `quantidade do item ${item.numero}`);
      console.log(
        `[M2A - OK] Item ${item.numero || item.descricao || encontrado.contratoItemId} atualizado para ${item.quantidade}.`,
      );
      atualizados += 1;
      await sleep(ITEM_POST_PAUSE_MS);
    }

    return { atualizados };
  }

  // --- MÓDULO 6: INCLUSÃO DE DOTAÇÃO ORÇAMENTÁRIA ---
  async function incluirDotacao(contratoId, dadosDotacao) {
    if (!dadosDotacao) {
      trace("warn", "Nenhuma dotação informada no payload. Etapa pulada.");
      return { incluida: false };
    }

    assertNumericId("dadosDotacao.orgao", String(dadosDotacao.orgao));
    assertNumericId(
      "dadosDotacao.unidade_orcamentaria",
      String(dadosDotacao.unidade_orcamentaria),
    );
    assertNumericId(
      "dadosDotacao.despesa_projeto_atividade",
      String(dadosDotacao.despesa_projeto_atividade),
    );

    const url = `/contratos/contrato_projeto_atividade/incluir/${contratoId}/`;
    traceStep("6.1", "Capturando formulário de dotação orçamentária", {
      contratoId,
      url,
      dadosDotacao,
    });
    const csrf = await capturarCsrf(url);

    traceStep("6.2", "Incluindo dotação orçamentária", {
      contratoId,
      dadosDotacao,
    });
    const result = await postM2A(url, {
      csrfmiddlewaretoken: csrf,
      orgao: dadosDotacao.orgao,
      unidade_orcamentaria: dadosDotacao.unidade_orcamentaria,
      despesa_projeto_atividade: dadosDotacao.despesa_projeto_atividade,
      _salvar: "",
    });
    ensureOperationAccepted(result.doc, "inclusão de dotação orçamentária");
    console.log("[M2A - OK] Dotação orçamentária incluída.");
    return { incluida: true };
  }

  // --- MÓDULO 7: GESTÃO DE DOCUMENTOS ---
  function extrairMetadadosDocumentos(doc) {
    return unique(
      Array.from(doc.querySelectorAll("tr.tr_contrato_documento"))
        .map((row) => {
          const id_m2a =
            row.getAttribute("id_item") ||
            row.querySelector("[id_item]")?.getAttribute("id_item") ||
            "";
          if (!isNumericId(id_m2a)) return null;

          const nome =
            Array.from(row.querySelectorAll("td"))
              .map((cell) => textOf(cell))
              .find((value) => {
                if (!value) return false;
                if (/^\d+$/.test(value)) return false;
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
                if (/visualizar|excluir|baixar|editar|ações/i.test(value))
                  return false;
                return /[A-Za-zÀ-ÿ]/.test(value);
              }) || textOf(row);

          return {
            id_m2a,
            nome: nome.replace(/\s+/g, " ").trim(),
          };
        })
        .filter(Boolean)
        .map((docMeta) => JSON.stringify(docMeta)),
    ).map((docMeta) => JSON.parse(docMeta));
  }

  async function obterDocumentosContrato(contratoId) {
    const url = `/contratos/documentos/tabela/${contratoId}/`;
    traceStep("7.1", "Buscando documentos do contrato", { contratoId, url });
    const { doc } = await requestM2A("GET", url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const metadados = extrairMetadadosDocumentos(doc);
    const ids = metadados.map((item) => item.id_m2a);

    console.groupCollapsed("[M2A Etapa 7.1] IDs de documentos encontrados");
    console.table(
      metadados.map((item) => ({
        documento_id: item.id_m2a,
        nome: item.nome,
      })),
    );
    console.groupEnd();

    return { ids, metadados };
  }

  async function obterIdsDocumentos(contratoId) {
    const { ids } = await obterDocumentosContrato(contratoId);
    return ids;
  }

  async function excluirDocumentos(idsArray, contratoId) {
    const ids = unique(
      (idsArray ?? []).filter((id) => isNumericId(String(id))),
    );
    if (!ids.length) {
      trace("info", "Nenhum documento antigo para excluir.", { contratoId });
      return { excluidos: 0 };
    }

    traceStep("7.2", "Excluindo documentos antigos em lote", {
      contratoId,
      ids,
    });
    const csrf = await capturarCsrf(`/contratos/${contratoId}/`);
    const result = await postM2A("/contratos/documentos/excluir_varios/", {
      csrfmiddlewaretoken: csrf,
      ids_excluir: ids.join(","),
    });
    ensureOperationAccepted(result.doc, "exclusão de documentos antigos");
    console.log(`[M2A - OK] ${ids.length} documento(s) antigo(s) excluído(s).`);
    return { excluidos: ids.length };
  }

  async function gerarDocumentosEntidade(contratoId) {
    const url = `/contratos/documentos/utilizar_documentos/${contratoId}/?padrao_sistema=false`;
    traceStep("7.3", "Gerando documentos da entidade", { contratoId, url });
    const result = await requestM2A("GET", url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    ensureOperationAccepted(result.doc, "geração de documentos da entidade");
    console.log("[M2A - OK] Requisição de geração dos documentos concluída.", {
      status: result.response.status,
      finalUrl: result.response.url,
    });
    return result;
  }

  async function atualizarDatasDocumentos(contratoId, dataContrato) {
    if (!dataContrato) {
      throw new Error("Data do contrato ausente para atualizar documentos.");
    }

    traceStep("7.4", "Atualizando datas dos documentos gerados", {
      contratoId,
      dataContrato,
    });
    const { ids, metadados } = await obterDocumentosContrato(contratoId);
    if (!ids.length) {
      throw new Error(
        "Nenhum documento foi encontrado após a geração dos documentos da entidade.",
      );
    }

    const csrf = await capturarCsrf(`/contratos/${contratoId}/`);
    const dataDiaUtilAnterior = obterDiaUtilAnterior(dataContrato);
    let atualizados = 0;
    for (const [index, docId] of ids.entries()) {
      const url = `/contratos/documentos/atualizar_data/${docId}/`;
      const dataDocumento = index < 2 ? dataDiaUtilAnterior : dataContrato;
      traceStep("7.4", "Atualizando data de documento", {
        contratoId,
        docId,
        dataContrato,
        dataDocumento,
        url,
      });
      const result = await postM2A(url, {
        csrfmiddlewaretoken: csrf,
        data: dataDocumento,
      });
      ensureOperationAccepted(
        result.doc,
        `atualização da data do documento ${docId}`,
      );
      console.log(
        `[M2A - OK] Documento ${docId} atualizado para ${dataDocumento}.`,
      );
      atualizados += 1;
      await sleep(DOC_POST_PAUSE_MS);
    }

    return { atualizados, documentosM2A: metadados };
  }

  async function configurarDocumentos(contratoId, dataContrato) {
    console.log(
      `[M2A - DOC] Iniciando configuração de documentos para o contrato ${contratoId}`,
    );
    const docsAntigos = await obterIdsDocumentos(contratoId);
    await excluirDocumentos(docsAntigos, contratoId);
    await gerarDocumentosEntidade(contratoId);
    await sleep(DOC_GENERATE_SETTLE_MS);
    const result = await atualizarDatasDocumentos(contratoId, dataContrato);
    console.log(
      "[M2A - OK] Documentos da entidade gerados e datas atualizadas.",
    );
    return result;
  }

  // --- MÓDULO 8: ORQUESTRADOR ---
  async function processarContratoCompleto(payload) {
    const {
      contratoId,
      m2aProcessoUrl,
      m2aAtaId,
      contrato,
      dadosM2A,
      itens,
      dadosDotacao,
    } = payload;
    const localContratoId = contratoId; // ID do Supabase
    const numeroContrato = contrato.numero_contrato || contrato.numero;

    console.group(`[M2A - DOC] Processando Contrato: ${numeroContrato}`);
    console.info("[M2A Diagnóstico] Payload recebido:", {
      contratoId,
      m2aProcessoUrl,
      m2aAtaId,
      contrato,
      dadosM2A,
      itens,
      dadosDotacao,
      hrefAtual: location.href,
    });

    try {
      // Validação de sessão
      if (isLoginPage())
        throw new Error("SESSAO_EXPIRADA: Usuário não logado na M2A.");
      assertNumericId("m2aAtaId", String(m2aAtaId));
      assertNumericId(
        "dadosM2A.unidade_gestora",
        String(dadosM2A.unidade_gestora),
      );
      assertNumericId("dadosM2A.fiscal_id", String(dadosM2A.fiscal_id));
      assertNumericId("dadosM2A.gestor_id", String(dadosM2A.gestor_id));
      assertNumericId("dadosM2A.preposto_id", dadosM2A.preposto_id, false);

      let m2aInternalId = contrato.m2a_contrato_id || null;

      // Etapa 1: Retomar contrato existente quando possível
      progress(
        localContratoId,
        "recuperar_id",
        "Verificando se o contrato já existe na M2A...",
      );
      if (!m2aInternalId) {
        try {
          m2aInternalId = await buscarIdContratoPorNumero(
            m2aAtaId,
            numeroContrato,
            m2aProcessoUrl,
          );
          trace("info", "Contrato existente localizado antes da criação.", {
            m2aInternalId,
          });
        } catch (error) {
          trace(
            "info",
            "Contrato ainda não existia na listagem. A criação será executada.",
            error.message,
          );
        }
      }

      // Etapa 2: Criar cabeçalho somente se ainda não existir
      if (!m2aInternalId) {
        progress(
          localContratoId,
          "criar_contrato",
          "Módulo 1: Criando cabeçalho...",
        );
        const cabecalhoPayload = {
          numero: numeroContrato,
          objeto: contrato.objeto,
          data: contrato.data,
          data_fim: contrato.data_fim,
          unidade_gestora: dadosM2A.unidade_gestora,
        };
        const created = await criarCabecalhoContrato(
          m2aAtaId,
          cabecalhoPayload,
        );
        if (!created.ok)
          throw new Error("Falha ao criar cabeçalho do contrato.");
        m2aInternalId =
          created.contratoId ||
          (await buscarIdContratoPorNumero(
            m2aAtaId,
            numeroContrato,
            m2aProcessoUrl,
            { deepSearch: true },
          ));
      }

      if (!m2aInternalId)
        throw new Error("Não foi possível obter o ID interno do contrato.");
      trace("info", "ID interno do contrato definido.", { m2aInternalId });

      // Etapa 3: Vincular Atores
      progress(
        localContratoId,
        "vincular_atores",
        "Módulo 3: Vinculando Fiscal, Gestor e Preposto...",
      );

      // Fiscal
      if (dadosM2A.fiscal_id) {
        await vincularFiscal(m2aInternalId, dadosM2A.fiscal_id, contrato.data);
        console.log("[M2A - OK] Fiscal vinculado.");
      }

      // Gestor
      if (dadosM2A.gestor_id) {
        await vincularGestor(m2aInternalId, dadosM2A.gestor_id, contrato.data);
        console.log("[M2A - OK] Gestor vinculado.");
      }

      const nomePreposto = String(
        dadosM2A.preposto_nome ?? contrato.preposto ?? "",
      ).trim();
      if (!dadosM2A.preposto_id && !nomePreposto) {
        throw new Error(
          "Preposto não informado no payload. Informe o preposto do fornecedor antes de gerar o contrato.",
        );
      }

      // Preposto
      if (dadosM2A.preposto_id || nomePreposto) {
        const prepostoResult = await vincularPreposto(
          m2aInternalId,
          nomePreposto,
          contrato.data,
          dadosM2A.preposto_id,
        );
        if (!prepostoResult) {
          throw new Error("Preposto não foi vinculado ao contrato.");
        }
        console.log("[M2A - OK] Preposto vinculado.");
      }

      // Etapa 4: Adicionar itens da Ata ao contrato
      const itensPayload = itens ?? dadosM2A.itens ?? [];
      progress(
        localContratoId,
        "incluir_itens",
        "Módulo 4: Adicionando itens da Ata ao contrato...",
      );
      await adicionarItensAoContrato(m2aInternalId, itensPayload);

      // Etapa 5: Atualizar as quantidades geradas para cada item
      progress(
        localContratoId,
        "atualizar_quantidades",
        "Módulo 5: Atualizando quantidades dos itens...",
      );
      await atualizarQuantidadesItens(m2aInternalId, itensPayload);

      // Etapa 6: Incluir dotação orçamentária do contrato
      const dotacaoPayload = dadosDotacao ?? dadosM2A.dotacao ?? null;
      progress(
        localContratoId,
        "incluir_dotacoes",
        "Módulo 6: Incluindo dotação orçamentária...",
      );
      await incluirDotacao(m2aInternalId, dotacaoPayload);

      // Etapa 7: Recriar documentos da entidade e ajustar datas
      progress(
        localContratoId,
        "enviar_documentos",
        "Módulo 7: Configurando documentos da entidade...",
      );
      const documentosResult = await configurarDocumentos(
        m2aInternalId,
        contrato.data,
      );

      // Conclusão
      progress(
        localContratoId,
        "concluido",
        "Contrato integrado com itens, dotação, atores e documentos!",
        {
          sucesso: true,
          status: "concluido",
          m2a_contrato_id: m2aInternalId,
          documentosM2A: documentosResult.documentosM2A ?? [],
        },
      );
    } catch (e) {
      console.error("[M2A - ERRO] Erro na automação:", e);
      progress(localContratoId, "erro", e.message, { sucesso: false });
    } finally {
      console.groupEnd();
    }
  }

  window.addEventListener("M2A_RUN", (ev) => {
    const { payload } = ev.detail || {};
    if (payload) {
      if (payload.diagnostico === true) {
        diagnosticarContrato(payload);
        return;
      }
      if (
        payload.tipo === "processo_srp" ||
        payload.acao === "criar_processo_srp" ||
        Array.isArray(payload.listaImportacoes)
      ) {
        orquestrarCriacaoProcesso(payload);
        return;
      }
      // Se o payload for para criação de contrato (contém m2aAtaId e dadosM2A)
      if (payload.m2aAtaId && payload.dadosM2A) {
        processarContratoCompleto(payload);
      } else {
        // Fallback para a lógica antiga de importação, se necessário
        console.warn(
          "[M2A Engine] Comando M2A_RUN recebido sem m2aAtaId. Ignorando ou redirecionando.",
        );
      }
    }
  });
})();
