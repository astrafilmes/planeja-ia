// Rotas de consulta e ajuste de atas de registro de preço.
import { saldosDaAta } from "../m2a/atas-saldos.js";
import {
  listarParticipantesAta,
  garantirParticipantes,
} from "../m2a/atas-participantes.js";

export async function atasRoutes(app) {
  // GET /atas/:ataId/saldos
  app.get("/atas/:ataId/saldos", async (req, reply) => {
    const { ataId } = req.params;
    if (!/^\d+$/.test(String(ataId))) {
      return reply.code(400).send({ error: "ataId inválido" });
    }
    try {
      const result = await saldosDaAta(ataId);
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /atas/:ataId/participantes
  app.get("/atas/:ataId/participantes", async (req, reply) => {
    const { ataId } = req.params;
    if (!/^\d+$/.test(String(ataId))) {
      return reply.code(400).send({ error: "ataId inválido" });
    }
    try {
      const participantes = await listarParticipantesAta(ataId);
      return { ataId, participantes };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /atas/:ataId/participantes/garantir
  // body: { data: "YYYY-MM-DD", alvos: [{ secretariaId, nome, unidadeGestoraId? }], ugsDisponiveis?: [{id,nome}] }
  app.post("/atas/:ataId/participantes/garantir", async (req, reply) => {
    const { ataId } = req.params;
    const { data, alvos, ugsDisponiveis } = req.body || {};
    if (!/^\d+$/.test(String(ataId))) {
      return reply.code(400).send({ error: "ataId inválido" });
    }
    if (!data || !Array.isArray(alvos) || alvos.length === 0) {
      return reply.code(400).send({ error: "data e alvos[] obrigatórios" });
    }
    try {
      const result = await garantirParticipantes({
        ataId,
        data,
        alvos,
        ugsDisponiveis: ugsDisponiveis || [],
      });
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
