import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import fs from "fs";
import path from "path";

const projectRoot = path.resolve(process.cwd());
const packageJsonPath = path.join(projectRoot, "package.json");
const extensionManifestPath = path.join(
  projectRoot,
  "m2a-extension",
  "manifest.json",
);

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    unknown
  >;
}

const packageJson = readJsonFile(packageJsonPath);
const extensionManifest = readJsonFile(extensionManifestPath);
const appVersion = String(packageJson.version ?? "0.0.0");
const extensionVersion = String(extensionManifest.version ?? "0.0.0");

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __EXT_VERSION__: JSON.stringify(extensionVersion),
  },
  plugins: [
    tanstackStart({ server: { entry: "./src/server.ts" } }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 3000,
  },
});
