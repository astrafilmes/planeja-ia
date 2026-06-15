import { createFileRoute } from"@tanstack/react-router";
import { routeHead } from"@/lib/route-head";
import { useCallback, useEffect, useMemo, useRef, useState } from"react";
import { useQuery } from"@tanstack/react-query";
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
import { Upload, FileSpreadsheet, Download, Package, Send, Settings2 } from"lucide-react";
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
import { IrpSecretariaConfigModal } from"@/components/irp/IrpSecretariaConfigModal";
import { criarProcessoSrpM2A, blobToBase64, type M2ASrpPayload } from"@/lib/m2a-srp";

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
 m2a_uo_id: string | null;
};

type IrpImportRow = {
 key: string;
 nome: string;
 numero: number;
 itens: number;
 valor: number;
 cabecalhoColuna: string | null;
 orgaoPk: string | null;
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
 const [configModal, setConfigModal] = useState<{ rowId: string; nome: string } | null>(null);
 const [processoM2AForm, setProcessoM2AForm] = useState({
 objeto:"",
 data: todayISO(),
 ano_orcamento: String(new Date().getFullYear()),
 orgao_solicitante:"",
 unidade_orcamentaria:"",
 unidade_orcamentaria_gerenciadora:"",
 responsavel_dfd:"",
 comissao_planejamento:"",
 classificacao:"1",
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
 .select("id, numero, sigla, nome, m2a_orgao_id, m2a_uo_id")
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
 .select("id, unidade_id, numero, nome")
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
 return {
 key: `analise:${unidade.id}`,
 nome: unidade.nome,
 numero: unidade.numero,
 itens: r.itens.length,
 valor: r.somaValor,
 cabecalhoColuna: r.cabecalhoColuna,
 orgaoPk: secretaria?.m2a_orgao_id ?? null,
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
 return {
 key: `salvo:${r.id}`,
 nome: r.nome,
 numero: r.numero,
 itens: r.itens_validos,
 valor: Number(r.soma_valor),
 cabecalhoColuna: r.cabecalho_coluna,
 orgaoPk: secretaria?.m2a_orgao_id ?? null,
 unidadePk: secretaria?.m2a_uo_id ?? null,
 filename: r.arquivo?.original_name ?? r.output_filename ?? null,
 arquivo: r.arquivo ?? null,
 secretaria,
 };
 });
 }

 return [];
 }, [analise, resultadoSalvo, resolveSecretariaM2A, unidadeById]);

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
 () => selectedImportRows.filter((row) => !row.orgaoPk || !row.unidadePk),
 [selectedImportRows],
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
 const first = selectedImportRows.find(
 (row) => row.orgaoPk && row.unidadePk,
 );
 if (!first) return;
 setProcessoM2AForm((current) => ({
 ...current,
 orgao_solicitante: current.orgao_solicitante || first.orgaoPk ||"",
 unidade_orcamentaria:
 current.unidade_orcamentaria || first.unidadePk ||"",
 unidade_orcamentaria_gerenciadora:
 current.unidade_orcamentaria_gerenciadora || first.unidadePk ||"",
 }));
 }, [selectedImportRows]);

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
 description:"Complete Unidade Gestora e Unidade Orcamentaria em /secretarias.",
 });
 return;
 }

 const requiredFields: Array<[keyof typeof processoM2AForm, string]> = [
 ["objeto","Objeto"],
 ["data","Data"],
 ["ano_orcamento","Ano orcamentario"],
 ["orgao_solicitante","Orgao solicitante"],
 ["unidade_orcamentaria","Unidade orcamentaria"],
 ["responsavel_dfd","Agente responsavel"],
 ["comissao_planejamento","Comissao de planejamento"],
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

 async function buildM2AImportacoes() {
 const listaImportacoes: M2AProcessCreationPayload["listaImportacoes"] = [];

 for (const [index, row] of selectedImportRows.entries()) {
 updateProgress(
 8 + (index / Math.max(selectedImportRows.length, 1)) * 12,
 `Preparando planilha ${index + 1} de ${selectedImportRows.length}...`,
 );

 if (row.resultado) {
 const { filename, blob } = await gerarPlanilhaSecretaria(row.resultado);
 listaImportacoes.push({
 orgao_pk: row.orgaoPk!,
 unidade_orcamentaria_pk: row.unidadePk!,
 filename,
 nome: row.nome,
 arquivo_xlsx: {
 dataUrl: await blobToDataUrl(blob),
 filename,
 mimeType: XLSX_MIME,
 },
 });
 continue;
 }

 if (!row.arquivo) {
 throw new Error(`Arquivo nao encontrado para ${row.nome}.`);
 }
 const { data, error } = await supabase.storage
 .from(row.arquivo.bucket)
 .createSignedUrl(row.arquivo.storage_path, 300);
 if (error || !data) throw error ?? new Error("Falha ao assinar URL.");
 listaImportacoes.push({
 orgao_pk: row.orgaoPk!,
 unidade_orcamentaria_pk: row.unidadePk!,
 filename: row.arquivo.original_name,
 nome: row.nome,
 arquivo_xlsx: {
 signedUrl: data.signedUrl,
 filename: row.arquivo.original_name,
 mimeType: row.arquivo.mime_type ?? XLSX_MIME,
 },
 });
 }

 return listaImportacoes;
 }

 async function confirmarCriacaoProcessoM2A() {
 const requestId = `processo_srp_${Date.now()}_${Math.random()
 .toString(36)
 .slice(2, 8)}`;
 setBusy(true);
 startTask("Criando processo SRP no M2A","Preparando planilhas...");
 try {
 const listaImportacoes = await buildM2AImportacoes();
 const payload: M2AProcessCreationPayload = {
 requestId,
 tipo:"processo_srp",
 objeto: processoM2AForm.objeto.trim(),
 data: processoM2AForm.data,
 data_aviso: processoM2AForm.data,
 ano_orcamento: processoM2AForm.ano_orcamento.trim(),
 orgao_solicitante: processoM2AForm.orgao_solicitante.trim(),
 unidade_orcamentaria: processoM2AForm.unidade_orcamentaria.trim(),
 unidade_orcamentaria_gerenciadora:
 processoM2AForm.unidade_orcamentaria_gerenciadora.trim() ||
 processoM2AForm.unidade_orcamentaria.trim(),
 responsavel_dfd: processoM2AForm.responsavel_dfd.trim(),
 comissao_planejamento: processoM2AForm.comissao_planejamento.trim(),
 classificacao: processoM2AForm.classificacao.trim(),
 listaImportacoes,
 };

 m2aProcessOffRef.current?.();
 m2aProcessOffRef.current = listenM2AProcessCreationProgress(
 requestId,
 (event) => {
 if (event.etapa ==="erro" || event.status ==="erro") {
 failTask(event.mensagem ||"Falha ao criar processo no M2A.");
 toast.error("Falha ao criar processo M2A", {
 description: event.mensagem,
 });
 setBusy(false);
 m2aProcessOffRef.current?.();
 m2aProcessOffRef.current = null;
 return;
 }

 if (event.etapa ==="concluido" || event.status ==="concluido") {
 finishTask("Processo SRP criado no M2A.");
 toast.success("Processo SRP criado no M2A", {
 description: event.numeroProcesso
 ? `Processo ${event.numeroProcesso}`
 : undefined,
 });
 if (jobId) {
 void logAudit({
 action:"m2a_process_create",
 entityType:"irp_job",
 entityId: jobId,
 payload: {
 requestId,
 processoId: event.processoId,
 numeroProcesso: event.numeroProcesso,
 planilhas: listaImportacoes.length,
 },
 });
 }
 setBusy(false);
 m2aProcessOffRef.current?.();
 m2aProcessOffRef.current = null;
 return;
 }

 updateProgress(getProcessProgressPercent(event), event.mensagem);
 },
 );
 updateProgress(20,"Enviando comando para a extensao M2A...");
 requestM2AProcessCreation(payload);
 setM2aConfirmOpen(false);
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
 <div className="flex items-center justify-end gap-1">
 <Button
 size="sm"
 variant="ghost"
 disabled={r.itens.length === 0 || !secRowByUnidadeId.get(r.unidade.id)}
 onClick={() => {
 const row = secRowByUnidadeId.get(r.unidade.id);
 if (row) setConfigModal({ rowId: row.id, nome: r.unidade.nome });
 }}
 title="Configurar dotação / fiscal / gestor"
 >
 <Settings2 className="size-4" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 disabled={r.itens.length === 0}
 onClick={() => baixarUm(i)}
 >
 <Download className="size-4" />
 </Button>
 </div>
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
 <div className="flex items-center justify-end gap-1">
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setConfigModal({ rowId: r.id, nome: r.nome })}
 title="Configurar dotação / fiscal / gestor"
 >
 <Settings2 className="size-4" />
 </Button>
 <Button
 size="sm"
 variant="ghost"
 disabled={!r.arquivo || busy}
 onClick={() => baixarArquivoSalvo(r.arquivo)}
 >
 <Download className="size-4" />
 </Button>
 </div>
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
 <Dialog open={m2aConfirmOpen} onOpenChange={setM2aConfirmOpen}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Confirmar criacao do processo SRP</DialogTitle>
 <DialogDescription>
 Revise os dados antes de iniciar a automacao no portal M2A.
 </DialogDescription>
 </DialogHeader>

 <div className="grid gap-3 text-sm">
 <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 md:grid-cols-3">
 <div>
 <div className="text-[11px] font-semibold uppercase text-muted-foreground">
 Orgao
 </div>
 <div className="font-mono">
 {processoM2AForm.orgao_solicitante}
 </div>
 </div>
 <div>
 <div className="text-[11px] font-semibold uppercase text-muted-foreground">
 Unidade
 </div>
 <div className="font-mono">
 {processoM2AForm.unidade_orcamentaria_gerenciadora ||
 processoM2AForm.unidade_orcamentaria}
 </div>
 </div>
 <div>
 <div className="text-[11px] font-semibold uppercase text-muted-foreground">
 Agente
 </div>
 <div className="font-mono">
 {processoM2AForm.responsavel_dfd}
 </div>
 </div>
 </div>

 <div className="rounded-lg border border-border/60">
 <div className="border-b border-border/60 px-3 py-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground ">
 Planilhas selecionadas
 </div>
 <div className="max-h-64 overflow-auto">
 {selectedImportRows.map((row) => (
 <div
 key={row.key}
 className="grid gap-2 border-b border-border/60 px-3 py-2 text-[13px] last:border-b-0 md:grid-cols-[1fr_120px_120px]"
 >
 <div className="min-w-0">
 <div className="truncate font-medium">{row.nome}</div>
 <div className="truncate text-[11px] text-muted-foreground">
 {row.filename ??
 row.cabecalhoColuna ??"Arquivo gerado"}
 </div>
 </div>
 <div className="font-mono text-xs">Orgao {row.orgaoPk}</div>
 <div className="font-mono text-xs">UO {row.unidadePk}</div>
 </div>
 ))}
 </div>
 </div>
 </div>

 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setM2aConfirmOpen(false)}
 disabled={busy}
 >
 Cancelar
 </Button>
 <Button
 type="button"
 onClick={confirmarCriacaoProcessoM2A}
 disabled={busy}
 >
 <Send className="size-4" />
 Confirmar Inicio
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 <IrpSecretariaConfigModal
 open={!!configModal}
 onOpenChange={(open) => !open && setConfigModal(null)}
 secretariaRowId={configModal?.rowId ?? null}
 secretariaNome={configModal?.nome ?? ""}
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
