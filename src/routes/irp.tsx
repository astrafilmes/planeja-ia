import { createFileRoute, useNavigate } from"@tanstack/react-router";
import { routeHead } from"@/lib/route-head";
import { useCallback, useEffect, useMemo, useRef, useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { Badge } from"@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from"@/components/ui/alert-dialog";
import { WorkflowGuide } from"@/components/layout/WorkflowGuide";
import { Trash2, Loader2, FileText, FileSignature } from"lucide-react";
import { AppShell, StatusBadge } from"@/components/layout/AppShell";
import { EmptyState } from"@/components/layout/EmptyState";
import { useProgress } from"@/contexts/ProgressContext";
import { useM2AConnection } from"@/contexts/M2AConnectionProvider";
import { supabase } from"@/integrations/supabase/client";
import type { Database } from"@/integrations/supabase/types";
import { Button } from"@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from"@/components/ui/card";
import { Checkbox } from"@/components/ui/checkbox";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from"@/components/ui/table";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import { Progress } from"@/components/ui/progress";
import { Textarea } from"@/components/ui/textarea";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from"@/components/ui/dialog";
import { Upload, FileSpreadsheet, Download, Package, Send } from"lucide-react";
import { toast } from"sonner";
import {
 listenM2AProcessCreationProgress,
 requestM2AProcessCreation,
 type M2AProcessCreationPayload,
 type M2AProgressEvent,
} from"@/lib/m2a";
import {
 readWorkbook,
 analisar,
 gerarPlanilhaSecretaria,
 type AnaliseIRP,
 type UnidadeProcessamento,
} from"@/lib/irp";
import { formatBRL, formatNumber, safeFileName } from"@/lib/normalize";
import JSZip from"jszip";
import * as FileSaver from"file-saver";
const saveAs =
 (FileSaver as any).saveAs ??
 (FileSaver as any).default?.saveAs ??
 (FileSaver as any).default;
import { logAudit } from"@/lib/audit";
import { IrpCabecalhoCard } from"@/components/irp/IrpCabecalhoCard";
import { findIrpUnidadeCanonicaByRefColuna } from"@/lib/m2a-orgaos-mapping";

import { IrpConfirmacaoProcessoModal } from"@/components/irp/IrpConfirmacaoProcessoModal";
import { criarProcessoSrpM2A, blobToBase64, type M2ASrpPayload } from"@/lib/m2a-srp";
import { criarProcessoComumM2A, type M2AComumPayload } from"@/lib/m2a-comum";

type AppFile = Database["public"]["Tables"]["app_files"]["Row"];
type IrpJob = Database["public"]["Tables"]["irp_jobs"]["Row"];
type IrpJobSecretaria =
 Database["public"]["Tables"]["irp_job_secretarias"]["Row"];

type SecretariaSalva = IrpJobSecretaria & { arquivo?: AppFile };

type UnidadeIrp = UnidadeProcessamento & {
 secretaria_id?: string | null;
};

type SecretariaM2A = {
 id: string;
 numero: number;
 sigla: string;
 nome: string;
 m2a_orgao_id: string | null;
  m2a_dot_orgao_id: string | null;
 m2a_uo_id: string | null;
  m2a_dot_id: string | null;
};

type IrpImportRow = {
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

interface ResultadoSalvoIRP {
 job: IrpJob;
 secretarias: SecretariaSalva[];
 zipFile: AppFile | null;
 uploadFile: AppFile | null;
}

const IRP_BUCKET ="irp-files";
const XLSX_MIME ="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP_MIME ="application/zip";

function todayISO() {
 const now = new Date();
 return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
 .toISOString()
 .slice(0, 10);
}

function blobToDataUrl(blob: Blob): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result ??""));
 reader.onerror = () =>
 reject(reader.error ?? new Error("Falha ao ler arquivo."));
 reader.readAsDataURL(blob);
 });
}

function getProcessProgressPercent(event: M2AProgressEvent) {
 if (typeof event.progresso ==="number") return event.progresso;
 if (event.etapa ==="criar_dfd") return 15;
 if (event.etapa ==="buscar_ids") return 35;
 if (event.etapa ==="atualizar_processo") return 55;
 if (event.etapa ==="importar_planilhas") {
 const total = Math.max(event.totalItens ?? 1, 1);
 const current = Math.max(event.itemAtual ?? 0, 0);
 return 60 + (current / total) * 35;
 }
 if (event.etapa ==="concluido") return 100;
 return 5;
}

export const Route = createFileRoute("/irp")({
 validateSearch: (search: Record<string, unknown>) => ({
 job: typeof search.job ==="string" ? search.job : undefined,
 }),
 component: Page,
 head: () =>
 routeHead({
 path:"/irp",
 title:"IRP",
 description:"Processamento e consolidação de planilhas IRP (Intenção de Registro de Preços) com apoio de IA.",
 noindex: true,
 }),
});

