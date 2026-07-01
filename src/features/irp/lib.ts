// Feature IRP — tipagens compartilhadas, constantes e helpers puros.
// Toda regra de negócio extraída de src/routes/irp.tsx passa por aqui.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  AnaliseIRP,
  UnidadeProcessamento,
} from "@/lib/irp";
import { safeFileName } from "@/lib/utils/normalize";
import type { M2AProgressEvent } from "@/lib/m2a";

// ============================================================
// Types
// ============================================================
export type AppFile = Database["public"]["Tables"]["app_files"]["Row"];
export type IrpJob = Database["public"]["Tables"]["irp_jobs"]["Row"];
export type IrpJobSecretaria =
  Database["public"]["Tables"]["irp_job_secretarias"]["Row"];

export type SecretariaSalva = IrpJobSecretaria & { arquivo?: AppFile };

export type UnidadeIrp = UnidadeProcessamento & {
  secretaria_id?: string | null;
};

export type SecretariaM2A = {
  id: string;
  numero: number;
  sigla: string;
  nome: string;
  m2a_orgao_id: string | null;
  m2a_dot_orgao_id: string | null;
  m2a_uo_id: string | null;
  m2a_dot_id: string | null;
};

export type IrpImportRow = {
  key: string;
  nome: string;
  numero: number;
  itens: number;
  valor: number;
  cabecalhoColuna: string | null;
  orgaoPk: string | null;
  importOrgaoPk: string | null;
  unidadePk: string | null;
  filename: string | null;
  resultado?: AnaliseIRP["resultados"][number];
  secretaria?: SecretariaM2A | null;
  arquivo?: AppFile | null;
};

export interface ResultadoSalvoIRP {
  job: IrpJob;
  secretarias: SecretariaSalva[];
  zipFile: AppFile | null;
  uploadFile: AppFile | null;
}

export type ProcessoM2AForm = {
  objeto: string;
  data: string;
  data_consolidacao: string;
  ano_orcamento: string;
  orgao_solicitante: string;
  unidade_orcamentaria: string;
  unidade_orcamentaria_gerenciadora: string;
  responsavel_dfd: string;
  comissao_planejamento: string;
  classificacao: string;
  e_registro_preco: boolean;
};

// ============================================================
// Constants
// ============================================================
export const IRP_BUCKET = "irp-files";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const ZIP_MIME = "application/zip";

// ============================================================
// Query keys
// ============================================================
export const irpQueryKeys = {
  jobsList: ["irp-jobs-list"] as const,
  unidades: ["unidades"] as const,
  secretariasM2A: ["secretarias-m2a-irp"] as const,
  jobSecRows: (jobId: string | null) => ["irp-job-sec-rows", jobId] as const,
};

// ============================================================
// Helpers puros
// ============================================================
export function todayISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export function proximoDiaUtilISO(baseISO: string): string {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  do {
    dt.setUTCDate(dt.getUTCDate() + 1);
  } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return dt.toISOString().slice(0, 10);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(blob);
  });
}

export function getProcessProgressPercent(event: M2AProgressEvent): number {
  if (typeof event.progresso === "number") return event.progresso;
  if (event.etapa === "criar_dfd") return 15;
  if (event.etapa === "buscar_ids") return 35;
  if (event.etapa === "atualizar_processo") return 55;
  if (event.etapa === "importar_planilhas") {
    const total = Math.max(event.totalItens ?? 1, 1);
    const current = Math.max(event.itemAtual ?? 0, 0);
    return 60 + (current / total) * 35;
  }
  if (event.etapa === "concluido") return 100;
  return 5;
}

export function buildDefaultProcessoM2AForm(): ProcessoM2AForm {
  const hoje = todayISO();
  return {
    objeto: "",
    data: hoje,
    data_consolidacao: proximoDiaUtilISO(hoje),
    ano_orcamento: String(new Date().getFullYear()),
    orgao_solicitante: "",
    unidade_orcamentaria: "",
    unidade_orcamentaria_gerenciadora: "",
    responsavel_dfd: "",
    comissao_planejamento: "3911",
    classificacao: "1",
    e_registro_preco: true,
  };
}

// ============================================================
// Storage helpers (Supabase)
// ============================================================
export async function uploadIrpFile({
  jobId,
  folder,
  filename,
  blob,
  fileKind,
  mimeType,
}: {
  jobId: string;
  folder: "upload" | "exports" | "zip";
  filename: string;
  blob: Blob;
  fileKind: "irp_upload" | "irp_export" | "zip_export";
  mimeType: string;
}): Promise<AppFile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw (
      userError ??
      new Error("Sessão expirada. Entre novamente para enviar arquivos.")
    );
  }

  const storagePath = `jobs/${jobId}/${folder}/${Date.now()}-${safeFileName(filename)}`;
  const { error: uploadError } = await supabase.storage
    .from(IRP_BUCKET)
    .upload(storagePath, blob, { contentType: mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("app_files")
    .insert({
      bucket: IRP_BUCKET,
      storage_path: storagePath,
      original_name: filename,
      mime_type: mimeType,
      size_bytes: blob.size,
      file_kind: fileKind,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AppFile;
}

export async function carregarResultadoSalvo(
  jobId: string,
): Promise<ResultadoSalvoIRP> {
  const { data: job, error: jobError } = await supabase
    .from("irp_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (jobError) throw jobError;

  const { data: secretarias, error: secError } = await supabase
    .from("irp_job_secretarias")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (secError) throw secError;

  const fileIds = Array.from(
    new Set(
      [
        job.upload_file_id,
        ...((secretarias ?? []).map((s) => s.output_file_id) ?? []),
      ].filter(Boolean) as string[],
    ),
  );

  const { data: files, error: filesError } = fileIds.length
    ? await supabase.from("app_files").select("*").in("id", fileIds)
    : { data: [], error: null };
  if (filesError) throw filesError;

  const { data: zipFiles, error: zipError } = await supabase
    .from("app_files")
    .select("*")
    .eq("bucket", IRP_BUCKET)
    .eq("file_kind", "zip_export")
    .like("storage_path", `jobs/${jobId}/%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (zipError) throw zipError;

  const fileById = new Map((files ?? []).map((file) => [file.id, file]));
  return {
    job: job as IrpJob,
    secretarias: ((secretarias ?? []) as IrpJobSecretaria[]).map((s) => ({
      ...s,
      arquivo: s.output_file_id
        ? (fileById.get(s.output_file_id) as AppFile | undefined)
        : undefined,
    })),
    zipFile: ((zipFiles ?? [])[0] as AppFile | undefined) ?? null,
    uploadFile: job.upload_file_id
      ? ((fileById.get(job.upload_file_id) as AppFile | undefined) ?? null)
      : null,
  };
}
