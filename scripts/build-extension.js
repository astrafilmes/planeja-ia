#!/usr/bin/env node

/**
 * Build script para criar m2a-extension.zip
 *
 * Uso:
 *   node scripts/build-extension.js          # Gera em public/
 *   node scripts/build-extension.js --dist   # Também copia para dist/
 *
 * Integrado no vite.config.ts para rebuild automático durante dev
 */

import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const extensionDir = path.join(projectRoot, "m2a-extension");
const publicDir = path.join(projectRoot, "public");
const distDir = path.join(projectRoot, "dist");

// Arquivos que devem estar no zip
const EXTENSION_FILES = [
  "manifest.json",
  "popup.html",
  "popup.js",
  "automation_engine.js",
  "background.js",
  "app_bridge.js",
  "m2a_bridge.js",
  "vendor/jszip.min.js",
  "engine/numeracao_scraper.js",
  "engine/processo_scraper.js",
];

async function buildExtensionZip(outputPath) {
  const zip = new JSZip();

  for (const file of EXTENSION_FILES) {
    const filePath = path.join(extensionDir, file);

    // Cria diretório se necessário
    if (!fs.existsSync(filePath)) {
      console.warn(`[ICON]️  Arquivo não encontrado: ${file}`);
      continue;
    }

    const fileContent = fs.readFileSync(filePath);
    zip.file(file, fileContent);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(outputPath, buffer);

  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`[ICON] Extensão criada: ${outputPath} (${sizeKB}KB)`);
}

async function main() {
  try {
    const copyToDist = process.argv.includes("--dist");

    // Gera em public/
    const publicZip = path.join(publicDir, "m2a-extension.zip");
    await buildExtensionZip(publicZip);

    // Opcionalmente copia para dist/
    if (copyToDist && fs.existsSync(distDir)) {
      const distZip = path.join(distDir, "m2a-extension.zip");
      fs.copyFileSync(publicZip, distZip);
      console.log(`[ICON] Copiado para: ${distZip}`);

      // Também copia para dist/client/
      const distClientDir = path.join(distDir, "client");
      if (fs.existsSync(distClientDir)) {
        const distClientZip = path.join(distClientDir, "m2a-extension.zip");
        fs.copyFileSync(publicZip, distClientZip);
        console.log(`[ICON] Copiado para: ${distClientZip}`);
      }
    }

    console.log("[ICON] Build da extensão concluído!");
  } catch (error) {
    console.error("[ICON] Erro ao gerar extensão:", error);
    process.exit(1);
  }
}

main();
