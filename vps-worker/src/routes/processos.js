import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

/**
 * GET /processos/:id
 * Stub inicial: baixa a página do processo e lista as atas vinculadas.
 * A extração detalhada (itens, dotações) deve ser portada de
 * m2a-extension/engine/processo_scraper.js conforme necessário.
 */
export async function processosRoutes(app) {
  app.get("/processos/:id", async (req, reply) => {
    const id = String(req.params.id || "").trim();
    if (!id) return reply.code(400).send({ error: "id obrigatório" });

    const r = await m2a.get(`/processos/${encodeURIComponent(id)}/`);
    if (r.status >= 400) {
      return reply.code(r.status).send({ error: `M2A respondeu ${r.status}` });
    }

    const $ = cheerio.load(r.html);
    const atas = [];
    const seen = new Set();
    $('a[href*="/ata_registro_precos/"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/\/ata_registro_precos\/(\d+)\/?/);
      if (!m) return;
      const ataId = m[1];
      if (seen.has(ataId)) return;
      seen.add(ataId);
      const tr = $(el).closest("tr");
      const cellTxt = tr.text();
      const cnpjMatch = cellTxt.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
      const numero = $(el).find("span").first().text().trim() || $(el).text().trim();
      atas.push({
        id_ata: ataId,
        numero_ata: numero || `ATA-${ataId}`,
        cnpj: cnpjMatch ? cnpjMatch[0] : null,
      });
    });

    return { processo_id: id, atas };
  });

  /**
   * GET /processos/:id/atas/:ataId/itens
   * Lista itens da ata (até 1000 por página).
   */
  app.get("/processos/:id/atas/:ataId/itens", async (req, reply) => {
    const ataId = String(req.params.ataId || "").trim();
    if (!ataId) return reply.code(400).send({ error: "ataId obrigatório" });

    const r = await m2a.get(
      `/ata_registro_precos/itens/tabela/${encodeURIComponent(ataId)}?page_size=1000`,
    );
    if (r.status >= 400) {
      return reply.code(r.status).send({ error: `M2A respondeu ${r.status}` });
    }
    const $ = cheerio.load(r.html);
    const itens = [];
    $("table tbody tr").each((_, tr) => {
      const cells = $(tr)
        .find("td")
        .map((__, td) => $(td).text().trim().replace(/\s+/g, " "))
        .get();
      if (cells.length) itens.push(cells);
    });
    return { id_ata: ataId, linhas: itens };
  });
}
