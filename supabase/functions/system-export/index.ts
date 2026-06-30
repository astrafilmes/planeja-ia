import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Grupos por prioridade — pequenos o suficiente para caber em uma execução
// (evita 504). O cliente chama um grupo por vez e monta o ZIP localmente.
const TABLE_GROUPS: Record<string, string[]> = {
  base: [
    "profiles",
    "user_roles",
    "secretarias",
    "secretaria_contatos",
    "fornecedores_prepostos",
    "numeracao",
    "m2a_unidades_gestoras",
    "m2a_servidores",
    "m2a_servidor_unidade",
  ],
  processos: ["processos"],
  contratos: [
    "contratos",
    "contrato_itens",
    "contrato_item_dotacoes",
    "contrato_atores",
    "contrato_documentos",
  ],
  m2a: [
    "m2a_atas",
    "m2a_itens",
    "m2a_contratos_snapshot",
    "m2a_envio_preferencias",
  ],
};

const RESTORE_ORDER = [
  ...TABLE_GROUPS.base,
  ...TABLE_GROUPS.processos,
  ...TABLE_GROUPS.contratos,
  ...TABLE_GROUPS.m2a,
];

// Buckets ignorados na exportação (histórico/anexos pesados que não precisam
// vir no pacote do sistema).
const SKIP_BUCKETS = new Set(["irp-files"]);


const BACKUP_BUCKET = "system-backups";
const BACKUP_OBJECT_PATH = "latest/backup.json";
const BACKUP_META_PATH = "latest/backup-metadata.json";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("BACKUP_CRON_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function isAdmin(userId: string) {
  const { data } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  return Boolean(data);
}

async function canExportDatabase(userId: string) {
  const [{ data: a }, { data: g }] = await Promise.all([
    admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    admin.rpc("has_role", { _user_id: userId, _role: "gestor" }),
  ]);
  return Boolean(a || g);
}

