#!/usr/bin/env node
// =============================================================================
// Testa o fluxo completo de criação de IRP/SRP no M2A consumindo o SSE
// do endpoint POST /processos/srp/criar.
//
// Loga CADA evento com timestamp, etapa, progresso e payload — útil para
// descobrir até que ponto o cadastro avançou e onde travou.
//
// Uso:
//   node vps-worker/scripts/test-irp-srp.js <payload.json>
//   node vps-worker/scripts/test-irp-srp.js --sample           # gera payload mínimo de exemplo
//   node vps-worker/scripts/test-irp-srp.js --print-sample     # só imprime o payload de exemplo
//
// Variáveis lidas de vps-worker/.env:
//   WORKER_URL         (default http://localhost:8080)
//   SHARED_SECRET      (opcional — só assina se existir, p/ rota protegida)
//
// Saída:
//   - linha por evento SSE com [+Xs] etapa progresso% mensagem
//   - dump JSON de cada payload (truncado a 800 chars)
//   - resumo final com totalItens, totalIntencoes, intencoesOrfas, erros[]
//   - log gravado em vps-worker/logs/irp-test-<timestamp>.log
// =============================================================================

import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const base = (process.env.WORKER_URL || "http://localhost:8080").replace(/\/$/, "");
const secret = process.env.SHARED_SECRET || "";

// ------------ payload de exemplo (mínimo viável p/ não quebrar validação) ----
const SAMPLE_PAYLOAD = {
  objeto: "TESTE IRP — aquisição de material de expediente (registro de preços)",
  data: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
  data_consolidacao: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
  ano_orcamento: new Date().getFullYear(),
  orgao_solicitante: "PREENCHER_orgao_solicitante_id",
  unidade_orcamentaria: "PREENCHER_uo_id",
  unidade_orcamentaria_gerenciadora: "PREENCHER_uo_gerenciadora_id",
  responsavel_dfd: "PREENCHER_responsavel_id",
  comissao_planejamento: "PREENCHER_comissao_id",
  classificacao: "PREENCHER_classificacao_id",
  gerenciadora_numero: 1,
  gerenciadora_chave: "uo:PREENCHER_uo_id",
  itens: [
    {
      descricao: "Papel A4 75g — resma 500 folhas",
      especificacao: "Branco, alcalino, gramatura 75g/m²",
      natureza: "PREENCHER_natureza_id",
      unidade: "RESMA",
      valorReferencia: 25.5,
      quantidades: { 1: 100, 2: 50 },
    },
  ],
  secretariasParticipantes: [
    { numero: 1, sigla: "GER", nome: "Gerenciadora", m2a_orgao_id: "X", m2a_uo_id: "PREENCHER_uo_id" },
    { numero: 2, sigla: "PART", nome: "Participante 1", m2a_orgao_id: "Y", m2a_uo_id: "PREENCHER_uo_participante_id" },
  ],
};

// ------------ args -----------------------------------------------------------
const args = process.argv.slice(2);
if (args[0] === "--print-sample") {
  console.log(JSON.stringify(SAMPLE_PAYLOAD, null, 2));
  process.exit(0);
}

