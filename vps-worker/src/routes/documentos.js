// Rotas de download de documentos do portal M2A.
// Substitui completamente o fluxo da extensão Chrome:
// - source: "m2a"  → baixa do portal autenticado.
// - source: "url"  → encaminha um download de uma URL externa (ex.: signed URL do Storage).
// Quando archive=true OU múltiplos documentos, devolve um .zip; senão devolve o arquivo cru.

import archiver from "archiver";
import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

// Padrões conhecidos / palpites — usados como fallback quando o anchor real
// não puder ser extraído da tabela de documentos do contrato. A rota
// "configuracao" normalmente é uma página intermediária: o worker abre,
// varre links/forms/scripts e só então baixa o arquivo final.
const M2A_DOWNLOAD_PATH_FALLBACKS = [
  (id) => `/contratos/documentos/configuracao/${id}/`,
  (id) => `/contratos/documentos/configuracao/${id}`,
  (id) => `/contratos/documentos/gerar/${id}/`,
  (id) => `/contratos/documentos/gerar/${id}`,
  (id) => `/contratos/documentos/gerar_documento/${id}/`,
  (id) => `/contratos/documentos/gerar_arquivo/${id}/`,
  (id) => `/contratos/documentos/arquivo/${id}/`,
  (id) => `/contratos/documentos/baixar/${id}/`,
  (id) => `/contratos/documentos/baixar/${id}`,
  (id) => `/contratos/documentos/download/${id}/`,
  (id) => `/contratos/documentos/download/${id}`,
  (id) => `/contratos/documentos/visualizar/${id}/`,
  (id) => `/contratos/documentos/imprimir/${id}/`,
  (id) => `/contratos/documentos/exportar/${id}/`,
  (id) => `/contratos/documentos/gerar_pdf/${id}/`,
  (id) => `/documentos/baixar/${id}/`,
];

