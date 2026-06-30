import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function canExportDatabase(userId: string) {
  const [{ data: isAdmin }, { data: isGestor }] = await Promise.all([
    admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    admin.rpc("has_role", { _user_id: userId, _role: "gestor" }),
  ]);
  return Boolean(isAdmin || isGestor);
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
    const { data: blob, error: downloadError } = await admin.storage
      .from(bucket)
      .download(path);
    if (downloadError) {
      out.push({ ...item, path, download_error: downloadError.message });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getAuthUser(req);
  if (!user) return json({ error: "unauthenticated" }, 401);
  if (!(await canExportDatabase(user.id))) {
    return json({ error: "Acesso negado para exportação completa." }, 403);
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (body.action !== "database-export") return json({ error: "unknown action" }, 400);

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
  try {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) throw error;
    for (const bucket of buckets ?? []) {
      try {
        storage[bucket.name] = await listBucketFiles(bucket.name);
      } catch (bucketError) {
        const message = bucketError instanceof Error ? bucketError.message : String(bucketError);
        warnings.push(`storage/${bucket.name}: ${message}`);
        storage[bucket.name] = { error: message };
      }
    }
  } catch (error) {
    warnings.push(`storage: ${error instanceof Error ? error.message : String(error)}`);
  }

  return json({
    generated_at: new Date().toISOString(),
    tables,
    storage,
    restore_order: RESTORE_ORDER,
    warnings,
  });
});