let payload;
if (args[0] === "--sample") {
  payload = SAMPLE_PAYLOAD;
} else if (args[0]) {
  const file = resolve(process.cwd(), args[0]);
  try {
    payload = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Falha ao ler payload ${file}: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error("Uso: node scripts/test-irp-srp.js <payload.json> | --sample | --print-sample");
  process.exit(1);
}

// ------------ log file -------------------------------------------------------
const logsDir = resolve(__dirname, "../logs");
mkdirSync(logsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = resolve(logsDir, `irp-test-${stamp}.log`);
writeFileSync(logFile, `# IRP/SRP test run — ${new Date().toISOString()}\n`);

const t0 = Date.now();
const fmtElapsed = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`.padStart(8);

function log(line) {
  const stampedLine = `[${new Date().toISOString()}] ${line}`;
  console.log(line);
  appendFileSync(logFile, stampedLine + "\n");
}

function trunc(s, n = 800) {
  if (typeof s !== "string") s = JSON.stringify(s);
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + `… (+${s.length - n} chars)` : s;
}

// ------------ request --------------------------------------------------------
const body = JSON.stringify(payload);
const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
if (secret) {
  const ts = String(Date.now());
  headers["X-Timestamp"] = ts;
  headers["X-Signature"] = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

log(`>>> POST ${base}/processos/srp/criar`);
log(`>>> payload: itens=${payload.itens?.length ?? 0}  participantes=${payload.secretariasParticipantes?.length ?? 0}  gerenciadora=${payload.gerenciadora_numero}`);
log(`>>> log file: ${logFile}`);
log("");

const res = await fetch(`${base}/processos/srp/criar`, { method: "POST", headers, body });
log(`<<< HTTP ${res.status} ${res.statusText}`);

if (!res.ok || !res.body) {
  const txt = await res.text().catch(() => "");
  log(`<<< body: ${trunc(txt)}`);
  process.exit(1);
}

// ------------ SSE parser -----------------------------------------------------
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
let lastEtapa = null;
let finalSummary = null;

const etapaCounters = new Map();

function handleEvent(eventName, dataStr) {
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }
  const etapa = data?.etapa || eventName;
  const prog = typeof data?.progresso === "number" ? `${data.progresso.toFixed(0).padStart(3)}%` : "   -";
  const msg = data?.mensagem || data?.error || "";
  etapaCounters.set(etapa, (etapaCounters.get(etapa) || 0) + 1);

  if (eventName === "error") {
    log(`${fmtElapsed()} ❌ ERROR  ${trunc(JSON.stringify(data), 600)}`);
    return;
  }
  if (eventName === "done") {
    finalSummary = data;
    log(`${fmtElapsed()} ✅ DONE   ${trunc(JSON.stringify(data), 1200)}`);
    return;
  }
  if (eventName === "start") {
    log(`${fmtElapsed()} ▶  START  ${msg}`);
    return;
  }

  const arrow = etapa !== lastEtapa ? "→" : " ";
  log(`${fmtElapsed()} ${arrow} ${etapa.padEnd(20)} ${prog}  ${msg}`);
  if (data?.payload && Object.keys(data.payload).length) {
    log(`${" ".repeat(10)}   payload: ${trunc(JSON.stringify(data.payload), 400)}`);
  }
  lastEtapa = etapa;
}

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n\n")) !== -1) {
    const raw = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    let eventName = "message";
    const dataLines = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) handleEvent(eventName, dataLines.join("\n"));
  }
}

// ------------ resumo final ---------------------------------------------------
log("");
log("===== RESUMO =====");
log(`tempo total: ${((Date.now() - t0) / 1000).toFixed(2)}s`);
log(`última etapa observada: ${lastEtapa ?? "(nenhuma)"}`);
log("eventos por etapa:");
for (const [etapa, n] of etapaCounters) log(`  ${etapa.padEnd(22)} ${n}`);
if (finalSummary) {
  log("");
  log(`processoId:        ${finalSummary.processoId}`);
  log(`dfdId:             ${finalSummary.dfdId}`);
  log(`totalItens:        ${finalSummary.totalItens}`);
  log(`totalIntencoes:    ${finalSummary.totalIntencoes}`);
  log(`intencoesOrfas:    ${finalSummary.intencoesOrfas}`);
  log(`justificativa:     ${finalSummary.justificativaGerada ? "OK" : "NÃO"}`);
  log(`erros (${finalSummary.erros?.length ?? 0}):`);
  for (const e of finalSummary.erros ?? []) {
    log(`  - [${e.etapa}] ${e.intencaoId ? `intencao=${e.intencaoId} ` : ""}${e.secretaria ? `sec=${e.secretaria} ` : ""}${e.item ? `item=${e.item} ` : ""}→ ${trunc(e.erro, 300)}`);
  }
} else {
  log("!! Fluxo não chegou ao evento 'done' — verifique o último etapa acima.");
}
log("");
log(`log completo: ${logFile}`);
