// background.js — Service worker MV3.
// Orquestra duas operações no portal M2A:
//   1. Envio de contratos (automation_engine.js)
//   2. Sincronização de numeração por secretaria (engine/numeracao_scraper.js)

importScripts("vendor/jszip.min.js");

const sessions = new Map(); // contratoId -> { appTabId, m2aTabId }
const syncSessions = new Map(); // requestId  -> { appTabId, m2aTabId }
const procSyncSessions = new Map(); // requestId  -> { appTabId, m2aTabId }
const processCreationSessions = new Map(); // requestId -> { appTabId, m2aTabId }

const M2A_BASE = "http://precodereferencia.m2atecnologia.com.br/";
const BULK_DOWNLOAD_PAUSE_MS = 500;

async function findOrOpenM2ATab(url, { active = true, navigate = false } = {}) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    console.error("[M2A Background] URL inválida recebida:", url);
    throw new Error(`URL inválida para o portal: ${url}`);
  }

  const origin = new URL(url).origin;
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  if (tabs.length > 0) {
    const tab = tabs[0];
    const update = { active };
    // Se foi pedido para navegar (ex: sync de processo) e a aba não está
    // exatamente na URL alvo, força a navegação.
    if (navigate && tab.url !== url) {
      update.url = url;
    }
    await chrome.tabs.update(tab.id, update);
    if (update.url) await waitForTabComplete(tab.id);
    return tab.id;
  }
  const tab = await chrome.tabs.create({ url, active });
  return tab.id;
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFilename(value) {
  return String(value || "documento")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function isPdfBytes(bytes) {
  if (!bytes || bytes.byteLength < 5) return false;
  const header = String.fromCharCode(...new Uint8Array(bytes).slice(0, 5));
  return header === "%PDF-";
}

function decodeResponseBytes(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function normalizeM2AUrl(value, m2aOrigin) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, m2aOrigin).toString();
  } catch {
    return null;
  }
}

function toFinalPdfUrl(value, id, m2aOrigin) {
  const normalized = normalizeM2AUrl(value, m2aOrigin);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (/visualizar_documento_individual/i.test(url.pathname)) {
      url.searchParams.set("filename", "temp");
      url.searchParams.set("format", "pdf");
      return url.toString();
    }
  } catch {
    return null;
  }

  if (/format=pdf/i.test(normalized) || /\.pdf(?:$|[?#])/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function findPdfUrlInPayload(value, id, m2aOrigin) {
  const queue = [value];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === "string") {
      const normalized = normalizeM2AUrl(current, m2aOrigin);
      if (
        normalized &&
        (/format=pdf/i.test(normalized) ||
          /\.pdf(?:$|[?#])/i.test(normalized) ||
          /visualizar_documento_individual/i.test(normalized))
      ) {
        return toFinalPdfUrl(normalized, id, m2aOrigin);
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === "object") {
      queue.push(...Object.values(current));
    }
  }
  return null;
}

function buildFinalPdfUrl(id, m2aOrigin, filename = "temp") {
  const url = new URL(
    `/contratos/documentos/visualizar_documento_individual/${id}/`,
    m2aOrigin,
  );
  url.searchParams.set("filename", filename || "temp");
  url.searchParams.set("format", "pdf");
  return url.toString();
}

function extractPdfUrlFromNonPdfResponse(text, id, m2aOrigin, responseUrl) {
  try {
    const json = JSON.parse(text);
    const fromJson = findPdfUrlInPayload(json, id, m2aOrigin);
    if (fromJson) return fromJson;

    const filename =
      json.filename ||
      json.file_name ||
      json.nome_arquivo ||
      json.arquivo ||
      json.file;
    if (typeof filename === "string" && filename.trim()) {
      return buildFinalPdfUrl(id, m2aOrigin, filename.trim());
    }
  } catch {
    // A resposta pode ser HTML; tenta extrair link abaixo.
  }

  const link = Array.from(text.matchAll(/href=["']([^"']+)["']/gi))
    .map((match) => match[1])
    .map((href) => toFinalPdfUrl(href, id, m2aOrigin))
    .find(
      (href) =>
        href &&
        (/format=pdf/i.test(href) ||
          /\.pdf(?:$|[?#])/i.test(href) ||
          /visualizar_documento_individual/i.test(href)),
    );
  if (link) return link;

  if (responseUrl && /format=pdf/i.test(responseUrl)) {
    return toFinalPdfUrl(responseUrl, id, m2aOrigin);
  }
  return buildFinalPdfUrl(id, m2aOrigin);
}

async function captureM2ACsrf(m2aTabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    world: "MAIN",
    func: async () => {
      const fromPage = document.querySelector(
        "input[name='csrfmiddlewaretoken']",
      )?.value;
      if (fromPage) return fromPage;
      const fromCookie = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("csrftoken="))
        ?.split("=")[1];
      if (fromCookie) return decodeURIComponent(fromCookie);

      const response = await fetch(location.href, {
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, "text/html");
      return (
        doc.querySelector("input[name='csrfmiddlewaretoken']")?.value || null
      );
    },
  });

  if (!result) throw new Error("Não foi possível renovar o CSRF da M2A.");
  return result;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return `data:${blob.type || "application/pdf"};base64,${btoa(binary)}`;
}

async function downloadBlob(blob, filename) {
  const url = await blobToDataUrl(blob);
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false,
        conflictAction: "uniquify",
      },
      (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(downloadId);
      },
    );
  });
}

