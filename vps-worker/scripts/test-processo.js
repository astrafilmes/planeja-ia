#!/usr/bin/env node
// Sincroniza um processo do M2A (espelhando o que a extensão faz ao abrir
// a página do processo) e imprime atas, itens, contratos existentes e o
// resumo com o último número usado por secretaria.
//
// Uso:
//   node vps-worker/scripts/test-processo.js <url-ou-id>
//   node vps-worker/scripts/test-processo.js https://m2a.../processo_administrativo/68973/
//   node vps-worker/scripts/test-processo.js 68973
//
// SHARED_SECRET e WORKER_URL são lidos automaticamente de vps-worker/.env.

import { createHmac } from "node:crypto";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const secret = process.env.SHARED_SECRET;
const base = process.env.WORKER_URL || "http://localhost:8080";
const input = process.argv[2];

if (!secret) {
  console.error("SHARED_SECRET ausente em vps-worker/.env");
  process.exit(1);
}
if (!input) {
  console.error("Uso: node scripts/test-processo.js <url-ou-id-do-processo>");
  process.exit(1);
}

const body = JSON.stringify({ m2a_processo_url: input });
const ts = String(Date.now());
const signature = createHmac("sha256", secret)
  .update(`${ts}.${body}`)
  .digest("hex");

const res = await fetch(`${base}/processos/sync`, {
  method: "POST",
  headers: {
    "X-Timestamp": ts,
    "X-Signature": signature,
    "Content-Type": "application/json",
  },
  body,
});

const text = await res.text();
console.log("HTTP", res.status);
try {
  const json = JSON.parse(text);
  if (!res.ok) {
    console.error(json);
    process.exit(1);
  }
  console.log(`\nProcesso ${json.processo_id}`);
  console.log(`  atas:      ${json.resumo?.qtd_atas ?? 0}`);
  console.log(`  itens:     ${json.resumo?.qtd_itens ?? 0}`);
  console.log(`  contratos: ${json.resumo?.qtd_contratos ?? 0}`);
  console.log("\nÚltimo número por secretaria:");
  for (const [sec, n] of Object.entries(
    json.resumo?.ultimo_numero_por_secretaria ?? {},
  )) {
    console.log(`  ${sec}: ${n}`);
  }
  console.log("\nAtas:");
  for (const a of json.atas ?? []) {
    console.log(
      `  - ${a.numero_ata}  id_ata=${a.id_ata}  fornecedor=${a.fornecedor?.nome || "?"}`,
    );
  }
  console.log("\nContratos existentes:");
  for (const c of json.contratos_existentes ?? []) {
    console.log(
      `  - ${c.numero_contrato}  id=${c.id_contrato_m2a}  ata=${c.id_ata}  sec=${c.secretaria_nome || "?"}`,
    );
  }
  console.log(`\n(${(json.itens ?? []).length} itens omitidos — use jq para inspecionar.)`);
} catch {
  console.log(text);
}
