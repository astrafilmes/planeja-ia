// Rotas de catálogos auxiliares para o pipeline SRP.
import {
  listarOrgaosEUnidadesOrcamentarias,
  listarAgentesPlanejamento,
} from "../m2a/catalogos-srp.js";

export async function catalogosSrpRoutes(app) {
  // GET ALL: órgãos + unidades orçamentárias (uma única chamada ao M2A).
  app.get("/catalogos/srp/unidades-orcamentarias", async (_req, reply) => {
    try {
      const data = await listarOrgaosEUnidadesOrcamentarias();
      return reply.send({ ok: true, ...data });
    } catch (err) {
      app.log.error({ err }, "Falha sync UOs");
      return reply.code(500).send({ error: String(err?.message ?? err) });
    }
  });

  // GET por UO: agentes de planejamento
  app.get("/catalogos/srp/agentes-planejamento", async (req, reply) => {
    const { unidade_pk, data_referencia, funcao } = req.query || {};
    if (!unidade_pk || !data_referencia) {
      return reply
        .code(400)
        .send({ error: "unidade_pk e data_referencia obrigatórios" });
    }
    try {
      const agentes = await listarAgentesPlanejamento({
        unidadePk: unidade_pk,
        dataReferencia: data_referencia,
        funcao: funcao ?? 7,
      });
      return reply.send({ ok: true, agentes });
    } catch (err) {
      app.log.error({ err }, "Falha agentes planejamento");
      return reply.code(500).send({ error: String(err?.message ?? err) });
    }
  });
}