function ensurePdfFilename(value, fallback = "documento.pdf") {
  const safe = sanitizeFilename(value || fallback);
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`;
}

function ensureZipFilename(value, fallback = "documentos.zip") {
  const safe = sanitizeFilename(value || fallback);
  return /\.zip$/i.test(safe) ? safe : `${safe}.zip`;
}

function ensureGenericFilename(value, fallback = "arquivo") {
  return sanitizeFilename(value || fallback) || fallback;
}

function uniqueZipName(zip, filename) {
  const safe = ensureGenericFilename(filename);
  const dotIndex = safe.lastIndexOf(".");
  const base = dotIndex > 0 ? safe.slice(0, dotIndex) : safe;
  const ext = dotIndex > 0 ? safe.slice(dotIndex) : "";
  let candidate = safe;
  let index = 2;
  while (zip.file(candidate)) {
    candidate = `${base} (${index})${ext}`;
    index += 1;
  }
  return candidate;
}

function getExternalUrl(documento) {
  const url = String(documento?.url || documento?.signedUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

async function readResponseAsPdfOrUrl(response, id, m2aOrigin) {
  const contentType = response.headers.get("content-type") || "";
  const bytes = await response.arrayBuffer();
  if (/application\/pdf/i.test(contentType) || isPdfBytes(bytes)) {
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      url: null,
      contentType,
    };
  }

  const text = decodeResponseBytes(bytes);
  return {
    blob: null,
    url: extractPdfUrlFromNonPdfResponse(text, id, m2aOrigin, response.url),
    contentType,
    preview: text.replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

async function fetchPdfUrl(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/pdf,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao baixar PDF gerado.`);
  }

  const contentType = response.headers.get("content-type") || "";
  const bytes = await response.arrayBuffer();
  if (/application\/pdf/i.test(contentType) || isPdfBytes(bytes)) {
    return new Blob([bytes], { type: "application/pdf" });
  }

  const preview = decodeResponseBytes(bytes).replace(/\s+/g, " ").trim();
  throw new Error(
    `A M2A não retornou PDF na URL final (${contentType || "sem content-type"}): ${preview.slice(
      0,
      180,
    )}`,
  );
}

async function fetchDocumentoM2APdf(documento, csrf, m2aOrigin) {
  const id = String(documento?.id_m2a ?? documento?.id ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`ID de documento M2A inválido: ${id || "(vazio)"}`);
  }

  const url = `${m2aOrigin}/contratos/documentos/visualizar_documento_individual/${id}/`;
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/pdf,*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-CSRFToken": csrf,
    },
    body: new URLSearchParams({
      csrfmiddlewaretoken: csrf,
      format: "pdf",
      gerar_documento: "true",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao gerar documento ${id}.`);
  }

  const generated = await readResponseAsPdfOrUrl(response, id, m2aOrigin);
  return generated.blob ?? (await fetchPdfUrl(generated.url));
}

async function fetchExternalDocument(documento) {
  const url = getExternalUrl(documento);
  if (!url) throw new Error("URL de documento externo inválida.");

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: documento?.mimeType || "*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao baixar ${documento?.nome}.`);
  }

  return response.blob();
}

