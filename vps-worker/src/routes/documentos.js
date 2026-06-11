// Rotas de download de documentos do portal M2A.
// Substitui completamente o fluxo da extensão Chrome:
// - source: "m2a"  → baixa do portal autenticado.
// - source: "url"  → encaminha um download de uma URL externa (ex.: signed URL do Storage).
// Quando archive=true OU múltiplos documentos, devolve um .zip; senão devolve o arquivo cru.

import archiver from "archiver";
import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

// Padrões conhecidos / palpites — usados como fallback quando o anchor real
// não puder ser extraído da tabela de documentos do contrato.
const M2A_DOWNLOAD_PATH_FALLBACKS = [
  (id) => `/contratos/documentos/baixar/${id}/`,
  (id) => `/contratos/documentos/download/${id}/`,
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

/** Pesquisa, em um HTML, anchors cujo href referencie o id do documento. */
function harvestHrefsForId($, id, into) {
  const re = new RegExp(`(^|[/=?&])${id}([/?&]|$)`);
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") || "").trim();
    if (!href || href === "#" || href.startsWith("javascript:")) return;
    if (!re.test(href)) return;
    if (/excluir|editar|atualizar|deletar/i.test(href)) return;
    const title = (
      $(a).attr("title") ||
      $(a).attr("data-original-title") ||
      $(a).text() ||
      ""
    ).toLowerCase();
    const cls = ($(a).attr("class") || "").toLowerCase();
    let score = 1;
    if (/baixar|download|visualizar|imprimir|pdf|arquivo/i.test(href)) score += 6;
    if (/baixar|download|visualizar|imprimir|pdf|arquivo/.test(title)) score += 3;
    if (/baixar|download|visualizar|imprimir|pdf|arquivo/.test(cls)) score += 2;
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
      for (const id of ids) harvestHrefsForId($, id, candidatesById.get(id));
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

async function tryDownload(path) {
  const r = await m2a.request("GET", path, { responseType: "arraybuffer" });
  return r;
}

async function fetchFromM2A(id, hrefHint, log) {
  const tried = [];
  // 1) anchor real, se descoberto.
  if (hrefHint) {
    try {
      const r = await tryDownload(hrefHint);
      tried.push(`${hrefHint} → ${r.status} ${r.contentType || ""}`);
      if (r.status >= 200 && r.status < 300 && looksLikeBinary(r)) return r;
    } catch (err) {
      tried.push(`${hrefHint} → ERR ${err.message}`);
    }
  }
  // 2) palpites conhecidos.
  for (const buildPath of M2A_DOWNLOAD_PATH_FALLBACKS) {
    const path = buildPath(id);
    if (path === hrefHint) continue;
    try {
      const r = await tryDownload(path);
      tried.push(`${path} → ${r.status} ${r.contentType || ""}`);
      if (r.status >= 200 && r.status < 300 && looksLikeBinary(r)) return r;
    } catch (err) {
      tried.push(`${path} → ERR ${err.message}`);
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
        });
      } catch (err) {
        out.push({ path, error: err.message });
      }
    }
    return reply.send({ contratoId, id, resultados: out });
  });
}
