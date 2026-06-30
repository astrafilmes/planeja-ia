import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

type ProjectFileManifestEntry = {
  path: string;
  encoding: "base64";
  content: string;
  size: number;
};

type DatabaseTableBackup = {
  rows?: unknown[];
  count?: number;
  error?: string;
};

type DatabaseExport = {
  generated_at?: string;
  tables?: Record<string, DatabaseTableBackup>;
  storage?: Record<string, unknown>;
  restore_order?: string[];
  warnings?: string[];
};

const PROJECT_FILES = __PROJECT_FILE_MANIFEST__ as ProjectFileManifestEntry[];

function nowIso() {
  return new Date().toISOString();
}

function safeFilenameTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function fetchDatabaseExport(): Promise<DatabaseExport> {
  const { data, error } = await supabase.functions.invoke<DatabaseExport>(
    "system-export",
    { body: { action: "database-export" } },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Backup do banco retornou vazio.");
  return data;
}

export async function setupDailyBackup() {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    scheduled_at?: string;
  }>("system-export", { body: { action: "setup-daily-backup" } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getLatestBackupInfo() {
  const { data, error } = await supabase.functions.invoke<{
    available: boolean;
    updated_at?: string;
    size_bytes?: number;
  }>("system-export", { body: { action: "latest-backup-info" } });
  if (error) throw new Error(error.message);
  return data;
}

function createRestoreScript() {
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const backupPath = process.argv[2] || path.join("database", "database-backup.json");
const raw = await fs.readFile(backupPath, "utf8");
const backup = JSON.parse(raw);

const backendUrl = process.env.BACKEND_URL || process.env.VITE_SUPABASE_URL;
const backendKey = process.env.BACKEND_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!backendUrl || !backendKey) {
  console.log("Backup lido com sucesso, mas BACKEND_URL/BACKEND_SERVICE_KEY não foram definidos.");
  process.exit(0);
}

const client = createClient(backendUrl, backendKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = backup.tables || {};
const order = backup.restore_order || Object.keys(tables);

for (const table of order) {
  const rows = tables[table]?.rows || [];
  if (!rows.length) { console.log(\`- \${table}: vazio\`); continue; }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await client.from(table).upsert(chunk);
    if (error) throw new Error(\`Falha ao sincronizar \${table}: \${error.message}\`);
  }
  console.log(\`- \${table}: \${rows.length} linha(s) sincronizadas\`);
}

console.log("Sincronização concluída.");
`;
}

function createReadme() {
  return `PLANEJA-IA — execução em outra IDE

1. Extraia este pacote em uma pasta limpa.
2. Abra a pasta no VS Code.
3. Instale dependências: bun install
4. Configure variáveis de ambiente do backend.
5. Rode: bun run dev

Sincronizar dados:
  node tools/sync-database-from-backup.mjs database/database-backup.json
`;
}

function createReport(database: DatabaseExport | null, databaseError?: string) {
  const totalBytes = PROJECT_FILES.reduce((sum, file) => sum + file.size, 0);
  const tableLines = database?.tables
    ? Object.entries(database.tables).map(([name, table]) => {
        if (table.error) return `- ${name}: erro (${table.error})`;
        return `- ${name}: ${table.count ?? table.rows?.length ?? 0} linha(s)`;
      })
    : [];

  return `RELATÓRIO DE EXPORTAÇÃO DO SISTEMA

Gerado em: ${nowIso()}
Versão do sistema: ${__APP_VERSION__}
Arquivos do projeto: ${PROJECT_FILES.length}
Tamanho: ${totalBytes} bytes

Banco de dados:
${databaseError ? `Falha: ${databaseError}` : tableLines.join("\n") || "Sem tabelas."}
`;
}

export async function exportFullSystem() {
  const zip = new JSZip();
  for (const file of PROJECT_FILES) {
    zip.file(file.path, file.content, { base64: true });
  }

  let database: DatabaseExport | null = null;
  let databaseError: string | undefined;
  try {
    database = await fetchDatabaseExport();
    zip.file("database/database-backup.json", JSON.stringify(database, null, 2));
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
    zip.file("database/ERRO_BACKUP.txt", databaseError);
  }

  zip.file("RELATORIO_EXPORTACAO.txt", createReport(database, databaseError));
  zip.file("README-EXECUTAR-EM-IDE.txt", createReadme());
  zip.file("tools/sync-database-from-backup.mjs", createRestoreScript());

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `planeja-ia-export-${safeFilenameTimestamp()}.zip`;
  saveAs(blob, filename);
  await logAudit({
    action: "system_full_export",
    entityType: "system",
    payload: {
      files: PROJECT_FILES.length,
      database_included: Boolean(database),
      database_error: databaseError ?? null,
    },
  });
  return {
    filename,
    files: PROJECT_FILES.length,
    databaseIncluded: Boolean(database),
  };
}
