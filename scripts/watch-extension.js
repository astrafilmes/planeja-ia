#!/usr/bin/env node

/**
 * Watch script para a extensão M2A
 * Monitora mudanças nos arquivos da extensão e regenera o zip automaticamente
 *
 * Uso:
 *   npm run watch:extension
 *
 * Mantém rodando e regenera o zip a cada mudança nos arquivos
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(projectRoot, "m2a-extension");

console.log("[ICON] Monitorando extensão M2A para mudanças...");
console.log(`   Diretório: ${extensionDir}\n`);

const watchedPatterns = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "automation_engine.js",
  "background.js",
  "app_bridge.js",
  "m2a_bridge.js",
  "engine/**/*.js",
];

let lastBuild = Date.now();
let pendingBuild = false;

function debounce(fn, delay = 500) {
  return function (...args) {
    clearTimeout(debounce.timer);
    debounce.timer = setTimeout(() => fn(...args), delay);
  };
}

function buildExtension() {
  if (pendingBuild) return;
  pendingBuild = true;
  lastBuild = Date.now();

  console.log(`\n[ICON]️  Reconstruindo extensão...`);

  const buildProcess = spawn("node", [
    path.join(__dirname, "build-extension.js"),
  ]);

  buildProcess.on("close", (code) => {
    pendingBuild = false;
    if (code === 0) {
      console.log(
        `[ICON] Extensão reconstruída em ${Date.now() - lastBuild}ms`,
      );
      console.log(`[ICON] Aguardando mudanças...\n`);
    } else {
      console.error(`[ICON] Erro ao reconstruir (código ${code})`);
    }
  });

  buildProcess.stdout.on("data", (data) => {
    console.log(data.toString().trim());
  });

  buildProcess.stderr.on("data", (data) => {
    console.error(data.toString().trim());
  });
}

const debouncedBuild = debounce(buildExtension, 300);

// Monitora o diretório da extensão
fs.watch(extensionDir, { recursive: true }, (eventType, filename) => {
  if (!filename) return;

  // Ignora arquivos temporários e node_modules
  if (
    filename.includes("node_modules") ||
    filename.startsWith(".") ||
    filename.endsWith("~")
  ) {
    return;
  }

  console.log(`[ICON] Mudança detectada: ${filename}`);
  debouncedBuild();
});

// Build inicial
buildExtension();

// Mantém o processo rodando
process.on("SIGINT", () => {
  console.log("\n\n[ICON] Watch encerrado\n");
  process.exit(0);
});
