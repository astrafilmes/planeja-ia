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

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __EXT_VERSION__: JSON.stringify(appVersion),
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
