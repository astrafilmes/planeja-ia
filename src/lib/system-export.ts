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

type BackupRecord = {
  id: string;
  createdAt: string;
  database: DatabaseExport;
};

const PROJECT_FILES = __PROJECT_FILE_MANIFEST__ as ProjectFileManifestEntry[];
const BACKUP_DB_NAME = "planeja-ia-system-backups";
const BACKUP_STORE = "databaseBackups";
const BACKUP_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function safeFilenameTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function requestPersistentStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* O navegador pode negar silenciosamente; IndexedDB continua disponível. */
  }
}

function openBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, BACKUP_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        db.createObjectStore(BACKUP_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreOperation<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, mode);
    const request = operation(tx.objectStore(BACKUP_STORE));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function putDatabaseBackup(database: DatabaseExport) {
  if (typeof indexedDB === "undefined") return;
  await requestPersistentStorage();
  const db = await openBackupDb();
  try {
    const createdAt = nowIso();
    const record: BackupRecord = {
      id: `backup-${createdAt}`,
      createdAt,
      database,
    };
    await runStoreOperation(db, "readwrite", (store) => store.put(record));
    localStorage.setItem("planeja-ia:last-database-backup", createdAt);

    const keys = (await runStoreOperation(db, "readonly", (store) =>
      store.getAllKeys(),
    )) as IDBValidKey[];
    const oldKeys = keys.map(String).sort().reverse().slice(5);
    await Promise.all(
      oldKeys.map((key) =>
        runStoreOperation(db, "readwrite", (store) => store.delete(key)),
      ),
    );
  } finally {
    db.close();
  }
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
  console.log("Defina as variáveis do backend do ambiente de destino para sincronizar os dados.");
  process.exit(0);
}

const client = createClient(backendUrl, backendKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = backup.tables || {};
const order = backup.restore_order || Object.keys(tables);

for (const table of order) {
  const rows = tables[table]?.rows || [];
  if (!rows.length) {
    console.log(\`- \${table}: vazio\`);
    continue;
  }
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
2. Abra a pasta no VS Code ou IDE equivalente.
3. Instale as dependências com: bun install
4. Configure as variáveis de ambiente do backend do ambiente de destino.
5. Rode o sistema com: bun run dev

Backup e sincronização de dados:
- O arquivo database/database-backup.json contém as tabelas exportadas.
- Para sincronizar em outro ambiente, configure BACKEND_URL e BACKEND_SERVICE_KEY e rode:
  node tools/sync-database-from-backup.mjs database/database-backup.json

Observação de segurança:
- Arquivos locais de segredo (.env), node_modules, dist e .git não são empacotados.
- Recrie dependências com bun install e configure segredos diretamente no ambiente de destino.
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
Tamanho dos arquivos do projeto: ${totalBytes} bytes

Conteúdo incluído:
- Código-fonte do frontend
- Funções de backend versionadas no projeto
- Migrações do banco de dados
- Scripts auxiliares e worker VPS
- Arquivos públicos e configurações versionadas
- Backup JSON das tabelas do banco ${database ? "incluído" : "não incluído"}

Banco de dados:
${databaseError ? `Falha ao exportar banco: ${databaseError}` : tableLines.join("\n") || "Sem tabelas retornadas."}

Como executar em outra IDE:
1. Extraia o ZIP.
2. Execute bun install.
3. Configure as variáveis do backend no ambiente de destino.
4. Execute bun run dev.

Como sincronizar dados:
1. Configure BACKEND_URL e BACKEND_SERVICE_KEY no terminal do ambiente de destino.
2. Execute: node tools/sync-database-from-backup.mjs database/database-backup.json

Itens intencionalmente não empacotados por segurança ou por serem recriados:
- .env e arquivos locais de segredo
- node_modules
- dist/build gerado
- .git
`;
}

export async function createStartupDatabaseBackup() {
  const database = await fetchDatabaseExport();
  await putDatabaseBackup(database);
  return database;
}

export async function exportFullSystem() {
  const zip = new JSZip();
  for (const file of PROJECT_FILES) {
    zip.file(file.path, file.content, { base64: true });
  }

  let database: DatabaseExport | null = null;
  let databaseError: string | undefined;
  try {
    database = await createStartupDatabaseBackup();
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