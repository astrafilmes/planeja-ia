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

type TableBackup = { rows?: unknown[]; count?: number; error?: string };

type ExportManifest = {
  table_groups: string[];
  table_groups_detail: Record<string, string[]>;
  restore_order: string[];
  storage_buckets: string[];
};

type TableGroupResponse = {
  group: string;
  tables: Record<string, TableBackup>;
  warnings: string[];
};

type StorageEntry = { path: string; size: number };

const PROJECT_FILES = __PROJECT_FILE_MANIFEST__ as ProjectFileManifestEntry[];

// Ordem de prioridade — primeiro o que importa (cadastros base), depois
// processos, contratos, importações, M2A e por último logs/arquivos pesados.
const PRIORITY_ORDER = [
  "base",
  "processos",
  "contratos",
  "importacao",
  "m2a",
  "logs",
] as const;

const STORAGE_BATCH_SIZE = 10;

function safeFilenameTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("system-export", {
    body,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("resposta vazia da função");
  return data;
}

export async function setupDailyBackup() {
  return invoke<{ ok?: boolean; scheduled_at?: string }>({
    action: "setup-daily-backup",
  });
}

export async function getLatestBackupInfo() {
  return invoke<{ available: boolean; updated_at?: string; size_bytes?: number }>(
    { action: "latest-backup-info" },
  );
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

function createReport(
  database: {
    tables: Record<string, TableBackup>;
    warnings: string[];
  },
  storageStats: { bucket: string; files: number; bytes: number; errors: number }[],
) {
  const totalBytes = PROJECT_FILES.reduce((sum, file) => sum + file.size, 0);
  const tableLines = Object.entries(database.tables).map(([name, table]) => {
    if (table.error) return `- ${name}: erro (${table.error})`;
    return `- ${name}: ${table.count ?? table.rows?.length ?? 0} linha(s)`;
  });
  const storageLines = storageStats.map(
    (s) =>
      `- ${s.bucket}: ${s.files} arquivo(s), ${s.bytes} bytes${s.errors ? `, ${s.errors} erro(s)` : ""}`,
  );

  return `RELATÓRIO DE EXPORTAÇÃO DO SISTEMA

Gerado em: ${new Date().toISOString()}
Versão: ${__APP_VERSION__}
Arquivos do projeto: ${PROJECT_FILES.length} (${totalBytes} bytes)

Banco de dados (por prioridade):
${tableLines.join("\n") || "Sem tabelas."}

Storage:
${storageLines.join("\n") || "Sem buckets."}

Avisos:
${database.warnings.length ? database.warnings.map((w) => `- ${w}`).join("\n") : "Nenhum."}
`;
}

export type ExportProgress = (step: string, current: number, total: number) => void;

export async function exportFullSystem(onProgress?: ExportProgress) {
  const zip = new JSZip();
  for (const file of PROJECT_FILES) {
    zip.file(file.path, file.content, { base64: true });
  }

  // 1) Manifesto leve — descobre grupos e buckets.
  onProgress?.("Preparando manifesto", 0, 1);
  const manifest = await invoke<ExportManifest>({ action: "export-manifest" });

  const orderedGroups = PRIORITY_ORDER.filter((g) =>
    manifest.table_groups.includes(g),
  );
  const extraGroups = manifest.table_groups.filter(
    (g) => !PRIORITY_ORDER.includes(g as (typeof PRIORITY_ORDER)[number]),
  );
  const allGroups = [...orderedGroups, ...extraGroups];

  // 2) Exporta cada grupo de tabelas separadamente.
  const tables: Record<string, TableBackup> = {};
  const warnings: string[] = [];
  let stepIndex = 0;
  const totalSteps = allGroups.length + manifest.storage_buckets.length + 1;

  for (const group of allGroups) {
    stepIndex += 1;
    onProgress?.(`Exportando tabelas: ${group}`, stepIndex, totalSteps);
    try {
      const res = await invoke<TableGroupResponse>({
        action: "export-table-group",
        group,
      });
      Object.assign(tables, res.tables);
      warnings.push(...(res.warnings ?? []));
      zip.file(
        `database/groups/${group}.json`,
        JSON.stringify(res, null, 2),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`grupo ${group}: ${msg}`);
      zip.file(`database/groups/${group}.ERROR.txt`, msg);
    }
  }

  const databaseBackup = {
    generated_at: new Date().toISOString(),
    tables,
    restore_order: manifest.restore_order,
    warnings,
  };
  zip.file("database/database-backup.json", JSON.stringify(databaseBackup, null, 2));

  // 3) Storage por bucket, em lotes pequenos.
  const storageStats: {
    bucket: string;
    files: number;
    bytes: number;
    errors: number;
  }[] = [];
  for (const bucket of manifest.storage_buckets) {
    stepIndex += 1;
    onProgress?.(`Exportando storage: ${bucket}`, stepIndex, totalSteps);
    let files = 0;
    let bytes = 0;
    let errors = 0;
    try {
      const { entries } = await invoke<{ entries: StorageEntry[] }>({
        action: "list-storage-bucket",
        bucket,
      });
      const all = entries ?? [];
      for (let i = 0; i < all.length; i += STORAGE_BATCH_SIZE) {
        const slice = all.slice(i, i + STORAGE_BATCH_SIZE);
        onProgress?.(
          `Storage ${bucket}: ${Math.min(i + STORAGE_BATCH_SIZE, all.length)}/${all.length}`,
          stepIndex,
          totalSteps,
        );
        const { files: batch } = await invoke<{
          files: Array<
            | { path: string; size: number; content_base64: string }
            | { path: string; error: string }
          >;
        }>({
          action: "download-storage-batch",
          bucket,
          paths: slice.map((s) => s.path),
        });
        for (const file of batch) {
          if ("error" in file) {
            errors += 1;
            zip.file(
              `storage/${bucket}/${file.path}.ERROR.txt`,
              file.error,
            );
            continue;
          }
          zip.file(`storage/${bucket}/${file.path}`, file.content_base64, {
            base64: true,
          });
          files += 1;
          bytes += file.size;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`storage/${bucket}: ${msg}`);
      zip.file(`storage/${bucket}.ERROR.txt`, msg);
      errors += 1;
    }
    storageStats.push({ bucket, files, bytes, errors });
  }

  // 4) Relatório, README e script de restauração.
  stepIndex += 1;
  onProgress?.("Montando ZIP", stepIndex, totalSteps);
  zip.file(
    "RELATORIO_EXPORTACAO.txt",
    createReport({ tables, warnings }, storageStats),
  );
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
      table_groups: allGroups,
      storage_stats: storageStats,
      warnings: warnings.length,
    },
  });

  return {
    filename,
    files: PROJECT_FILES.length,
    databaseIncluded: Object.keys(tables).length > 0,
    storageStats,
    warnings,
  };
}