async function uploadIrpFile({
 jobId,
 folder,
 filename,
 blob,
 fileKind,
 mimeType,
}: {
 jobId: string;
 folder:"upload" |"exports" |"zip";
 filename: string;
 blob: Blob;
 fileKind:"irp_upload" |"irp_export" |"zip_export";
 mimeType: string;
}): Promise<AppFile> {
 const {
 data: { user },
 error: userError,
 } = await supabase.auth.getUser();
 if (userError || !user) {
 throw userError ?? new Error("Sessão expirada. Entre novamente para enviar arquivos.");
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

async function carregarResultadoSalvo(
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
 .eq("file_kind","zip_export")
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

function Page() {
 const search = Route.useSearch();
 const navigate = useNavigate();
 const qc = useQueryClient();
 const { startTask, updateProgress, finishTask, failTask } = useProgress();
 const { ensureConnected } = useM2AConnection();
 const m2aProcessOffRef = useRef<(() => void) | null>(null);
 const [file, setFile] = useState<File | null>(null);
 const [analise, setAnalise] = useState<AnaliseIRP | null>(null);
 const [resultadoSalvo, setResultadoSalvo] =
 useState<ResultadoSalvoIRP | null>(null);
 const [busy, setBusy] = useState(false);
 const [progress, setProgress] = useState(0);
 const [jobId, setJobId] = useState<string | null>(null);
 const [selectedIrpImportIds, setSelectedIrpImportIds] = useState<string[]>(
 [],
 );
 const [m2aConfirmOpen, setM2aConfirmOpen] = useState(false);
 
  const [processoM2AForm, setProcessoM2AForm] = useState(() => {
    const hoje = todayISO();
    const proxima = (() => {
      const [y, m, d] = hoje.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      do { dt.setUTCDate(dt.getUTCDate() + 1); }
      while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
      return dt.toISOString().slice(0, 10);
    })();
    return {
      objeto: "",
      data: hoje,
      data_consolidacao: proxima,
      ano_orcamento: String(new Date().getFullYear()),
      orgao_solicitante: "",
      unidade_orcamentaria: "",
      unidade_orcamentaria_gerenciadora: "",
      responsavel_dfd: "",
      comissao_planejamento: "3911",
      classificacao: "1",
      e_registro_preco: true,
    };
  });

 const { data: unidades } = useQuery({
 queryKey: ["unidades"],
 queryFn: async () => {
 const { data } = await supabase
 .from("irp_unidades_processamento")
 .select("*")
 .eq("ativa", true)
 .order("ordem");
 return (data ?? []) as UnidadeIrp[];
 },
 });

 const { data: secretariasM2A = [] } = useQuery({
 queryKey: ["secretarias-m2a-irp"],
 queryFn: async () => {
 const { data, error } = await supabase
 .from("secretarias")
  .select("id, numero, sigla, nome, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id")
 .eq("ativa", true);
 if (error) throw error;
 return (data ?? []) as SecretariaM2A[];
 },
 });

 const { data: jobSecretariaRows = [] } = useQuery({
 queryKey: ["irp-job-sec-rows", jobId],
 enabled: !!jobId,
 queryFn: async () => {
 const { data, error } = await supabase
 .from("irp_job_secretarias")
 .select(
 "id, unidade_id, numero, nome, dotacao_orgao, dotacao_uo, dotacao_projeto_atividade, fiscal_servidor_id, gestor_servidor_id, m2a_status, m2a_mensagem",
 )
 .eq("job_id", jobId!);
 if (error) throw error;
 return data ?? [];
 },
 });
 const secRowByUnidadeId = useMemo(
 () => new Map(jobSecretariaRows.map((r) => [r.unidade_id ?? "", r])),
 [jobSecretariaRows],
 );
 const secRowByNumero = useMemo(
 () => new Map(jobSecretariaRows.map((r) => [r.numero, r])),
 [jobSecretariaRows],
 );

 useEffect(() => {
 if (!search.job) {
 setResultadoSalvo(null);
 return;
 }

 let cancelled = false;
 setBusy(true);
 setAnalise(null);
 setFile(null);
 setJobId(search.job);
 startTask("Carregando IRP","Abrindo resultado salvo...");

 carregarResultadoSalvo(search.job)
 .then((resultado) => {
 if (cancelled) return;
 setResultadoSalvo(resultado);
 finishTask("Resultado IRP carregado.");
 })
 .catch((e: any) => {
 if (cancelled) return;
 failTask(e?.message ??"Falha ao carregar resultado IRP.");
 toast.error("Falha ao carregar resultado", { description: e?.message });
 })
 .finally(() => {
 if (!cancelled) setBusy(false);
 });

 return () => {
 cancelled = true;
 };
 }, [failTask, finishTask, search.job, startTask]);

 useEffect(() => {
 return () => {
 m2aProcessOffRef.current?.();
 m2aProcessOffRef.current = null;
 };
 }, []);

 const secretariaById = useMemo(
 () => new Map(secretariasM2A.map((s) => [s.id, s])),
 [secretariasM2A],
 );

 const secretariaByNumero = useMemo(
 () => new Map(secretariasM2A.map((s) => [s.numero, s])),
 [secretariasM2A],
 );

 const unidadeById = useMemo(
 () => new Map(((unidades ?? []) as UnidadeIrp[]).map((u) => [u.id, u])),
 [unidades],
 );

 const resolveSecretariaM2A = useCallback(
 (unidade?: Partial<UnidadeIrp> | null, numero?: number | null) => {
 if (unidade?.secretaria_id) {
 const byId = secretariaById.get(unidade.secretaria_id);
 if (byId) return byId;
 }
 const numeroUnidade = Number(unidade?.numero ?? numero ?? 0);
 return secretariaByNumero.get(numeroUnidade) ?? null;
 },
 [secretariaById, secretariaByNumero],
 );

 const importableRows = useMemo<IrpImportRow[]>(() => {
 if (analise) {
 return analise.resultados
 .filter((r) => r.itens.length > 0)
 .map((r) => {
 const unidade = r.unidade as UnidadeIrp;
 const secretaria = resolveSecretariaM2A(unidade, unidade.numero);
  const importOrgaoPk = secretaria?.m2a_dot_orgao_id ?? null;
 return {
 key: `analise:${unidade.id}`,
 nome: unidade.nome,
 numero: unidade.numero,
 itens: r.itens.length,
 valor: r.somaValor,
 cabecalhoColuna: r.cabecalhoColuna,
 orgaoPk: secretaria?.m2a_orgao_id ?? null,
  importOrgaoPk,
 unidadePk: secretaria?.m2a_uo_id ?? null,
 filename: null,
 resultado: r,
 secretaria,
 };
 });
 }

 if (resultadoSalvo) {
 return resultadoSalvo.secretarias
 .filter((r) => r.itens_validos > 0 && r.arquivo)
 .map((r) => {
 const unidade = r.unidade_id ? unidadeById.get(r.unidade_id) : null;
 const secretaria = resolveSecretariaM2A(unidade, r.numero);
  const importOrgaoPk = secretaria?.m2a_dot_orgao_id ?? null;
 return {
 key: `salvo:${r.id}`,
 nome: r.nome,
 numero: r.numero,
 itens: r.itens_validos,
 valor: Number(r.soma_valor),
 cabecalhoColuna: r.cabecalho_coluna,
 orgaoPk: secretaria?.m2a_orgao_id ?? null,
  importOrgaoPk,
 unidadePk: secretaria?.m2a_uo_id ?? null,
 filename: r.arquivo?.original_name ?? r.output_filename ?? null,
 arquivo: r.arquivo ?? null,
 secretaria,
 };
 });
 }

 return [];
 }, [analise, resultadoSalvo, resolveSecretariaM2A, unidadeById]);

  const enrichRowForM2A = useCallback((row: IrpImportRow) => {
    const canonica = findIrpUnidadeCanonicaByRefColuna(row.resultado?.unidade.ref_coluna ?? null);
    return {
      orgaoId: canonica?.orgaoId ?? row.secretaria?.m2a_dot_orgao_id ?? row.secretaria?.m2a_orgao_id ?? null,
      uoId: canonica?.uoId ?? row.secretaria?.m2a_uo_id ?? null,
    };
  }, []);

 const importableKeys = useMemo(
 () => importableRows.map((row) => row.key).join("|"),
 [importableRows],
 );

 useEffect(() => {
 const keys = importableKeys ? importableKeys.split("|") : [];
 setSelectedIrpImportIds((current) => {
 const selected = current.filter((key) => keys.includes(key));
 return selected.length ? selected : keys;
 });
 }, [importableKeys]);

 const selectedImportRows = useMemo(
 () =>
 importableRows.filter((row) => selectedIrpImportIds.includes(row.key)),
 [importableRows, selectedIrpImportIds],
 );

  const rowsMissingM2A = useMemo(
   () => selectedImportRows.filter((row) => {
    const ids = enrichRowForM2A(row);
    return !ids.orgaoId || !ids.uoId;
   }),
  [enrichRowForM2A, selectedImportRows],
  );

 const allImportRowsSelected =
 importableRows.length > 0 &&
 importableRows.every((row) => selectedIrpImportIds.includes(row.key));

 useEffect(() => {
 const filename = file?.name ?? resultadoSalvo?.job.original_filename ??"";
 if (!filename) return;
 setProcessoM2AForm((current) => {
 if (current.objeto.trim()) return current;
 return {
 ...current,
 objeto: `Registro de precos para ${filename.replace(/\.[^.]+$/,"")}`,
 };
 });
 }, [file?.name, resultadoSalvo?.job.original_filename]);

 useEffect(() => {
  const first = selectedImportRows.find((row) => {
  const ids = enrichRowForM2A(row);
  return ids.orgaoId && ids.uoId;
  });
 if (!first) return;
  const ids = enrichRowForM2A(first);
 setProcessoM2AForm((current) => ({
 ...current,
  orgao_solicitante: current.orgao_solicitante || ids.orgaoId ||"",
 unidade_orcamentaria:
  current.unidade_orcamentaria || ids.uoId ||"",
 unidade_orcamentaria_gerenciadora:
  current.unidade_orcamentaria_gerenciadora || ids.uoId ||"",
 }));
  }, [enrichRowForM2A, selectedImportRows]);

 async function persistirArquivosResultado(
 jobId: string,
 arquivoOriginal: File,
 resultado: AnaliseIRP,
 ) {
 updateProgress(76,"Salvando arquivo original...");
 const uploadFile = await uploadIrpFile({
 jobId,
 folder:"upload",
 filename: arquivoOriginal.name,
 blob: arquivoOriginal,
 fileKind:"irp_upload",
 mimeType: arquivoOriginal.type || XLSX_MIME,
 });

 const { error: uploadJobError } = await supabase
 .from("irp_jobs")
 .update({ upload_file_id: uploadFile.id })
 .eq("id", jobId);
 if (uploadJobError) throw uploadJobError;

 const zip = new JSZip();
 const resultadosComItens = resultado.resultados.filter(
 (r) => r.itens.length > 0,
 );

 for (const [index, r] of resultadosComItens.entries()) {
 updateProgress(
 78 + (index / Math.max(resultadosComItens.length, 1)) * 16,
 `Salvando planilha ${index + 1} de ${resultadosComItens.length}...`,
 );
 const { filename, blob } = await gerarPlanilhaSecretaria(r);
 zip.file(filename, await blob.arrayBuffer());
 const outputFile = await uploadIrpFile({
 jobId,
 folder:"exports",
 filename,
 blob,
 fileKind:"irp_export",
 mimeType: XLSX_MIME,
 });
 const { error: secUpdateError } = await supabase
 .from("irp_job_secretarias")
 .update({
 output_file_id: outputFile.id,
 output_filename: filename,
 status:"exportado",
 })
 .eq("job_id", jobId)
 .eq("unidade_id", r.unidade.id)
 .eq("ref_coluna", r.unidade.ref_coluna);
 if (secUpdateError) throw secUpdateError;
 }

 if (resultadosComItens.length > 0) {
 updateProgress(96,"Salvando pacote .zip...");
 const zipBlob = await zip.generateAsync({ type:"blob" });
 await uploadIrpFile({
 jobId,
 folder:"zip",
 filename: `IRP_${new Date().toISOString().slice(0, 10)}.zip`,
 blob: zipBlob,
 fileKind:"zip_export",
 mimeType: ZIP_MIME,
 });
 }

 const { error: completedError } = await supabase
 .from("irp_jobs")
 .update({
 status:"completed",
 completed_at: new Date().toISOString(),
 })
 .eq("id", jobId);
 if (completedError) throw completedError;
 }

 async function baixarArquivoSalvo(arquivo?: AppFile | null) {
 if (!arquivo) {
 toast.error("Arquivo nao encontrado no historico.");
 return;
 }
 setBusy(true);
 try {
 const { data, error } = await supabase.storage
 .from(arquivo.bucket)
 .createSignedUrl(arquivo.storage_path, 60);
 if (error || !data) throw error ?? new Error("Falha ao assinar URL.");
 const response = await fetch(data.signedUrl);
 if (!response.ok) {
 throw new Error(`HTTP ${response.status} ao baixar arquivo.`);
 }
 saveAs(await response.blob(), arquivo.original_name);
 } catch (e: any) {
 toast.error("Falha ao baixar arquivo", { description: e?.message });
 } finally {
 setBusy(false);
 }
 }

 async function handleAnalisar() {
 if (!file || !unidades) return;
 setResultadoSalvo(null);
 setBusy(true);
 setProgress(10);
 startTask("Analisando IRP","Lendo a planilha enviada...");
 try {
 const matrix = await readWorkbook(file);
 setProgress(40);
 updateProgress(40,"Identificando colunas e unidades...");
 const a = analisar(matrix, unidades);
 setAnalise(a);
 setProgress(70);
 updateProgress(70,"Registrando resultado da análise...");

 const { data: jobRow, error } = await supabase
 .from("irp_jobs")
 .insert({
 original_filename: file.name,
 status:"analyzed",
 linha_cabecalho: a.linhaCabecalho,
 idx_natureza: a.idxNatureza,
 idx_descricao: a.idxDescricao,
 idx_especificacao: a.idxEspecificacao,
 idx_unidade: a.idxUnidade,
 total_secretarias: a.resultados.length,
 secretarias_com_itens: a.resultados.filter((r) => r.itens.length > 0)
 .length,
 secretarias_sem_itens: a.resultados.filter(
 (r) => r.itens.length === 0,
 ).length,
 total_linhas: a.resultados.reduce((s, r) => s + r.itens.length, 0),
 total_valor: a.resultados.reduce((s, r) => s + r.somaValor, 0),
 started_at: new Date().toISOString(),
 completed_at: new Date().toISOString(),
 })
 .select()
 .single();
 if (error) throw error;
 setJobId(jobRow.id);
 const { error: secretariasError } = await supabase
 .from("irp_job_secretarias")
 .insert(
 a.resultados.map((r) => ({
 job_id: jobRow.id,
 unidade_id: r.unidade.id,
 numero: r.unidade.numero,
 nome: r.unidade.nome,
 ref_coluna: r.unidade.ref_coluna,
 cabecalho_coluna: r.cabecalhoColuna,
 itens_validos: r.itens.length,
 soma_valor: r.somaValor,
 status: r.status,
 erro: r.erro ?? null,
 })),
 );
 if (secretariasError) throw secretariasError;

 await persistirArquivosResultado(jobRow.id, file, a);
 setAnalise({
 ...a,
 resultados: a.resultados.map((r) =>
 r.itens.length > 0 ? { ...r, status:"exportado" } : r,
 ),
 });
 await logAudit({
 action:"irp_analyze",
 entityType:"irp_job",
 entityId: jobRow.id,
 payload: { filename: file.name, total: a.resultados.length },
 });
 setProgress(100);
 finishTask(`Planilha analisada: ${a.resultados.length} unidade(s).`);
 toast.success(`Planilha analisada: ${a.resultados.length} unidades`);
 } catch (e: any) {
 failTask(e?.message ??"Falha na análise IRP.");
 toast.error("Falha na análise", { description: e?.message });
 } finally {
 setBusy(false);
 setTimeout(() => setProgress(0), 800);
 }
 }

 async function baixarUm(idx: number) {
 if (!analise) return;
 const r = analise.resultados[idx];
 if (r.itens.length === 0) return;
 const { filename, blob } = await gerarPlanilhaSecretaria(r);
 saveAs(blob, filename);
 }

 async function baixarZip() {
 if (resultadoSalvo && !analise) {
 await baixarArquivoSalvo(resultadoSalvo.zipFile);
 return;
 }
 if (!analise) return;
 setBusy(true);
 startTask("Gerando ZIP IRP","Preparando arquivos por secretaria...");
 try {
 const zip = new JSZip();
 const resultadosComItens = analise.resultados.filter(
 (resultado) => resultado.itens.length > 0,
 );
 for (const [index, r] of resultadosComItens.entries()) {
 if (r.itens.length === 0) continue;
 const { filename, blob } = await gerarPlanilhaSecretaria(r);
 zip.file(filename, await blob.arrayBuffer());
 updateProgress(
 ((index + 1) / resultadosComItens.length) * 90,
 `Gerando arquivo ${index + 1} de ${resultadosComItens.length}...`,
 );
 }
 updateProgress(95,"Compactando arquivos...");
 const out = await zip.generateAsync({ type:"blob" });
 saveAs(out, `IRP_${new Date().toISOString().slice(0, 10)}.zip`);
 if (jobId)
 await logAudit({
 action:"irp_export_zip",
 entityType:"irp_job",
 entityId: jobId,
 });
 finishTask("Arquivo .zip gerado com sucesso.");
 toast.success("Arquivo .zip gerado");
 } catch (e: any) {
 failTask(e?.message ??"Falha ao gerar zip IRP.");
 toast.error("Falha ao gerar zip", { description: e?.message });
 } finally {
 setBusy(false);
 }
 }

 function updateProcessoM2AField(
 field: keyof typeof processoM2AForm,
 value: string,
 ) {
 setProcessoM2AForm((current) => ({ ...current, [field]: value }));
 }

 function toggleIrpImportSelection(key: string, checked: boolean) {
 setSelectedIrpImportIds((current) =>
 checked
 ? Array.from(new Set([...current, key]))
 : current.filter((item) => item !== key),
 );
 }

 function toggleAllIrpImportSelection(checked: boolean) {
 setSelectedIrpImportIds(
 checked ? importableRows.map((row) => row.key) : [],
 );
 }

 function abrirConfirmacaoProcessoM2A() {
 if (!ensureConnected()) return;
 if (!selectedImportRows.length) {
 toast.error("Selecione ao menos uma planilha para importar.");
 return;
 }
 if (rowsMissingM2A.length > 0) {
 toast.error("Ha planilhas sem IDs M2A cadastrados.", {
  description:"Complete Unidade Gestora, Órgão da Dotação e Unidade Orçamentária em /secretarias.",
 });
 return;
 }

 const requiredFields: Array<[keyof typeof processoM2AForm, string]> = [
 ["objeto","Objeto"],
 ["data","Data"],
 ["ano_orcamento","Ano orcamentario"],
 ["orgao_solicitante","Orgao solicitante"],
 ["unidade_orcamentaria","Unidade orcamentaria"],
 ["responsavel_dfd","Agente de planejamento"],
 ["classificacao","Classificacao"],
 ];
 const missing = requiredFields.filter(
 ([field]) => !String(processoM2AForm[field] ??"").trim(),
 );
 if (missing.length > 0) {
 toast.error("Preencha os dados do processo M2A.", {
 description: missing.map(([, label]) => label).join(","),
 });
 return;
 }
 setM2aConfirmOpen(true);
 }

 async function buildM2AIrpPayload(): Promise<{
  itens: M2ASrpPayload["itens"];
  secretariasParticipantes: M2ASrpPayload["secretariasParticipantes"];
  gerenciadora_numero: number;
  gerenciadora_chave: string;
 }> {
  // 1) Resolve gerenciadora pelo m2a_uo_id casado no form
  const uoGerenciadora = (
   processoM2AForm.unidade_orcamentaria_gerenciadora.trim() ||
   processoM2AForm.unidade_orcamentaria.trim()
  );
  const rowGerenciadora =
   selectedImportRows.find((r) => enrichRowForM2A(r).uoId === uoGerenciadora) ||
   selectedImportRows[0];
  if (!rowGerenciadora?.secretaria) {
   throw new Error("Secretaria gerenciadora não identificada.");
  }
  const gerenciadora_numero = rowGerenciadora.secretaria.numero;
  const idsGerenciadora = enrichRowForM2A(rowGerenciadora);
  const gerenciadora_chave = idsGerenciadora.uoId
   ? `uo:${idsGerenciadora.uoId}`
   : `ref:${rowGerenciadora.resultado?.unidade.ref_coluna ?? rowGerenciadora.key}`;

  // 2) Lista de secretarias (gerenciadora + participantes) que entram no IRP
  const secretariasParticipantes: M2ASrpPayload["secretariasParticipantes"] =
   selectedImportRows
    .filter((r) => r.secretaria)
    .map((r) => {
     const ids = enrichRowForM2A(r);
     const refColuna: number | null = r.resultado?.unidade.ref_coluna ?? null;
     return {
      chave: ids.uoId ? `uo:${ids.uoId}` : `ref:${refColuna ?? r.key}`,
      numero: r.secretaria!.numero,
      sigla: r.secretaria!.sigla,
      nome: r.secretaria!.nome,
      m2a_orgao_id: ids.orgaoId,
      m2a_dot_orgao_id: r.secretaria!.m2a_dot_orgao_id,
      m2a_uo_id: ids.uoId,
      m2a_dot_id: r.secretaria!.m2a_dot_id,
      ref_coluna: refColuna,
     };
    });

  // 3) Lista mestre de itens (dedup pelo sourceRow|identificador) + qtd por secretaria
  type ItemAgreg = M2ASrpPayload["itens"][number] & { _key: string };
  const map = new Map<string, ItemAgreg>();
  for (const row of selectedImportRows) {
   if (!row.resultado || !row.secretaria) continue;
   for (const it of row.resultado.itens) {
    const key = `${it.sourceRow}|${it.identificador || ""}|${it.descricao}`;
    let agg = map.get(key);
    if (!agg) {
     agg = {
      _key: key,
      descricao: it.descricao,
      especificacao: it.especificacao,
      natureza: it.natureza,
      unidade: it.unidade,
      valorReferencia: it.valorReferencia || 0,
      quantidades: {},
     };
     map.set(key, agg);
    }
     const ids = enrichRowForM2A(row);
     const refColuna: number | null = row.resultado?.unidade.ref_coluna ?? null;
     const chave = ids.uoId ? `uo:${ids.uoId}` : `ref:${refColuna ?? row.key}`;
     agg.quantidades[chave] = Number(agg.quantidades[chave] ?? 0) + it.quantidade;
   }
  }
  const itens = Array.from(map.values()).map(({ _key: _k, ...rest }) => rest);
  return { itens, secretariasParticipantes, gerenciadora_numero, gerenciadora_chave };
 }

 async function confirmarCriacaoProcessoM2A() {
 const eSRP = processoM2AForm.e_registro_preco !== false;
 setBusy(true);
 const abortCtrl = new AbortController();
 startTask(
   eSRP ? "Criando processo SRP no M2A" : "Criando processo comum no M2A",
   "Preparando planilhas...",
   { onCancel: () => abortCtrl.abort() },
 );
 try {
  const { itens, secretariasParticipantes, gerenciadora_numero, gerenciadora_chave } =
   await buildM2AIrpPayload();
   const payloadBase = {
    objeto: processoM2AForm.objeto.trim(),
    data: processoM2AForm.data,
    ano_orcamento: processoM2AForm.ano_orcamento.trim(),
    orgao_solicitante: processoM2AForm.orgao_solicitante.trim(),
    unidade_orcamentaria: processoM2AForm.unidade_orcamentaria.trim(),
    unidade_orcamentaria_gerenciadora:
     processoM2AForm.unidade_orcamentaria_gerenciadora.trim() ||
     processoM2AForm.unidade_orcamentaria.trim(),
    responsavel_dfd: processoM2AForm.responsavel_dfd.trim(),
    comissao_planejamento:
     processoM2AForm.comissao_planejamento.trim() || "3911",
    classificacao: processoM2AForm.classificacao.trim(),
    gerenciadora_numero,
    gerenciadora_chave,
    itens,
    secretariasParticipantes,
   };
   const payload: M2ASrpPayload = {
    ...payloadBase,
    data_consolidacao:
      processoM2AForm.data_consolidacao || processoM2AForm.data,
   };
   const payloadComum: M2AComumPayload = payloadBase;

 setM2aConfirmOpen(false);
 if (jobId) {
 await supabase
 .from("irp_jobs")
 .update({
 m2a_envio_status: "em_andamento",
 m2a_envio_etapa: "iniciando",
 m2a_envio_mensagem: "Enviando ao M2A...",
 m2a_envio_started_at: new Date().toISOString(),
 })
 .eq("id", jobId);
 }

 const runner: Promise<void> = eSRP
   ? criarProcessoSrpM2A(payload, handleM2AEvent, abortCtrl.signal)
   : criarProcessoComumM2A(payloadComum, handleM2AEvent as any, abortCtrl.signal);

 async function handleM2AEvent(evt: any) {
 if (evt.type === "progress") {
 updateProgress(evt.progresso ?? 0, evt.mensagem, { etapa: evt.etapa });
 if (jobId) {
 await supabase
 .from("irp_jobs")
 .update({
 m2a_envio_etapa: evt.etapa,
 m2a_envio_mensagem: evt.mensagem,
 })
 .eq("id", jobId);
 }
 } else if (evt.type === "cancelled") {
 if (jobId) {
 await supabase
 .from("irp_jobs")
 .update({
 m2a_envio_status: "cancelado",
 m2a_envio_mensagem: evt.mensagem ?? "Cancelado.",
 m2a_envio_completed_at: new Date().toISOString(),
 })
 .eq("id", jobId);
 }
 failTask(evt.mensagem ?? "Envio cancelado.");
 toast.warning("Envio cancelado", { description: evt.mensagem });
 setBusy(false);
  } else if (evt.type === "done") {
 if (jobId) {
 await supabase
 .from("irp_jobs")
 .update({
 m2a_processo_id: evt.processoId,
 m2a_envio_status: evt.erros.length ? "concluido_com_erros" : "concluido",
 m2a_envio_etapa: "concluido",
 m2a_envio_mensagem: evt.erros.length
 ? `Concluído com ${evt.erros.length} erro(s)`
 : "Processo SRP criado.",
 m2a_envio_completed_at: new Date().toISOString(),
 })
 .eq("id", jobId);
 await logAudit({
 action: "m2a_process_create",
 entityType: "irp_job",
 entityId: jobId,
 payload: { processoId: evt.processoId, dfdId: evt.dfdId, erros: evt.erros },
 });
 }

 // Cria registro local em "processos" a partir da DFD enviada.
 // Info parcial é OK — campos em branco podem ser preenchidos depois.
 let processoLocalId: string | null = null;
 try {
   const orgaoSel = processoM2AForm.orgao_solicitante.trim();
   const secretariaLocal = orgaoSel
     ? secretariasM2A.find(
         (s) =>
           String(s.m2a_orgao_id ?? "") === orgaoSel ||
           String(s.m2a_dot_orgao_id ?? "") === orgaoSel,
       ) ?? null
     : null;
   const anoNum = Number.parseInt(processoM2AForm.ano_orcamento, 10);
   const { data: userData } = await supabase.auth.getUser();
   const { data: novoProc, error: procErr } = await supabase
     .from("processos")
     .insert({
       objeto:
         processoM2AForm.objeto.trim() ||
         `DFD ${evt.dfdId} (sem objeto)`,
       secretaria_id: secretariaLocal?.id ?? null,
       m2a_processo_id: evt.processoId,
       ano: Number.isFinite(anoNum) ? anoNum : null,
        data_abertura: processoM2AForm.data || null,
        status: "rascunho",
        modalidade: eSRP ? "SRP" : "comum",
        observacoes: `Criado automaticamente a partir do envio IRP/DFD ${evt.dfdId}.`,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (procErr) throw procErr;
    processoLocalId = novoProc?.id ?? null;
    if (jobId && processoLocalId) {
      await supabase
        .from("irp_jobs")
        .update({ processo_id: processoLocalId } as any)
        .eq("id", jobId);
    }
  } catch (err: any) {
    console.error("[irp] falha ao criar processo local", err);
    toast.warning("Processo M2A criado, mas o registro local falhou", {
      description: err?.message ?? "Crie manualmente em Processos se necessário.",
    });
  }

 const tituloOk = eSRP ? "Processo SRP" : "Processo comum";
 finishTask(`${tituloOk} ${evt.processoId} criado.`);
 const okCount = eSRP
   ? `${(evt.totalPlanilhas ?? 0) - (evt.erros?.length ?? 0)}/${evt.totalPlanilhas ?? 0} planilhas OK`
   : `${(evt.totalDfds ?? 0)} DFD(s) criadas · ${evt.erros?.length ?? 0} aviso(s)`;
 toast.success(`${tituloOk} criado no M2A`, {
 description: `Processo ${evt.processoId} · ${okCount}${processoLocalId ? " · registro local criado" : ""}`,
 });
 setBusy(false);
 } else if (evt.type === "error") {
 if (jobId) {
 await supabase
 .from("irp_jobs")
 .update({
 m2a_envio_status: "erro",
 m2a_envio_mensagem: evt.error,
 m2a_envio_completed_at: new Date().toISOString(),
 })
 .eq("id", jobId);
 }
 failTask(evt.error);
 toast.error("Falha ao criar processo M2A", { description: evt.error });
 setBusy(false);
 }
 }

 await runner;
 } catch (e: any) {
 failTask(e?.message ??"Falha ao iniciar criacao do processo M2A.");
 toast.error("Falha ao iniciar processo M2A", { description: e?.message });
 setBusy(false);
 }
 }

 return (
 <AppShell
 title="Importação IRP"
 subtitle="Carregue a planilha consolidada e gere os arquivos por secretaria"
 >
 <div className="grid gap-4 lg:grid-cols-3">
 <Card className="border-border/60 lg:col-span-1">
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2">
 <Upload className="size-4 text-primary" />
 1. Upload
 </CardTitle>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <div className="flex flex-col gap-1.5">
 <Label htmlFor="f">Arquivo .xlsx</Label>
 <Input
 id="f"
 type="file"
 accept=".xlsx,.xls"
 onChange={(e) => {
 setFile(e.target.files?.[0] ?? null);
 setAnalise(null);
 setResultadoSalvo(null);
 }}
 />
 <p className="text-[11px] text-muted-foreground">
 .xls legados requerem backend Python — use .xlsx aqui.
 </p>
 </div>
 {file && (
 <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[13px] dark:bg-muted/30">
 <div className="flex items-center gap-2">
 <FileSpreadsheet className="size-3.5 text-primary" />
 <span className="font-medium truncate">{file.name}</span>
 </div>
 <div className="mt-0.5 text-muted-foreground">
 {(file.size / 1024).toFixed(1)} KB
 </div>
 </div>
 )}
 <Button
 onClick={handleAnalisar}
 disabled={!file || busy}
 className="w-full"
 >
 {busy ?"Processando..." :"Analisar planilha"}
 </Button>
 {progress > 0 && <Progress value={progress} />}
 </CardContent>
 </Card>

 <Card className="border-border/60 lg:col-span-2">
 <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
 <CardTitle className="flex items-center gap-2">
 <FileSpreadsheet className="size-4 text-primary" />
 {resultadoSalvo
 ?"2. Resultado salvo"
 :"2. Resultado por secretaria"}
 </CardTitle>
 {(analise || resultadoSalvo) && (
 <Button
 size="sm"
 variant="outline"
 onClick={baixarZip}
 disabled={busy || (!!resultadoSalvo && !resultadoSalvo.zipFile)}
 >
 <Package className="size-4" /> Baixar .zip
 </Button>
 )}
 </CardHeader>
 <CardContent>
  {jobId && (analise || resultadoSalvo) && (
 <div className="mb-4">
 <IrpCabecalhoCard
 jobId={jobId}
 initialJob={resultadoSalvo?.job ?? null}
 form={processoM2AForm}
 onChange={setProcessoM2AForm}
 onSubmit={abrirConfirmacaoProcessoM2A}
 submitDisabled={
 busy ||
 selectedImportRows.length === 0 ||
 rowsMissingM2A.length > 0
 }
 submitHelper={
 rowsMissingM2A.length > 0
 ? `${rowsMissingM2A.length} secretaria(s) sem cadastro M2A. Configure em /secretarias.`
 : `${selectedImportRows.length} de ${importableRows.length} planilha(s) selecionada(s).`
 }
 />
 </div>
 )}
 {!analise && !resultadoSalvo ? (
 <EmptyState
 icon={FileSpreadsheet}
 title="Nenhuma análise carregada"
 description="Envie uma planilha para visualizar os resultados por secretaria."
 />
 ) : analise ? (
 <>
 <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
 <Metric
 label="Unidades"
 value={formatNumber(analise.resultados.length)}
 />
 <Metric
 label="Com itens"
 value={formatNumber(
 analise.resultados.filter((r) => r.itens.length > 0)
 .length,
 )}
 />
 <Metric
 label="Itens"
 value={formatNumber(
 analise.resultados.reduce(
 (s, r) => s + r.itens.length,
 0,
 ),
 )}
 />
 <Metric
 label="Qtd. total"
 value={formatNumber(
 analise.resultados.reduce(
 (s, r) => s + r.somaQuantidade,
 0,
 ),
 )}
 />
 <Metric
 label="Valor estimado"
 value={formatBRL(
 analise.resultados.reduce((s, r) => s + r.somaValor, 0),
 )}
 />
 </div>
 <div className="overflow-hidden rounded-xl border border-border/60">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-12">Nº</TableHead>
 <TableHead className="w-10">
 <Checkbox
 checked={allImportRowsSelected}
 onCheckedChange={(checked) =>
 toggleAllIrpImportSelection(checked === true)
 }
 aria-label="Selecionar todas as planilhas"
 />
 </TableHead>
 <TableHead>Unidade</TableHead>
 <TableHead className="w-20 text-right">Itens</TableHead>
 <TableHead className="w-28 text-right">
 Qtd. total
 </TableHead>
 <TableHead className="w-32 text-right">
 Valor est.
 </TableHead>
 <TableHead className="w-28 text-right">
 Status
 </TableHead>
 <TableHead className="w-24"></TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {analise.resultados.map((r, i) => (
 <TableRow key={r.unidade.id}>
 <TableCell className="font-mono text-xs">
 {r.unidade.numero}
 </TableCell>
 <TableCell>
 <Checkbox
 checked={selectedIrpImportIds.includes(
 `analise:${r.unidade.id}`,
 )}
 disabled={r.itens.length === 0}
 onCheckedChange={(checked) =>
 toggleIrpImportSelection(
 `analise:${r.unidade.id}`,
 checked === true,
 )
 }
 aria-label={`Selecionar ${r.unidade.nome}`}
 />
 </TableCell>
 <TableCell className="text-[13px]">
 {r.unidade.nome}
 </TableCell>
 <TableCell className="text-right font-mono text-xs">
 {r.itens.length}
 </TableCell>
 <TableCell className="text-right font-mono text-xs">
 {formatNumber(r.somaQuantidade)}
 </TableCell>
 <TableCell className="text-right font-mono text-xs">
 {formatBRL(r.somaValor)}
 </TableCell>
 <TableCell className="text-right">
 <StatusBadge status={r.status} />
 </TableCell>
  <TableCell className="text-right">
 <Button
 size="sm"
 variant="ghost"
 disabled={r.itens.length === 0}
 onClick={() => baixarUm(i)}
 >
 <Download className="size-4" />
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </>
 ) : resultadoSalvo ? (
 <>
 <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
 <Metric
 label="Unidades"
 value={formatNumber(resultadoSalvo.job.total_secretarias)}
 />
 <Metric
 label="Com itens"
 value={`${formatNumber(resultadoSalvo.job.secretarias_com_itens)}/${formatNumber(resultadoSalvo.job.total_secretarias)}`}
 />
 <Metric
 label="Itens"
 value={formatNumber(resultadoSalvo.job.total_linhas)}
 />
 <Metric
 label="Valor estimado"
 value={formatBRL(Number(resultadoSalvo.job.total_valor))}
 />
 </div>
 <div className="overflow-hidden rounded-xl border border-border/60">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-10">
 <Checkbox
 checked={allImportRowsSelected}
 onCheckedChange={(checked) =>
 toggleAllIrpImportSelection(checked === true)
 }
 aria-label="Selecionar todas as planilhas"
 />
 </TableHead>
 <TableHead className="w-12">NÂº</TableHead>
 <TableHead>Unidade</TableHead>
 <TableHead className="w-20 text-right">Itens</TableHead>
 <TableHead className="w-32 text-right">
 Valor est.
 </TableHead>
 <TableHead className="w-28 text-right">
 Status
 </TableHead>
 <TableHead className="w-24"></TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {resultadoSalvo.secretarias.map((r) => (
 <TableRow key={r.id}>
 <TableCell>
 <Checkbox
 checked={selectedIrpImportIds.includes(
 `salvo:${r.id}`,
 )}
 disabled={!r.arquivo || r.itens_validos === 0}
 onCheckedChange={(checked) =>
 toggleIrpImportSelection(
 `salvo:${r.id}`,
 checked === true,
 )
 }
 aria-label={`Selecionar ${r.nome}`}
 />
 </TableCell>
 <TableCell className="font-mono text-xs">
 {r.numero}
 </TableCell>
 <TableCell className="text-[13px]">
 <div>{r.nome}</div>
 <div className="mt-0.5 text-[11px] text-muted-foreground">
 {r.cabecalho_coluna}
 </div>
 </TableCell>
 <TableCell className="text-right font-mono text-xs">
 {formatNumber(r.itens_validos)}
 </TableCell>
 <TableCell className="text-right font-mono text-xs">
 {formatBRL(Number(r.soma_valor))}
 </TableCell>
 <TableCell className="text-right">
 <StatusBadge status={r.status} />
 </TableCell>
  <TableCell className="text-right">
 <Button
 size="sm"
 variant="ghost"
 disabled={!r.arquivo || busy}
 onClick={() => baixarArquivoSalvo(r.arquivo)}
 >
 <Download className="size-4" />
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 {!resultadoSalvo.zipFile && (
 <p className="mt-3 text-xs text-muted-foreground">
 Processamentos antigos podem ter apenas o resumo salvo.
 Novas importacoes gravam os arquivos para download
 posterior.
 </p>
 )}
 </>
 ) : null}
 </CardContent>
 </Card>
 </div>
        <IrpConfirmacaoProcessoModal
          open={m2aConfirmOpen}
          onOpenChange={setM2aConfirmOpen}
          busy={busy}
          form={processoM2AForm}
          rows={selectedImportRows}
          secRowByNumero={secRowByNumero}
          onConfirm={confirmarCriacaoProcessoM2A}
        />
 </AppShell>
 );
}

function Metric({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 {label}
 </div>
 <div className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
 {value}
 </div>
 </div>
 );
}
