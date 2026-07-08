// Rotas de consulta e ajuste de atas de registro de preço.
import {
  listarParticipantesAta,
  garantirParticipantes,
} from "../m2a/atas-participantes.js";
import { cotaParticipantesAta } from "../m2a/atas-participantes-itens.js";
import { consumoDaAta } from "../m2a/atas-consumo.js";
import {
  saldosPorSecretaria,
  invalidateSaldoAtaCache,
} from "../m2a/atas-saldos-por-secretaria.js";
import { m2a } from "../m2a-client.js";

function validarAtaId(ataId, reply) {
  if (!/^\d+$/.test(String(ataId))) {
    reply.code(400).send({ error: "ataId inválido" });
    return false;
  }
  return true;
}

export async function atasRoutes(app) {
  // GET /atas/debug/raw?path=/algum/path — DEV: retorna HTML/JSON bruto para
  // inspecionar seletores do M2A.
  app.get("/atas/debug/raw", async (req, reply) => {
    const raw = String(req.query?.path || "");
    if (!raw.startsWith("/")) {
      return reply.code(400).send({ error: "path deve começar com /" });
    }
    try {
      const r = await m2a.get(raw, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json,text/html,*/*",
        },
      });
      const body = r.html || "";
      return {
        status: r.status,
        finalUrl: r.finalUrl,
        contentType: r.contentType,
        bytes: body.length,
        snippet: body.slice(0, 8000),
      };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /atas/:ataId/participantes — status (incluído sim/não) dos participantes.
  app.get("/atas/:ataId/participantes", async (req, reply) => {
    const { ataId } = req.params;
    if (!validarAtaId(ataId, reply)) return;
    try {
      const participantes = await listarParticipantesAta(ataId);
      return { ataId, participantes };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /atas/:ataId/participantes-itens — cota alocada por secretaria+item.
  app.get("/atas/:ataId/participantes-itens", async (req, reply) => {
    const { ataId } = req.params;
    if (!validarAtaId(ataId, reply)) return;
    try {
      return await cotaParticipantesAta(ataId);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /atas/:ataId/consumo — soma de quantidades contratadas por (secretaria, item).
  app.get("/atas/:ataId/consumo", async (req, reply) => {
    const { ataId } = req.params;
    if (!validarAtaId(ataId, reply)) return;
    try {
      return await consumoDaAta(ataId);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // GET /atas/:ataId/saldos-por-secretaria?refresh=1 — cota − consumo.
  app.get("/atas/:ataId/saldos-por-secretaria", async (req, reply) => {
    const { ataId } = req.params;
    if (!validarAtaId(ataId, reply)) return;
    const forceRefresh = String(req.query?.refresh ?? "") === "1";
    try {
      return await saldosPorSecretaria(ataId, { forceRefresh });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /atas/:ataId/participantes/garantir
  app.post("/atas/:ataId/participantes/garantir", async (req, reply) => {
    const { ataId } = req.params;
    if (!validarAtaId(ataId, reply)) return;
    const { data, alvos, ugsDisponiveis } = req.body || {};
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
      invalidateSaldoAtaCache(ataId);
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
