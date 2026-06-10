#!/usr/bin/env node
// Testa o worker localmente. Uso:
//   SHARED_SECRET=xxx node scripts/test-call.js /auth/refresh POST
//   SHARED_SECRET=xxx node scripts/test-call.js "/numeracao?ano=2025&secretarias=SECAD"
import { createHmac } from "node:crypto";

const secret = process.env.SHARED_SECRET;
const base = process.env.WORKER_URL || "http://localhost:8080";
const path = process.argv[2] || "/auth/status";
const method = (process.argv[3] || "GET").toUpperCase();
const body = process.argv[4] || "";

if (!secret) {
  console.error("Defina SHARED_SECRET (o mesmo do .env).");
  process.exit(1);
}

const ts = String(Date.now());
const signature = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

const res = await fetch(base + path, {
  method,
  headers: {
    "X-Timestamp": ts,
    "X-Signature": signature,
    ...(body ? { "Content-Type": "application/json" } : {}),
  },
  body: body || undefined,
});
console.log("HTTP", res.status);
console.log(await res.text());