async function downloadDocumentoM2A(documento, csrf, m2aOrigin) {
  const blob = await fetchDocumentoM2APdf(documento, csrf, m2aOrigin);
  await downloadBlob(
    blob,
    ensurePdfFilename(documento?.nome || `documento-${documento?.id_m2a}`),
  );
}

async function handleBulkDownload(appTabId, documentos, options = {}) {
  const docs = Array.isArray(documentos) ? documentos : [];
  if (!docs.length) {
    relayToApp(appTabId, {
      type: "M2A_BULK_DOWNLOAD_PROGRESS",
      status: "erro",
      mensagem: "Nenhum documento foi informado para download.",
    });
    return;
  }

  const m2aTabId = await findOrOpenM2ATab(M2A_BASE, {
    active: false,
    navigate: false,
  });
  await waitForTabComplete(m2aTabId);
  const tab = await chrome.tabs.get(m2aTabId);
  const m2aOrigin = new URL(tab.url || M2A_BASE).origin;

  relayToApp(appTabId, {
    type: "M2A_BULK_DOWNLOAD_PROGRESS",
    status: "iniciado",
    total: docs.length,
    baixados: 0,
    arquivoZip: !!options.archive,
  });

  let csrf = await captureM2ACsrf(m2aTabId);
  let baixados = 0;
  const zip = options.archive ? new JSZip() : null;
  for (const documento of docs) {
    try {
      if (zip) {
        const isExternal = !!getExternalUrl(documento);
        const blob = isExternal
          ? await fetchExternalDocument(documento)
          : await fetchDocumentoM2APdf(documento, csrf, m2aOrigin);
        zip.file(
          uniqueZipName(
            zip,
            isExternal
              ? ensureGenericFilename(documento?.nome || "arquivo")
              : ensurePdfFilename(
                  documento?.nome || `documento-${documento?.id_m2a}`,
                ),
          ),
          await blob.arrayBuffer(),
        );
      } else {
        await downloadDocumentoM2A(documento, csrf, m2aOrigin);
      }
    } catch (error) {
      if (/csrf|403/i.test(String(error?.message ?? error))) {
        csrf = await captureM2ACsrf(m2aTabId);
        if (zip) {
          const isExternal = !!getExternalUrl(documento);
          const blob = isExternal
            ? await fetchExternalDocument(documento)
            : await fetchDocumentoM2APdf(documento, csrf, m2aOrigin);
          zip.file(
            uniqueZipName(
              zip,
              isExternal
                ? ensureGenericFilename(documento?.nome || "arquivo")
                : ensurePdfFilename(
                    documento?.nome || `documento-${documento?.id_m2a}`,
                  ),
            ),
            await blob.arrayBuffer(),
          );
        } else {
          await downloadDocumentoM2A(documento, csrf, m2aOrigin);
        }
      } else {
        throw error;
      }
    }
    baixados += 1;
    relayToApp(appTabId, {
      type: "M2A_BULK_DOWNLOAD_PROGRESS",
      status: "progresso",
      total: docs.length,
      baixados,
      documento,
      arquivoZip: !!options.archive,
    });
    await sleep(BULK_DOWNLOAD_PAUSE_MS);
  }

  if (zip) {
    const out = await zip.generateAsync({ type: "blob" });
    await downloadBlob(
      out,
      ensureZipFilename(options.filename, `documentos-m2a-${Date.now()}.zip`),
    );
  }

  relayToApp(appTabId, {
    type: "M2A_BULK_DOWNLOAD_PROGRESS",
    status: "concluido",
    total: docs.length,
    baixados,
    arquivoZip: !!options.archive,
  });
}

async function injectEngine(m2aTabId, payload) {
  console.info("[M2A Background] Injetando automation_engine.js", {
    m2aTabId,
    requestId: payload?.requestId,
    tipo: payload?.tipo,
    contratoId: payload?.contratoId,
    m2aAtaId: payload?.m2aAtaId,
    m2aProcessoUrl: payload?.m2aProcessoUrl,
  });
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    files: ["automation_engine.js"],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    world: "MAIN",
    func: (p) =>
      window.dispatchEvent(new CustomEvent("M2A_RUN", { detail: p })),
    args: [{ payload }],
  });
}

async function injectScraper(m2aTabId, payload) {
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    files: ["engine/numeracao_scraper.js"],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    world: "MAIN",
    func: (p) =>
      window.dispatchEvent(new CustomEvent("M2A_SYNC_RUN", { detail: p })),
    args: [payload],
  });
}

