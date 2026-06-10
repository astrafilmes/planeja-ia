import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

const MAX_SKEW_MS = 5 * 60 * 1000; // 5 min

/**
 * Plugin Fastify: valida o header X-Signature em toda rota exceto /health.
 * Assinatura esperada: HMAC_SHA256(`${timestamp}.${rawBody}`, SHARED_SECRET) hex.
 */
export async function authPlugin(app) {
  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/health" || req.method === "OPTIONS") return;

    const sig = req.headers["x-signature"];
    const ts = req.headers["x-timestamp"];
    if (typeof sig !== "string" || typeof ts !== "string") {
      return reply.code(401).send({ error: "missing_signature" });
    }

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) {
      return reply.code(401).send({ error: "stale_timestamp" });
    }

    const raw =
      typeof req.body === "string"
        ? req.body
        : req.body
          ? JSON.stringify(req.body)
          : "";
    const expected = createHmac("sha256", config.sharedSecret)
      .update(`${ts}.${raw}`)
      .digest("hex");

    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(401).send({ error: "bad_signature" });
    }
  });
}