function safeName(s) {
  return (
    String(s || "documento")
      .replace(/[\\/:*?"<>|\r\n]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "documento"
  );
}

function extFromContentType(ct) {
  if (!ct) return "";
  const t = ct.split(";")[0].trim().toLowerCase();
  if (t.includes("pdf")) return ".pdf";
  if (t.includes("officedocument.wordprocessingml")) return ".docx";
  if (t.includes("msword")) return ".doc";
  if (t.includes("officedocument.spreadsheetml")) return ".xlsx";
  if (t.includes("ms-excel")) return ".xls";
  if (t.includes("zip")) return ".zip";
  if (t.includes("image/png")) return ".png";
  if (t.includes("image/jpeg")) return ".jpg";
  return "";
}

function filenameFromHeader(headerValue) {
  if (!headerValue) return null;
  const m =
    /filename\*=UTF-8''([^;]+)/i.exec(headerValue) ||
    /filename="?([^";]+)"?/i.exec(headerValue);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function looksLikeBinary(r) {
  if (!r || !r.bytes || r.bytes.length === 0) return false;
  const ct = (r.contentType || "").toLowerCase();
  if (ct && !ct.includes("text/html") && !ct.includes("application/json")) {
    return true;
  }
  // Heurística: HTML curto = página de erro/login; PDF começa com %PDF.
  const head = r.bytes.toString("utf8", 0, Math.min(r.bytes.length, 8));
  if (head.startsWith("%PDF")) return true;
  if (head.startsWith("PK\u0003\u0004")) return true; // zip/docx/xlsx
  return false;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

function cleanPortalPath(raw) {
  let href = decodeEntities(raw)
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim()
    .replace(/^["'`({\[\s]+|["'`)}\]\s]+$/g, "");
  if (!href || href === "#" || /^javascript:/i.test(href)) return null;
  try {
    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href);
      return `${u.pathname}${u.search || ""}`;
    }
  } catch {
    return null;
  }
  if (!href.startsWith("/")) return null;
  return href;
}

function scorePortalPath(path, meta = "") {
  const hay = `${path} ${meta}`.toLowerCase();
  let score = 1;
  if (/baixar|download|arquivo|anexo|media|upload/.test(hay)) score += 10;
  if (/gerar|gerar_arquivo|gerar_documento|pdf|docx|word/.test(hay)) score += 7;
  if (/visualizar|imprimir|configuracao/.test(hay)) score += 4;
  if (/excluir|remover|deletar|editar|atualizar_data/.test(hay)) score -= 20;
  return score;
}

function addDownloadCandidate(into, raw, id, meta = "", method = "GET", body = null) {
  const path = cleanPortalPath(raw);
  if (!path) return;
  const hay = `${path} ${meta}`;
  if (!hay.includes(id) && !/baixar|download|arquivo|anexo|media|upload|gerar|pdf|docx|imprimir|visualizar/i.test(hay)) {
    return;
  }
  const score = scorePortalPath(path, meta);
  if (score < 0) return;
  into.push({ method, path, body, score, meta });
}

function extractDownloadCandidatesFromHtml(html, id, currentPath = "") {
  const $ = cheerio.load(html || "");
  const out = [];
  const attrs = ["href", "src", "data-url", "data-href", "data-download", "data-arquivo", "action", "formaction"];
  $("a, button, iframe, embed, object, form, [data-url], [data-href], [onclick]").each((_, el) => {
    const meta = [
      $(el).attr("title"),
      $(el).attr("data-original-title"),
      $(el).attr("class"),
      $(el).text(),
      $(el).attr("onclick"),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 300);
    for (const attr of attrs) addDownloadCandidate(out, $(el).attr(attr), id, meta);
    const onclick = $(el).attr("onclick") || "";
    for (const m of onclick.matchAll(/['"](\/[^'"]+)['"]/g)) {
      addDownloadCandidate(out, m[1], id, meta);
    }
  });

  $("form").each((_, form) => {
    const action = $(form).attr("action") || currentPath;
    const method = String($(form).attr("method") || "GET").toUpperCase();
    if (method !== "POST") return;
    const payload = new URLSearchParams();
    $(form)
      .find("input, select, textarea")
      .each((__, field) => {
        const name = $(field).attr("name");
        if (!name) return;
        const type = String($(field).attr("type") || "").toLowerCase();
        if ((type === "checkbox" || type === "radio") && !$(field).is("[checked]")) return;
        payload.set(name, $(field).attr("value") || $(field).text() || "");
      });
    const submits = $(form).find("button, input[type='submit'], input[type='button']").toArray();
    const usefulSubmits = submits.filter((btn) => /baixar|download|gerar|imprimir|visualizar|arquivo|pdf|word/i.test(`${$(btn).attr("name") || ""} ${$(btn).attr("value") || ""} ${$(btn).text() || ""} ${$(btn).attr("class") || ""}`));
    const variants = usefulSubmits.length ? usefulSubmits : [null];
    for (const btn of variants) {
      const body = new URLSearchParams(payload);
      let meta = "form";
      if (btn) {
        const name = $(btn).attr("name");
        const value = $(btn).attr("value") || $(btn).text() || "";
        if (name) body.set(name, value);
        meta = `${meta} ${name || ""} ${value}`;
      }
      addDownloadCandidate(out, action, id, meta, "POST", body.toString());
    }
  });

  const raw = decodeEntities(html || "");
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathRe = new RegExp(`(?:https?:\\/\\/[^\\s"'()<>]+|\\/[A-Za-z0-9_./?=&%:-]*${escapedId}[A-Za-z0-9_./?=&%:-]*)`, "g");
  for (const m of raw.matchAll(pathRe)) addDownloadCandidate(out, m[0], id, "raw-html");

  const seen = new Set();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const key = `${c.method}:${c.path}:${c.body || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Pesquisa, em um HTML, anchors cujo href referencie o id do documento. */
function harvestHrefsForId($, id, into) {
  const re = new RegExp(`(^|[/=?&])${id}([/?&]|$)`);
  $("a[href]").each((_, a) => {
    const href = cleanPortalPath($(a).attr("href"));
    if (!href || !re.test(href)) return;
    if (/excluir|editar|atualizar|deletar/i.test(href)) return;
    const title = (
      $(a).attr("title") ||
      $(a).attr("data-original-title") ||
      $(a).text() ||
      ""
    ).toLowerCase();
    const cls = ($(a).attr("class") || "").toLowerCase();
    let score = scorePortalPath(href, `${title} ${cls}`);
    into.push({ href, score });
  });
}

/** Tenta extrair, da página do contrato, o href real para baixar cada documento. */
async function discoverDownloadUrlMap(contratoId, ids, log) {
  const candidatesById = new Map(ids.map((id) => [id, []]));
  const sources = [
    `/contratos/documentos/tabela/${contratoId}/`,
    `/contratos/${contratoId}/`,
    `/contratos/documentos/${contratoId}/`,
    `/contratos/${contratoId}/documentos/`,
  ];
  for (const path of sources) {
    try {
      const r = await m2a.request("GET", path, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!r.html || r.status >= 400) continue;
      const $ = cheerio.load(r.html);
      for (const id of ids) {
        harvestHrefsForId($, id, candidatesById.get(id));
        for (const c of extractDownloadCandidatesFromHtml(r.html, id, path)) {
          candidatesById.get(id).push({ href: c.path, score: c.score });
        }
      }
    } catch (err) {
      log?.warn?.({ err: err.message, path }, "falha ao varrer página em busca de download");
    }
  }
  const map = new Map();
  for (const [id, list] of candidatesById) {
    list.sort((a, b) => b.score - a.score);
    if (list.length) map.set(id, list[0].href);
  }
  log?.info?.(
    {
      contratoId,
      pedidos: ids.length,
      encontrados: map.size,
      amostra: Array.from(map.entries()).slice(0, 3),
    },
    "documentos: discoverDownloadUrlMap",
  );
  return map;
}

async function tryDownload(candidate) {
  const c = typeof candidate === "string" ? { method: "GET", path: candidate } : candidate;
  const headers =
    c.method === "POST"
      ? {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          ...(c.referer ? { Referer: c.referer } : {}),
        }
      : undefined;
  const r = await m2a.request(c.method || "GET", c.path, {
    responseType: "arraybuffer",
    ...(c.body ? { body: c.body } : {}),
    ...(headers ? { headers } : {}),
  });
  return r;
}

async function fetchFromM2A(id, hrefHint, log) {
  const tried = [];
  const queue = [];
  const enqueue = (candidate, referer = null) => {
    const c = typeof candidate === "string" ? { method: "GET", path: candidate } : candidate;
    const path = cleanPortalPath(c.path);
    if (!path) return;
    queue.push({ ...c, path, referer: c.referer || referer || undefined });
  };
  if (hrefHint) enqueue(hrefHint);
  for (const buildPath of M2A_DOWNLOAD_PATH_FALLBACKS) enqueue(buildPath(id));

  const seen = new Set();
  while (queue.length && tried.length < 40) {
    const candidate = queue.shift();
    const key = `${candidate.method || "GET"}:${candidate.path}:${candidate.body || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const r = await tryDownload(candidate);
      tried.push(`${candidate.method || "GET"} ${candidate.path} → ${r.status} ${r.contentType || ""}`);
      if (r.status >= 200 && r.status < 300 && looksLikeBinary(r)) return r;
      if (r.html && /<html|<form|<a\s|data-url|onclick/i.test(r.html)) {
        const nested = extractDownloadCandidatesFromHtml(r.html, id, candidate.path);
        for (const next of nested) enqueue(next, candidate.path);
        if (nested.length) {
          log?.info?.(
            { id, origem: candidate.path, encontrados: nested.length, amostra: nested.slice(0, 5).map((x) => `${x.method || "GET"} ${x.path}`) },
            "documento M2A: candidatos extraídos de página intermediária",
          );
        }
      }
    } catch (err) {
      tried.push(`${candidate.method || "GET"} ${candidate.path} → ERR ${err.message}`);
    }
  }
  log?.warn?.({ id, tried }, "documento M2A: nenhum endpoint retornou binário");
  throw new Error(
    `Não foi possível baixar documento ${id}. Tentativas: ${tried.join(" | ")}`,
  );
}

