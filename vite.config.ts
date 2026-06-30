import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const packageJsonPath = path.join(projectRoot, "package.json");

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    unknown
  >;
}

const packageJson = readJsonFile(packageJsonPath);
const appVersion = String(packageJson.version ?? "0.0.0");

type ProjectFileManifestEntry = {
  path: string;
  encoding: "base64";
  content: string;
  size: number;
};

const excludedProjectExportDirs = new Set([
  ".git",
  ".workspace",
  "dist",
  "electron-release",
  "node_modules",
]);

function shouldIncludeInProjectExport(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => excludedProjectExportDirs.has(part))) return false;
  const basename = parts[parts.length - 1] ?? "";
  if (basename === ".env") return false;
  if (basename.startsWith(".env.") && !basename.endsWith(".example")) {
    return false;
  }
  if (basename.endsWith(".local")) return false;
  return true;
}

function collectProjectFiles(dir: string): ProjectFileManifestEntry[] {
  const entries: ProjectFileManifestEntry[] = [];

  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
      if (!shouldIncludeInProjectExport(relativePath)) continue;
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const content = fs.readFileSync(absolutePath);
      entries.push({
        path: relativePath,
        encoding: "base64",
        content: content.toString("base64"),
        size: content.byteLength,
      });
    }
  }

  walk(dir);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

const projectFileManifest = collectProjectFiles(projectRoot);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __EXT_VERSION__: JSON.stringify(appVersion),
    __PROJECT_FILE_MANIFEST__: JSON.stringify(projectFileManifest),
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 3000,
  },
});
