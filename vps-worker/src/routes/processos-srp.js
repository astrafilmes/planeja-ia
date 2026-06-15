// Rota: criação de Processo Administrativo SRP no portal M2A.
// Resposta em SSE (Server-Sent Events) com progresso por fase.

import { orquestrarCriacaoProcesso } from "../m2a/orquestrador-processo-srp.js";

export async function processosSrpRoutes(app) {
  app.post("/processos/srp/criar", async (req, reply) => {
    const payload = req.body ?? {};
    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.objeto ||
      !Array.isArray(payload.listaImportacoes)
    ) {
      return reply
        .code(400)
        .send({ error: "payload inválido (objeto e listaImportacoes obrigatórios)" });
    }

    // Configura SSE
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
        app.log.warn({ err }, "Falha ao enviar SSE progress");
      }
    };

    try {
      send("start", { mensagem: "Iniciando criação do processo SRP…" });
      const result = await orquestrarCriacaoProcesso(payload, onProgress);
      send("done", { ok: true, ...result });
    } catch (err) {
      app.log.error({ err }, "Falha em orquestrarCriacaoProcesso");
      send("error", { error: String(err?.message ?? err) });
    } finally {
      reply.raw.end();
    }
  });
}