async function fetchFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    bytes: buf,
    contentType: res.headers.get("content-type") || "application/octet-stream",
    contentDisposition: res.headers.get("content-disposition") || null,
  };
}

async function fetchOne(doc, hrefMap, log) {
  if (doc?.source === "url" || doc?.origem === "url") {
    return fetchFromUrl(doc.url);
  }
  const id = String(doc?.id_m2a ?? doc?.id ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`id_m2a inválido em documento "${doc?.nome ?? "?"}"`);
  }
  return fetchFromM2A(id, hrefMap.get(id) || null, log);
}

/** Pré-resolve, agrupado por contrato_id, o href real de cada documento M2A. */
async function buildHrefMap(documentos, log) {
  const map = new Map();
  const porContrato = new Map();
  for (const d of documentos) {
    if (d?.source !== "m2a") continue;
    const cId = String(d.contrato_id ?? "").trim();
    if (!/^\d+$/.test(cId)) continue;
    if (!porContrato.has(cId)) porContrato.set(cId, []);
    porContrato.get(cId).push(String(d.id_m2a));
  }
  for (const [cId, ids] of porContrato) {
    const m = await discoverDownloadUrlMap(cId, ids, log);
    for (const id of ids) {
      if (m.has(id)) map.set(id, m.get(id));
    }
  }
  return map;
}