async function fetchAllRows(table: string) {
  const rows: unknown[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await admin.from(table).select("*").range(from, to);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function exportTableGroup(group: string) {
  const names = TABLE_GROUPS[group];
  if (!names) throw new Error(`grupo desconhecido: ${group}`);
  const tables: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const table of names) {
    try {
      const rows = await fetchAllRows(table);
      tables[table] = { count: rows.length, rows };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${table}: ${message}`);
      tables[table] = { count: 0, rows: [], error: message };
    }
  }
  return { group, generated_at: new Date().toISOString(), tables, warnings };
}

async function listBucketEntries(bucket: string, prefix = ""): Promise<
  { path: string; size: number }[]
> {
  const out: { path: string; size: number }[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = !item.id && !item.metadata;
    if (isFolder) {
      out.push(...(await listBucketEntries(bucket, path)));
    } else {
      const size = Number(
        (item.metadata as { size?: number } | null)?.size ?? 0,
      );
      out.push({ path, size });
    }
  }
  return out;
}

async function downloadStorageBatch(
  bucket: string,
  paths: string[],
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const path of paths) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error) {
      results.push({ path, error: error.message });
      continue;
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    let binary = "";
    for (const b of buf) binary += String.fromCharCode(b);
    results.push({
      path,
      size: buf.byteLength,
      content_base64: btoa(binary),
    });
  }
  return results;
}

async function buildFullDatabaseExport() {
  const tables: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const name of RESTORE_ORDER) {
    try {
      const rows = await fetchAllRows(name);
      tables[name] = { count: rows.length, rows };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      warnings.push(`${name}: ${m}`);
      tables[name] = { count: 0, rows: [], error: m };
    }
  }
  // Storage limit-light: lista apenas, sem conteúdo, para o backup agendado
  // não explodir. Para conteúdo completo, o cliente puxa por bucket via chunk.
  const storage: Record<string, unknown> = {};
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    for (const b of buckets ?? []) {
      if (b.name === BACKUP_BUCKET || SKIP_BUCKETS.has(b.name)) continue;
      try {
        storage[b.name] = await listBucketEntries(b.name);
      } catch (e) {
        storage[b.name] = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  } catch (e) {
    warnings.push(`storage: ${e instanceof Error ? e.message : String(e)}`);
  }
  return {
    generated_at: new Date().toISOString(),
    tables,
    storage,
    restore_order: RESTORE_ORDER,
    warnings,
  };
}

async function ensureBackupBucket() {
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BACKUP_BUCKET)) {
    await admin.storage.createBucket(BACKUP_BUCKET, { public: false });
  }
}

async function uploadBackup(payload: unknown) {
  await ensureBackupBucket();
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const { error } = await admin.storage
    .from(BACKUP_BUCKET)
    .upload(BACKUP_OBJECT_PATH, body, {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;
  const meta = {
    updated_at: new Date().toISOString(),
    size_bytes: body.byteLength,
  };
  await admin.storage
    .from(BACKUP_BUCKET)
    .upload(
      BACKUP_META_PATH,
      new TextEncoder().encode(JSON.stringify(meta)),
      { contentType: "application/json", upsert: true },
    );
  return meta;
}

const DAILY_SCHEDULE = "0 21 * * *";
let cronBootstrapped = false;
async function ensureDailyCron() {
  if (cronBootstrapped || !CRON_SECRET) return;
  try {
    const functionUrl = `${SUPABASE_URL}/functions/v1/system-export`;
    const { error } = await admin.rpc("ensure_daily_backup_cron", {
      p_secret: CRON_SECRET,
      p_function_url: functionUrl,
      p_schedule: DAILY_SCHEDULE,
    });
    if (!error) cronBootstrapped = true;
  } catch (_) {
    /* ignore */
  }
}
ensureDailyCron();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  await ensureDailyCron();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const action = String(body.action ?? "");

  // Cron — autenticado por segredo compartilhado
  if (action === "store-backup") {
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!CRON_SECRET || provided !== CRON_SECRET)
      return json({ error: "forbidden" }, 403);
    try {
      const payload = await buildFullDatabaseExport();
      const meta = await uploadBackup(payload);
      return json({ ok: true, ...meta });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);

  // Lista metadados (grupos disponíveis e buckets) — chamada inicial leve
  if (action === "export-manifest") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    const { data: buckets } = await admin.storage.listBuckets();
    const storage_buckets = (buckets ?? [])
      .filter((b) => b.name !== BACKUP_BUCKET)
      .map((b) => b.name);
    return json({
      table_groups: Object.keys(TABLE_GROUPS),
      table_groups_detail: TABLE_GROUPS,
      restore_order: RESTORE_ORDER,
      storage_buckets,
    });
  }

  // Exporta UM grupo de tabelas por chamada (rápido, sem timeout)
  if (action === "export-table-group") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    const group = String(body.group ?? "");
    try {
      return json(await exportTableGroup(group));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  // Lista arquivos de um bucket (apenas paths + tamanhos)
  if (action === "list-storage-bucket") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    const bucket = String(body.bucket ?? "");
    if (!bucket) return json({ error: "bucket obrigatório" }, 400);
    try {
      const entries = await listBucketEntries(bucket);
      return json({ bucket, entries });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  // Baixa um lote de arquivos (cliente fatia a lista para evitar timeout)
  if (action === "download-storage-batch") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    const bucket = String(body.bucket ?? "");
    const paths = Array.isArray(body.paths) ? (body.paths as string[]) : [];
    if (!bucket || paths.length === 0)
      return json({ error: "bucket e paths obrigatórios" }, 400);
    if (paths.length > 25)
      return json({ error: "máximo 25 arquivos por lote" }, 400);
    try {
      const files = await downloadStorageBatch(bucket, paths);
      return json({ bucket, files });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // Compat: exportação completa em uma chamada (pode estourar timeout em
  // bases grandes — preferir os chunks acima).
  if (action === "database-export") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    return json(await buildFullDatabaseExport());
  }

  if (action === "latest-backup-info") {
    if (!(await canExportDatabase(user.id)))
      return json({ error: "forbidden" }, 403);
    const { data, error } = await admin.storage
      .from(BACKUP_BUCKET)
      .download(BACKUP_META_PATH);
    if (error) return json({ available: false });
    const text = await data.text();
    return json({ available: true, ...JSON.parse(text) });
  }

  if (action === "setup-daily-backup") {
    if (!(await isAdmin(user.id)))
      return json({ error: "forbidden" }, 403);
    if (!CRON_SECRET)
      return json({ error: "BACKUP_CRON_SECRET não configurado." }, 500);
    await ensureBackupBucket();
    const functionUrl = `${SUPABASE_URL}/functions/v1/system-export`;
    const { error } = await admin.rpc("setup_daily_backup_cron", {
      p_secret: CRON_SECRET,
      p_function_url: functionUrl,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, scheduled_at: "21:00 UTC (18h Brasília)" });
  }

  return json({ error: "unknown action" }, 400);
});