async function injectProcessoScraper(m2aTabId, payload) {
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    files: ["engine/processo_scraper.js"],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId: m2aTabId },
    world: "MAIN",
    func: (p) =>
      window.dispatchEvent(
        new CustomEvent("M2A_SYNC_PROCESSO_RUN", { detail: p }),
      ),
    args: [payload],
  });
}

function relayToApp(tabId, msg) {
  if (!tabId) return;
  console.info("[M2A Background] Relay para app", {
    tabId,
    type: msg?.type,
    id: msg?.requestId ?? msg?.contratoId,
    etapa: msg?.etapa,
    sucesso: msg?.sucesso,
  });
  chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);
}

async function checkM2AStatus() {
  const tabs = await chrome.tabs.query({ url: `${M2A_BASE}*` });
  if (tabs.length === 0)
    return {
      active: false,
      loggedIn: false,
      reason: "Nenhuma aba da M2A aberta",
    };

  const tab = tabs[0];
  // Tenta verificar se está na página de login via injeção rápida
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return (
          /\/login\//i.test(location.pathname) ||
          !!document.querySelector('input[name="password"]')
        );
      },
    });
    return { active: true, loggedIn: !result, tabId: tab.id };
  } catch (e) {
    return { active: true, loggedIn: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  (async () => {
    // NOVO: Verificacao de integridade/status
    if (msg.type === "M2A_CHECK_STATUS") {
      const status = await checkM2AStatus();
      relayToApp(sender.tab?.id, {
        type: "M2A_STATUS_RESULT",
        requestId: msg.payload?.requestId,
        ...status,
      });
      return;
    }

    if (msg.type === "M2A_BULK_DOWNLOAD") {
      const appTabId = sender.tab?.id;
      try {
        await handleBulkDownload(appTabId, msg.documentos, msg.options);
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_BULK_DOWNLOAD_PROGRESS",
          status: "erro",
          mensagem: String(err?.message ?? err),
        });
      }
      return;
    }

    // ===== Envio de contrato (Orquestrador via Fetch API) =====
    if (msg.type === "M2A_DIAGNOSTIC_AUTOMATION") {
      const { payload } = msg;
      const appTabId = sender.tab?.id;
      try {
        console.groupCollapsed(
          "[M2A Background] M2A_DIAGNOSTIC_AUTOMATION recebido",
        );
        console.info("Aba app:", appTabId);
        console.info("Payload:", payload);
        console.groupEnd();
        const m2aTabId = await findOrOpenM2ATab(payload.m2aProcessoUrl, {
          active: true,
          navigate: true,
        });
        await waitForTabComplete(m2aTabId);
        sessions.set(payload.contratoId, { appTabId, m2aTabId });
        await injectEngine(m2aTabId, { ...payload, diagnostico: true });
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_PROGRESS",
          contratoId: payload.contratoId,
          etapa: "erro",
          sucesso: false,
          mensagem: String(err?.message ?? err),
        });
      }
      return;
    }

    if (msg.type === "M2A_START_AUTOMATION") {
      const { payload } = msg;
      const appTabId = sender.tab?.id;
      try {
        console.groupCollapsed(
          "[M2A Background] M2A_START_AUTOMATION recebido",
        );
        console.info("Aba app:", appTabId);
        console.info("Payload:", payload);
        console.groupEnd();
        relayToApp(appTabId, {
          type: "M2A_PROGRESS",
          contratoId: payload.contratoId,
          etapa: "validacao",
          mensagem: "Abrindo portal M2A…",
        });
        const m2aTabId = await findOrOpenM2ATab(payload.m2aProcessoUrl, {
          active: false,
          navigate: true,
        });
        await waitForTabComplete(m2aTabId);
        sessions.set(payload.contratoId, { appTabId, m2aTabId });
        await injectEngine(m2aTabId, payload);
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_PROGRESS",
          contratoId: payload.contratoId,
          etapa: "erro",
          sucesso: false,
          mensagem: String(err?.message ?? err),
        });
      }
      return;
    }

    if (msg.type === "M2A_START_PROCESS_CREATION") {
      const appTabId = sender.tab?.id;
      const requestId =
        msg.payload?.requestId ||
        `processo_srp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        ...msg.payload,
        requestId,
        tipo: "processo_srp",
      };
      try {
        console.groupCollapsed(
          "[M2A Background] M2A_START_PROCESS_CREATION recebido",
        );
        console.info("Aba app:", appTabId);
        console.info("Payload:", payload);
        console.groupEnd();
        relayToApp(appTabId, {
          type: "M2A_PROGRESS",
          requestId,
          scope: "processo_srp",
          etapa: "criar_dfd",
          mensagem: "Abrindo portal M2A...",
          progresso: 3,
        });
        const m2aTabId = await findOrOpenM2ATab(
          payload.m2aBaseUrl || M2A_BASE,
          {
            active: false,
            navigate: false,
          },
        );
        await waitForTabComplete(m2aTabId);
        processCreationSessions.set(requestId, { appTabId, m2aTabId });
        await injectEngine(m2aTabId, payload);
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_PROGRESS",
          requestId,
          scope: "processo_srp",
          etapa: "erro",
          status: "erro",
          sucesso: false,
          mensagem: String(err?.message ?? err),
        });
      }
      return;
    }

    // ===== Sincronização de numeração =====
    if (msg.type === "M2A_SYNC_START") {
      const { payload } = msg;
      const appTabId = sender.tab?.id;
      try {
        const m2aTabId = await findOrOpenM2ATab(M2A_BASE, { active: true });
        await waitForTabComplete(m2aTabId);
        syncSessions.set(payload.requestId, { appTabId, m2aTabId });
        await injectScraper(m2aTabId, payload);
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_SYNC_RESULT",
          requestId: payload.requestId,
          itens: [],
          erro: String(err?.message ?? err),
        });
      }
      return;
    }

    // ===== Sincronização de processo (atas/itens/contratos) =====
    if (msg.type === "M2A_SYNC_PROCESSO_START") {
      const { payload } = msg;
      const appTabId = sender.tab?.id;
      try {
        // Correção: m2aProcessoUrl enviado pelo frontend é camelCase
        const targetUrl = payload.m2aProcessoUrl || payload.m2a_processo_url;
        const m2aTabId = await findOrOpenM2ATab(targetUrl, {
          active: true,
          navigate: true,
        });
        await waitForTabComplete(m2aTabId);
        procSyncSessions.set(payload.requestId, { appTabId, m2aTabId });
        await injectProcessoScraper(m2aTabId, payload);
      } catch (err) {
        relayToApp(appTabId, {
          type: "M2A_SYNC_PROCESSO_COMPLETE",
          requestId: payload.requestId,
          erro: String(err?.message ?? err),
        });
      }
      return;
    }

    // ===== Relay vindo do portal M2A (m2a_bridge) =====
    if (msg.type === "M2A_PROGRESS" && msg.requestId) {
      const ses = processCreationSessions.get(msg.requestId);
      if (ses) {
        relayToApp(ses.appTabId, msg);
        if (
          msg.etapa === "concluido" ||
          msg.etapa === "erro" ||
          msg.status === "concluido" ||
          msg.status === "erro"
        ) {
          processCreationSessions.delete(msg.requestId);
        }
      }
      return;
    }
    if (msg.type === "M2A_PROGRESS" && msg.contratoId) {
      const ses = sessions.get(msg.contratoId);
      if (ses) relayToApp(ses.appTabId, msg);
      return;
    }
    if (msg.type === "M2A_SYNC_PROGRESS" && msg.requestId) {
      const ses = syncSessions.get(msg.requestId);
      if (ses) relayToApp(ses.appTabId, msg);
      return;
    }
    if (msg.type === "M2A_SYNC_RESULT" && msg.requestId) {
      const ses = syncSessions.get(msg.requestId);
      if (ses) {
        relayToApp(ses.appTabId, msg);
        syncSessions.delete(msg.requestId);
      }
      return;
    }
    if (msg.type === "M2A_SYNC_PROCESSO_PROGRESS" && msg.requestId) {
      const ses = procSyncSessions.get(msg.requestId);
      if (ses) relayToApp(ses.appTabId, msg);
      return;
    }
    if (msg.type === "M2A_SYNC_PROCESSO_COMPLETE" && msg.requestId) {
      const ses = procSyncSessions.get(msg.requestId);
      if (ses) {
        relayToApp(ses.appTabId, msg);
        procSyncSessions.delete(msg.requestId);
      }
      return;
    }
  })();
  return true;
});
