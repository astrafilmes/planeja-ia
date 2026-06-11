// Rotas de download de documentos do portal M2A.
// Substitui completamente o fluxo da extensão Chrome:
// - source: "m2a"  → baixa do portal autenticado.
// - source: "url"  → encaminha um download de uma URL externa (ex.: signed URL do Storage).
// Quando archive=true OU múltiplos documentos, devolve um .zip; senão devolve o arquivo cru.

import archiver from "archiver";
import { m2a } from "../m2a-client.js";

const M2A_DOWNLOAD_PATHS = [
  (id) => `/contratos/documentos/baixar/${id}/`,
  (id) => `/contratos/documentos/download/${id}/`,
  (id) => `/documentos/baixar/${id}/`,
];

function safeName(s) {
  return String(s || "documento")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "documento";
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

async function fetchFromM2A(id) {
  let lastErr = null;
  for (const buildPath of M2A_DOWNLOAD_PATHS) {
    const path = buildPath(id);
    try {
      const r = await m2a.request("GET", path, { responseType: "arraybuffer" });
      if (r.status >= 200 && r.status < 300 && r.bytes && r.bytes.length > 0) {
        return r;
      }
      lastErr = new Error(`HTTP ${r.status} em ${path}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`Não foi possível baixar documento ${id}`);
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

async function fetchOne(doc) {
  if (doc?.source === "url" || doc?.origem === "url") {
    return fetchFromUrl(doc.url);
  }
  const id = String(doc?.id_m2a ?? doc?.id ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`id_m2a inválido em documento "${doc?.nome ?? "?"}"`);
  }
  return fetchFromM2A(id);
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
      body.filename || (archive ? "documentos.zip" : documentos[0]?.nome || "documento"),
    );

    if (!archive) {
      const doc = documentos[0];
      try {
        const r = await fetchOne(doc);
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
        const r = await fetchOne(doc);
        const ext = extFromContentType(r.contentType);
        let nome = doc.nome || filenameFromHeader(r.contentDisposition) || "documento";
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
}
