import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES = [
  "profiles",
  "user_roles",
  "secretarias",
  "secretaria_contatos",
  "fornecedores_prepostos",
  "processos",
  "contratos",
  "contrato_itens",
  "contrato_item_dotacoes",
  "contrato_atores",
  "contrato_documentos",
  "contrato_import_jobs",
  "contrato_import_itens",
  "contrato_import_dotacoes",
  "irp_jobs",
  "irp_job_secretarias",
  "irp_unidades_processamento",
  "m2a_atas",
  "m2a_itens",
  "m2a_contratos_snapshot",
  "m2a_envio_logs",
  "m2a_envio_preferencias",
  "m2a_unidades_gestoras",
  "m2a_servidores",
  "m2a_servidor_unidade",
  "numeracao",
  "app_files",
  "audit_logs",
  "trusted_devices",
] as const;

const RESTORE_ORDER = [
  "profiles",
  "user_roles",
  "secretarias",
  "secretaria_contatos",
  "fornecedores_prepostos",
  "processos",
  "contratos",
  "contrato_itens",
  "contrato_item_dotacoes",
  "contrato_atores",
  "contrato_documentos",
  "contrato_import_jobs",
  "contrato_import_itens",
  "contrato_import_dotacoes",
  "irp_jobs",
  "irp_job_secretarias",
  "irp_unidades_processamento",
  "m2a_atas",
  "m2a_itens",
  "m2a_contratos_snapshot",
  "m2a_envio_preferencias",
  "m2a_unidades_gestoras",
  "m2a_servidores",
  "m2a_servidor_unidade",
  "numeracao",
  "app_files",
  "audit_logs",
  "m2a_envio_logs",
  "trusted_devices",
] as const;

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

async function listBucketFiles(bucket: string, prefix = ""): Promise<unknown[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  const out: unknown[] = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const maybeFolder = !item.id && !item.metadata;
    if (maybeFolder) {
      out.push(...(await listBucketFiles(bucket, path)));
      continue;
    }
    const { data: blob, error: dErr } = await admin.storage
      .from(bucket)
      .download(path);
    if (dErr) {
      out.push({ ...item, path, download_error: dErr.message });
      continue;
    }
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    out.push({
      ...item,
      path,
      size: bytes.byteLength,
      content_base64: btoa(binary),
    });
  }
  return out;
}

async function buildDatabaseExport(opts: { includeStorage: boolean }) {
  const tables: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const table of TABLES) {
    try {
      const rows = await fetchAllRows(table);
      tables[table] = { count: rows.length, rows };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${table}: ${message}`);
      tables[table] = { count: 0, rows: [], error: message };
    }
  }

  const storage: Record<string, unknown> = {};
  if (opts.includeStorage) {
    try {
      const { data: buckets, error } = await admin.storage.listBuckets();
      if (error) throw error;
      for (const bucket of buckets ?? []) {
        if (bucket.name === BACKUP_BUCKET) continue;
        try {
          storage[bucket.name] = await listBucketFiles(bucket.name);
        } catch (bErr) {
          const message = bErr instanceof Error ? bErr.message : String(bErr);
          warnings.push(`storage/${bucket.name}: ${message}`);
          storage[bucket.name] = { error: message };
        }
      }
    } catch (error) {
      warnings.push(
        `storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Daily cron entrypoint — autenticado por header compartilhado.
  if (body.action === "store-backup") {
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return json({ error: "forbidden" }, 403);
    }
    try {
      const payload = await buildDatabaseExport({ includeStorage: true });
      const meta = await uploadBackup(payload);
      return json({ ok: true, ...meta });
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : String(e) },
        500,
      );
    }
  }

  // Demais ações exigem usuário autenticado.
  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);

  if (body.action === "database-export") {
    if (!(await canExportDatabase(user.id))) {
      return json({ error: "Acesso negado para exportação completa." }, 403);
    }
    const payload = await buildDatabaseExport({ includeStorage: true });
    return json(payload);
  }

  if (body.action === "latest-backup-info") {
    if (!(await canExportDatabase(user.id))) return json({ error: "forbidden" }, 403);
    const { data, error } = await admin.storage
      .from(BACKUP_BUCKET)
      .download(BACKUP_META_PATH);
    if (error) return json({ available: false });
    const text = await data.text();
    return json({ available: true, ...JSON.parse(text) });
  }

  if (body.action === "setup-daily-backup") {
    if (!(await isAdmin(user.id))) {
      return json({ error: "Apenas administradores podem configurar." }, 403);
    }
    if (!CRON_SECRET) {
      return json({ error: "BACKUP_CRON_SECRET não configurado." }, 500);
    }
    await ensureBackupBucket();
    const functionUrl = `${SUPABASE_URL}/functions/v1/system-export`;
    const { error } = await admin.rpc("setup_daily_backup_cron", {
      p_secret: CRON_SECRET,
      p_function_url: functionUrl,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, scheduled_at: "23:55 UTC" });
  }

  return json({ error: "unknown action" }, 400);
});
