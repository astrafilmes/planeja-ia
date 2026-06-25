// Rota: criação de Processo Administrativo COMUM (não-SRP) no portal M2A.
// SSE — espelha processos-srp.js.

import { orquestrarCriacaoProcessoComum } from "../m2a/orquestrador-processo-comum.js";

export async function processosComumRoutes(app) {
  app.post("/processos/comum/criar", async (req, reply) => {
    const payload = req.body ?? {};
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.objeto ||
      !Array.isArray(payload.itens) ||
      payload.itens.length === 0 ||
      !Array.isArray(payload.secretariasParticipantes) ||
      !payload.secretariasParticipantes.length
    ) {
      return reply.code(400).send({
        error:
          "payload inválido (objeto, itens[] e secretariasParticipantes[] obrigatórios)",
      });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event, data) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onProgress = (evt) => {
      try {
        send("progress", evt);
      } catch (err) {
        app.log.warn({ err }, "Falha ao enviar SSE progress (comum)");
      }
    };

    try {
      send("start", { mensagem: "Iniciando criação do processo comum…" });
      const result = await orquestrarCriacaoProcessoComum(payload, onProgress);
      send("done", { ok: true, ...result });
    } catch (err) {
      app.log.error({ err }, "Falha em orquestrarCriacaoProcessoComum");
      send("error", { error: String(err?.message ?? err) });
    } finally {
      reply.raw.end();
    }
  });
}
