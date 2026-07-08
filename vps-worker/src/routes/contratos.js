// Rotas de automação de contrato. Streaming via Server-Sent Events.
import { processarContratoCompleto } from "../m2a/orquestrador-contrato.js";
import { diagnosticarContrato } from "../m2a/contrato.js";

function sseInit(reply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}
function sseSend(reply, event, data) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function contratosRoutes(app) {
  // POST /contratos/processar — SSE
  app.post("/contratos/processar", async (req, reply) => {
    const payload = req.body || {};
    if (!payload?.contrato || !payload?.dadosM2A || !payload?.m2aAtaId) {
      return reply
        .code(400)
        .send({ error: "payload incompleto (contrato, dadosM2A, m2aAtaId obrigatórios)" });
    }
    sseInit(reply);
    const onProgress = (e) => sseSend(reply, "progress", e);
    try {
      const result = await processarContratoCompleto(payload, onProgress);
      sseSend(reply, "done", { ok: true, ...result });
    } catch (err) {
      sseSend(reply, "progress", {
        contratoId: payload.contratoId,
        etapa: "erro",
        mensagem: err.message,
        code: err.code,
        excedentes: err.excedentes,
        sucesso: false,
      });
      sseSend(reply, "error", { ok: false, error: err.message, code: err.code, excedentes: err.excedentes });
    } finally {
      reply.raw.end();
    }
  });

  // POST /contratos/processar/json — variante não-streaming (testes)
  app.post("/contratos/processar/json", async (req, reply) => {
    const payload = req.body || {};
    const events = [];
    try {
      const result = await processarContratoCompleto(payload, (e) => events.push(e));
      return { ok: true, events, ...result };
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: err.code, excedentes: err.excedentes, events });
    }
  });

  // POST /contratos/diagnosticar — apenas leitura, sem gravação
  app.post("/contratos/diagnosticar", async (req, reply) => {
    try {
      const result = await diagnosticarContrato(req.body || {});
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  });
}