export async function documentosRoutes(app) {
  app.post("/documentos/baixar", async (req, reply) => {
    const body = req.body || {};
    const documentos = Array.isArray(body.documentos) ? body.documentos : [];
    if (!documentos.length) {
      return reply.code(400).send({ error: "documentos vazio" });
    }
    const archive = Boolean(body.archive) || documentos.length > 1;
    const filename = safeName(
      body.filename ||
        (archive ? "documentos.zip" : documentos[0]?.nome || "documento"),
    );

    const hrefMap = await buildHrefMap(documentos, app.log);

    if (!archive) {
      const doc = documentos[0];
      try {
        const r = await fetchOne(doc, hrefMap, app.log);
        const headerName =
          filenameFromHeader(r.contentDisposition) ||
          safeName(doc.nome || filename) + extFromContentType(r.contentType);
        reply
          .header("Content-Type", r.contentType || "application/octet-stream")
          .header(
            "Content-Disposition",
            `attachment; filename="${safeName(headerName)}"`,
          );
        return reply.send(r.bytes);
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }

    // ZIP streaming.
    const zip = archiver("zip", { zlib: { level: 6 } });
    reply.raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    zip.pipe(reply.raw);
    zip.on("warning", (err) => app.log.warn({ err }, "archiver warning"));
    zip.on("error", (err) => {
      app.log.error({ err }, "archiver error");
      try {
        reply.raw.end();
      } catch {}
    });

    const used = new Set();
    const safeUnique = (name) => {
      let base = safeName(name);
      let candidate = base;
      let i = 2;
      while (used.has(candidate.toLowerCase())) {
        const dot = base.lastIndexOf(".");
        if (dot > 0) {
          candidate = `${base.slice(0, dot)} (${i})${base.slice(dot)}`;
        } else {
          candidate = `${base} (${i})`;
        }
        i += 1;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    };

    for (const doc of documentos) {
      try {
        const r = await fetchOne(doc, hrefMap, app.log);
        const ext = extFromContentType(r.contentType);
        let nome =
          doc.nome || filenameFromHeader(r.contentDisposition) || "documento";
        if (ext && !nome.toLowerCase().endsWith(ext)) nome += ext;
        zip.append(r.bytes, { name: safeUnique(nome) });
      } catch (err) {
        app.log.warn({ err: err.message, doc }, "falha ao baixar documento");
        zip.append(
          `Falha ao baixar este documento.\nMotivo: ${err.message}\n`,
          { name: safeUnique(`ERRO - ${doc?.nome || "documento"}.txt`) },
        );
      }
    }
    await zip.finalize();
  });

  // Diagnóstico: retorna anchors/iframes/forms encontrados nas páginas do contrato
  // que referenciam o id do documento. Use pra descobrir a URL real do download.
  // POST /documentos/diagnostico  { contrato_id, id_m2a }
  app.post("/documentos/diagnostico", async (req, reply) => {
    const body = req.body || {};
    const contratoId = String(body.contrato_id ?? "").trim();
    const id = String(body.id_m2a ?? "").trim();
    if (!/^\d+$/.test(contratoId) || !/^\d+$/.test(id)) {
      return reply.code(400).send({ error: "contrato_id e id_m2a numéricos são obrigatórios" });
    }
    const paths = [
      `/contratos/${contratoId}/`,
      `/contratos/documentos/tabela/${contratoId}/`,
      `/contratos/documentos/${contratoId}/`,
      `/contratos/${contratoId}/documentos/`,
      `/contratos/documentos/configuracao/${id}/`,
    ];
    const out = [];
    for (const path of paths) {
      try {
        const r = await m2a.request("GET", path, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const $ = cheerio.load(r.html || "");
        const anchors = [];
        const re = new RegExp(`(^|[/=?&])${id}([/?&]|$)`);
        $("a[href]").each((_, a) => {
          const href = ($(a).attr("href") || "").trim();
          if (re.test(href)) {
            anchors.push({
              href,
              title: $(a).attr("title") || null,
              text: $(a).text().replace(/\s+/g, " ").trim().slice(0, 80) || null,
              class: $(a).attr("class") || null,
            });
          }
        });
        // Também captura referências no HTML cru (data-url, onclick, etc.)
        const rawMatches = Array.from(
          new Set(
            (String(r.html || "").match(
              new RegExp(`["'(=\\s](/[^\\s"'()<>]*${id}[^\\s"'()<>]*)`, "g"),
            ) || []).map((m) => m.slice(1)),
          ),
        ).slice(0, 30);
        out.push({
          path,
          status: r.status,
          finalUrl: r.finalUrl,
          contentType: r.contentType,
          bytes: (r.html || "").length,
          anchors,
          rawMatches,
          candidates: extractDownloadCandidatesFromHtml(r.html || "", id, path)
            .slice(0, 20)
            .map((c) => ({ method: c.method, path: c.path, score: c.score, meta: c.meta })),
        });
      } catch (err) {
        out.push({ path, error: err.message });
      }
    }
    return reply.send({ contratoId, id, resultados: out });
  });
}
