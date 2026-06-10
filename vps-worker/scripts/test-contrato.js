#!/usr/bin/env node
// Smoke test do streaming SSE do worker.
// Uso: node scripts/test-contrato.js < payload.json
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const secret = process.env.SHARED_SECRET;
const base = process.env.WORKER_URL || "http://localhost:8080";
const path = process.argv[2] || "/contratos/processar";

if (!secret) {
  console.error("Defina SHARED_SECRET.");
  process.exit(1);
}

const body = readFileSync(0, "utf8") || "{}";
const ts = String(Date.now());
const signature = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

const res = await fetch(base + path, {
  method: "POST",
  headers: {
    "X-Timestamp": ts,
    "X-Signature": signature,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body,
});

console.log("HTTP", res.status);
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n\n")) >= 0) {
    const chunk = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    process.stdout.write(chunk + "\n---\n");
  }
}
if (buf.trim()) process.stdout.write(buf);
