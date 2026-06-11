import { createFileRoute, useNavigate } from"@tanstack/react-router";
import { routeHead } from"@/lib/route-head";
import { useEffect, useMemo, useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { AppShell } from"@/components/layout/AppShell";
import { EmptyState } from"@/components/layout/EmptyState";
import { WorkflowGuide } from"@/components/layout/WorkflowGuide";
import { useProgress } from"@/contexts/ProgressContext";
import { supabase } from"@/integrations/supabase/client";
import { Button } from"@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from"@/components/ui/card";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from"@/components/ui/table";
import { Badge } from"@/components/ui/badge";
import { Checkbox } from"@/components/ui/checkbox";
import { Separator } from"@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from"@/components/ui/tabs";
import {
 Collapsible,
 CollapsibleTrigger,
 CollapsibleContent,
} from"@/components/ui/collapsible";
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
import {
 Upload,
 FileSpreadsheet,
 CheckCircle2,
 AlertTriangle,
 Trash2,
 ShieldCheck,
 Building2,
 Loader2,
 ChevronDown,
 FileSignature,
 FileText,
 Send,
} from"lucide-react";
import { toast } from"sonner";
import {
 readWorkbook,
 parseContratoXlsx,
 agruparContratos,
 type ContratoPreliminar,
 type AllowedRefs,
} from"@/lib/contratoImport";
import {
 formatBRL,
 formatNumber,
 normalizeContratoBase,
 normalizeText,
} from"@/lib/normalize";
import { getNextContratoNumbers } from"@/lib/contrato-numbering";
import { logAudit } from"@/lib/audit";
import { Metric, ValorUnitInput } from"@/components/importar/ImportarHelpers";
import { extractM2AProcessoId } from"@/lib/m2a";
import { persistM2ASnapshot } from"@/lib/m2a-snapshot";
import type { M2aSyncPayload } from"@/lib/m2a-sync";
import { fetchProcessoFromWorker } from"@/lib/m2a-worker";

export const Route = createFileRoute("/importar-contratos")({
 component: Page,
 head: () =>
 routeHead({
 path:"/importar-contratos",
 title:"Importar contratos",
 description:"Importe contratos a partir de planilhas e documentos, com validação assistida por IA.",
 noindex: true,
 }),
});

type JobRow = {
 id: string;
 original_filename: string;
 empresa: string | null;
 status: string;
 total_itens: number;
 total_contratos_previstos: number;
 total_valor: number;
 created_at: string;
 m2a_url?: string | null;
 processo_id?: string | null;
};

type SecretariaM2A = {
 id: string;
 numero: number;
 sigla: string;
 nome: string;
 m2a_ref_coluna: number | null;
 m2a_dotacao_default: string | null;
 m2a_orgao_id: string | null;
 m2a_dot_orgao_id: string | null;
 m2a_uo_id: string | null;
 m2a_dot_id: string | null;
 m2a_fiscal_codigo: string | null;
 m2a_fiscal_nome: string | null;
 m2a_fiscal_cpf: string | null;
 m2a_gestor_codigo: string | null;
 m2a_gestor_nome: string | null;
 m2a_gestor_cpf: string | null;
};

type FornecedorPreposto = {
 id: string;
 fornecedor_nome: string;
 fornecedor_nome_norm: string;
 fornecedor_cnpj: string | null;
 preposto_nome: string;
 ativo: boolean;
};

type FornecedorPrepostoTarget = {
 key: string;
 fornecedorNome: string;
 contratos: number;
};

const UNKNOWN_SUPPLIER_KEY ="__SEM_FORNECEDOR__";
const UNKNOWN_SUPPLIER_LABEL ="FORNECEDOR NÃO INFORMADO";

function normalizeFornecedorKey(value: string | null | undefined) {
 const normalized = normalizeText(value ??"")
 .replace(/\s+/g,"")
 .trim();
 return normalized || UNKNOWN_SUPPLIER_KEY;
}

function resolveFornecedorNome(
 contrato: Pick<ContratoPreliminar,"fornecedorNome" |"empresa">,
) {
 const fornecedor = String(
 contrato.fornecedorNome ?? contrato.empresa ??"",
 ).trim();
 return fornecedor || UNKNOWN_SUPPLIER_LABEL;
}

function resolveFornecedorKey(
 contrato: Pick<ContratoPreliminar,"fornecedorNome" |"empresa">,
) {
 return normalizeFornecedorKey(resolveFornecedorNome(contrato));
}

function resolveSecretariaForContrato(
 contrato: Pick<ContratoPreliminar,"secretariaSigla" |"dotacao">,
 secretarias: SecretariaM2A[],
) {
 const sigla = contrato.secretariaSigla?.toUpperCase();
 return (
 secretarias.find(
 (s) =>
 s.sigla?.toUpperCase() === sigla &&
 s.m2a_dotacao_default === contrato.dotacao,
 ) ?? secretarias.find((s) => s.sigla?.toUpperCase() === sigla)
 );
}

function hasM2AActors(sec?: SecretariaM2A | null) {
 return [
 sec?.m2a_orgao_id,
 sec?.m2a_dot_orgao_id,
 sec?.m2a_uo_id,
 sec?.m2a_dot_id,
 sec?.m2a_fiscal_codigo,
 sec?.m2a_gestor_codigo,
 ].every(Boolean);
}

type SyncedAtaItem = M2aSyncPayload["itens"][number] & {
 ata?: M2aSyncPayload["atas"][number];
};

function compactNumber(value: unknown) {
 const raw = String(value ??"").trim();
 const digits = raw.match(/\d+/)?.[0] ??"";
 return digits.replace(/^0+/,"") || digits;
}

function supplierMatches(itemEmpresa: string | null | undefined, ataNome ="") {
 const empresa = normalizeText(itemEmpresa);
 const fornecedor = normalizeText(ataNome);
 if (!empresa || !fornecedor) return false;
 return empresa.includes(fornecedor) || fornecedor.includes(empresa);
}

function resolveM2AItemMatch(
 item: {
 empresa?: string | null;
 numeroItem?: string;
 ordemItem?: number | null;
 descricao?: string;
 valorUnitario?: number;
 },
 syncedItems: SyncedAtaItem[],
) {
 const targetNumero =
 compactNumber(item.numeroItem) || compactNumber(item.ordemItem);
 if (!targetNumero) return null;

 const numberMatches = syncedItems.filter(
 (candidate) => compactNumber(candidate.numero_item) === targetNumero,
 );
 if (numberMatches.length === 0) return null;

 const supplierMatchesList = numberMatches.filter((candidate) =>
 supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome),
 );
 const pool =
 supplierMatchesList.length > 0 ? supplierMatchesList : numberMatches;

 const scored = pool
 .map((candidate) => {
 let score = 50;
 if (supplierMatches(item.empresa, candidate.ata?.fornecedor?.nome))
 score += 40;
 if (
 item.descricao &&
 normalizeText(candidate.descricao).includes(
 normalizeText(item.descricao).slice(0, 24),
 )
 ) {
 score += 10;
 }
 if (
 item.valorUnitario &&
 Math.abs(
 Number(candidate.valor_unitario ?? 0) - Number(item.valorUnitario),
 ) < 0.01
 ) {
 score += 5;
 }
 return { candidate, score };
 })
 .sort((a, b) => b.score - a.score);

 const best = scored[0];
 if (!best) return null;
 const tied = scored.filter((item) => item.score === best.score);
 return {
 item: best.candidate,
 score: best.score,
 status: tied.length > 1 && best.score < 90 ?"ambigua" :"auto",
 };
}

function countPreviewContractsWithAta(
 parsedItems: ReturnType<typeof parseContratoXlsx>["itens"],
 assignments: Map<number, string | null>,
) {
 const keys = new Set<string>();
 for (const item of parsedItems) {
 for (const dotacao of item.dotacoes) {
 keys.add(
 [
 item.empresa,
 dotacao.secretariaSigla,
 dotacao.dotacao,
 assignments.get(item.sourceRow) ??"sem-ata",
 ].join("|"),
 );
 }
 }
 return keys.size;
}

function Page() {
 const navigate = useNavigate();
 const qc = useQueryClient();
 const { startTask, updateProgress, finishTask, failTask } = useProgress();
 const [file, setFile] = useState<File | null>(null);
 const [busy, setBusy] = useState(false);
 const [activeJobId, setActiveJobId] = useState<string | null>(null);
 const [m2aProcessoUrl, setM2aProcessoUrl] = useState("");
 const [numeroProcessoBase, setNumeroProcessoBase] = useState("");
 const [prepostosByFornecedor, setPrepostosByFornecedor] = useState<
 Record<string, string>
 >({});
 const [processoId, setProcessoId] = useState<string>("");
 const [objetoBatch, setObjetoBatch] = useState("");
 const [dataBatch] = useState<string>("");
 const [criarProcesso, setCriarProcesso] = useState(true);

 const { data: processos } = useQuery({
 queryKey: ["processos-min"],
 queryFn: async () =>
 (
 await supabase
 .from("processos")
 .select("id, numero_processo, objeto, m2a_url, m2a_processo_id, m2a_sync_at",
 )
 .is("deleted_at", null)
 .order("created_at", { ascending: false })
 .limit(100)
 ).data ?? [],
 });

 // Auto-preenche Nº base e Objeto quando um processo existente é vinculado.
 // Prepostos ficam por fornecedor e são definidos na etapa de autorização.
 useEffect(() => {
 if (!processoId) return;
 const p = (processos ?? []).find((x: any) => x.id === processoId);
 if (!p) return;
 if (p.numero_processo) setNumeroProcessoBase(p.numero_processo);
 if (p.objeto) setObjetoBatch(p.objeto);
 }, [processoId, processos]);

 const { data: secretarias } = useQuery({
 queryKey: ["secretarias-min"],
 queryFn: async () => {
 const { data } = await supabase
 .from("secretarias")
 .select("id, numero, sigla, nome, m2a_ref_coluna, m2a_dotacao_default, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
 )
 .eq("ativa", true);
 // Tentar enriquecer com CPFs (apenas admin/gestor): falha silenciosa para outros papéis.
 // Passamos {} explicitamente para evitar 400 do PostgREST quando o body é undefined.
 let cpfs: Array<{ id: string; m2a_gestor_cpf: string | null; m2a_fiscal_cpf: string | null }> = [];
 try {
 const { data, error } = await supabase.rpc("get_secretarias_cpfs");
 if (!error && Array.isArray(data)) cpfs = data as typeof cpfs;
 } catch {
 // usuário sem permissão -> seguimos sem CPFs
 }
 const cpfMap = new Map<string, { gestor: string | null; fiscal: string | null }>();
 cpfs.forEach((c) =>
 cpfMap.set(c.id, { gestor: c.m2a_gestor_cpf, fiscal: c.m2a_fiscal_cpf }),
 );
 return (data ?? []).map((s: any) => ({
 ...s,
 m2a_fiscal_cpf: cpfMap.get(s.id)?.fiscal ?? null,
 m2a_gestor_cpf: cpfMap.get(s.id)?.gestor ?? null,
 }));
 },
 });

 const { data: fornecedoresPrepostos = [] } = useQuery({
 queryKey: ["fornecedores-prepostos-ativos"],
 queryFn: async () => {
 const { data, error } = await supabase
 .from("fornecedores_prepostos")
 .select("*")
 .eq("ativo", true)
 .order("fornecedor_nome");
 if (error) throw error;
 return (data ?? []) as FornecedorPreposto[];
 },
 });

 const { data: jobs } = useQuery({
 queryKey: ["cij-list"],
 queryFn: async () => {
 const { data } = await supabase
 .from("contrato_import_jobs")
 .select("*")
 .order("created_at", { ascending: false })
 .limit(50);
 return (data ?? []) as JobRow[];
 },
 });

 const { data: jobDetail, isFetching: detailFetching } = useQuery({
 queryKey: ["cij-detail", activeJobId],
 enabled: !!activeJobId,
 queryFn: async () => {
 const [job, itens, dotacoes] = await Promise.all([
 supabase
 .from("contrato_import_jobs")
 .select("*")
 .eq("id", activeJobId!)
 .single(),
 supabase
 .from("contrato_import_itens")
 .select("*")
 .eq("job_id", activeJobId!)
 .order("source_row"),
 supabase
 .from("contrato_import_dotacoes")
 .select("*")
 .eq("job_id", activeJobId!),
 ]);
 if (job.error) throw job.error;
 return {
 job: job.data,
 itens: itens.data ?? [],
 dotacoes: dotacoes.data ?? [],
 };
 },
 });

 const activeJobProcessoId = (jobDetail?.job as any)?.processo_id as
 | string
 | null
 | undefined;

 const { data: m2aAtas = [] } = useQuery({
 queryKey: ["m2a-atas-import", activeJobProcessoId],
 enabled: !!activeJobProcessoId,
 queryFn: async () => {
 const { data, error } = await supabase
 .from("m2a_atas")
 .select("m2a_ata_id, numero_ata, fornecedor_nome, fornecedor_cnpj")
 .eq("processo_id", activeJobProcessoId!)
 .order("numero_ata");
 if (error) throw error;
 return data ?? [];
 },
 });

 const { data: m2aItens = [] } = useQuery({
 queryKey: ["m2a-itens-import", activeJobProcessoId],
 enabled: !!activeJobProcessoId,
 queryFn: async () => {
 const { data, error } = await supabase
 .from("m2a_itens")
 .select("m2a_ata_id, m2a_item_id, numero_item, descricao, unidade")
 .eq("processo_id", activeJobProcessoId!)
 .order("numero_item");
 if (error) throw error;
 return data ?? [];
 },
 });

 const contratosPreliminares: ContratoPreliminar[] = useMemo(() => {
 if (!jobDetail) return [];
 return agruparContratos(jobDetail.itens as any, jobDetail.dotacoes as any);
 }, [jobDetail]);

 const fornecedoresPrepostoTargets = useMemo<
 FornecedorPrepostoTarget[]
 >(() => {
 const map = new Map<string, FornecedorPrepostoTarget>();
 for (const contrato of contratosPreliminares) {
 const key = resolveFornecedorKey(contrato);
 const fornecedorNome = resolveFornecedorNome(contrato);
 const current = map.get(key);
 if (current) {
 current.contratos += 1;
 } else {
 map.set(key, { key, fornecedorNome, contratos: 1 });
 }
 }
 return [...map.values()].sort((a, b) =>
 a.fornecedorNome.localeCompare(b.fornecedorNome,"pt-BR", {
 numeric: true,
 }),
 );
 }, [contratosPreliminares]);

 const fornecedorMapFromDb = useMemo(() => {
 return new Map(
 fornecedoresPrepostos.map((item) => [
 normalizeFornecedorKey(
 item.fornecedor_nome_norm || item.fornecedor_nome,
 ),
 item.preposto_nome,
 ]),
 );
 }, [fornecedoresPrepostos]);

 useEffect(() => {
 setPrepostosByFornecedor((current) => {
 const allowed = new Set(
 fornecedoresPrepostoTargets.map((item) => item.key),
 );
 const next: Record<string, string> = {};

 for (const [key, value] of Object.entries(current)) {
 if (allowed.has(key)) next[key] = value;
 }

 for (const item of fornecedoresPrepostoTargets) {
 const existing = next[item.key]?.trim();
 if (existing) continue;
 const saved = fornecedorMapFromDb.get(item.key)?.trim() ??"";
 next[item.key] = saved;
 }

 return next;
 });
 }, [fornecedorMapFromDb, fornecedoresPrepostoTargets]);

 const fornecedoresSemPreposto = useMemo(
 () =>
 fornecedoresPrepostoTargets.filter(
 (target) => !prepostosByFornecedor[target.key]?.trim(),
 ),
 [fornecedoresPrepostoTargets, prepostosByFornecedor],
 );

 const secretariasM2A = useMemo(
 () => (secretarias as SecretariaM2A[] | undefined) ?? [],
 [secretarias],
 );

 const contratosComSecretaria = useMemo(
 () =>
 contratosPreliminares.map((contrato) => ({
 contrato,
 secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
 })),
 [contratosPreliminares, secretariasM2A],
 );

 const contratosSemCadastroM2A = useMemo(
 () =>
 contratosComSecretaria.filter(
 ({ secretaria }) => !hasM2AActors(secretaria),
 ),
 [contratosComSecretaria],
 );

 const contratosSemAtaM2A = useMemo(
 () => contratosPreliminares.filter((contrato) => !contrato.m2aAtaId),
 [contratosPreliminares],
 );

 async function handleImportar() {
 if (!file) return;
 const m2aUrl = m2aProcessoUrl.trim();
 const m2aProcessoId = extractM2AProcessoId(m2aUrl);
 if (!m2aProcessoId) {
 return toast.error("Informe o link válido do processo no portal.");
 }

 console.group("M2A: Iniciando Importação de Planilha");
 console.time("TempoTotalImportacao");
 console.log("Arquivo selecionado:", file.name, `(${file.size} bytes)`);
 console.log("Processo M2A:", { m2aUrl, m2aProcessoId });

 const allowedRefs: AllowedRefs = new Map();
 console.log("Passo 0: Mapeando secretarias autorizadas do banco...");
 for (const s of (secretarias ?? []) as any[]) {
 if (s.m2a_ref_coluna && s.m2a_dotacao_default) {
 allowedRefs.set(Number(s.m2a_ref_coluna), {
 sigla: s.sigla,
 dotacao: s.m2a_dotacao_default,
 });
 }
 }

 if (allowedRefs.size === 0) {
 console.warn("Abortando: Nenhuma secretaria configurada com ref_coluna e dotação default.",
 );
 return toast.error("Nenhuma secretaria cadastrada com ref. coluna + dotação. Cadastre em /secretarias antes de importar.",
 );
 }
 console.log(`Secretarias aptas encontradas: ${allowedRefs.size}`);

 startTask("Analisando planilha","Preparando leitura do arquivo...");
 setBusy(true);
 try {
 updateProgress(8,"Lendo arquivo da planilha...");
 console.log("Passo 1: Lendo arquivo binário e convertendo para matriz...",
 );
 const matrix = await readWorkbook(file);
 console.log(`Leitura concluída: ${matrix.length} linhas detectadas.`);

 updateProgress(18,"Extraindo itens, dotações e fornecedores...");
 console.log("Passo 2: Executando extração de dados (Regras de Negócio)...",
 );
 const parsed = parseContratoXlsx(matrix, allowedRefs);
 console.log("Resultado do Parse:", parsed);

 if (parsed.refsIgnoradas.length > 0) {
 console.warn("Colunas ignoradas por falta de vínculo no cadastro:",
 parsed.refsIgnoradas,
 );
 toast.warning(
 `Aviso: ${parsed.refsIgnoradas.length} coluna(s) da planilha foram ignoradas pois as secretarias/unidades não foram encontradas no cadastro.`,
 {
 description: `Colunas ignoradas: ${parsed.refsIgnoradas.join(",")}`,
 duration: 8000,
 },
 );
 }

 updateProgress(32,"Criando ou vinculando processo local...");
 console.log("Passo 3: Criando/reaproveitando processo local...");
 const { data: processoExistente, error: procLookupErr } = await supabase
 .from("processos")
 .select("id, numero_processo, objeto")
 .eq("m2a_processo_id", m2aProcessoId)
 .is("deleted_at", null)
 .maybeSingle();
 if (procLookupErr) throw procLookupErr;

 let processoImportId = processoExistente?.id ?? null;
 if (!processoImportId) {
 const { data: novoProc, error: novoProcErr } = await supabase
 .from("processos")
 .insert({
 numero_processo: null,
 objeto: `Importação de contratos - ${file.name}`,
 status:"em_andamento",
 m2a_url: m2aUrl,
 m2a_processo_id: m2aProcessoId,
 })
 .select("id")
 .single();
 if (novoProcErr) throw novoProcErr;
 processoImportId = novoProc.id;
 } else {
 await supabase
 .from("processos")
 .update({ m2a_url: m2aUrl, m2a_processo_id: m2aProcessoId })
 .eq("id", processoImportId);
 }
 updateProgress(48,"Sincronizando atas e itens no portal...");
 console.log("Passo 4: Sincronizando atas/itens/contratos no portal...");
 toast.loading("Varrendo atas e itens do processo no portal...", {
 id:"m2a-import-sync",
 });
 const snapshot = await (async () => {
 const syncT0 = performance.now();
 console.groupCollapsed("[m2a-import] Passo 4 — worker/VPS");
 try {
 console.log("[m2a-import] → fetchProcessoFromWorker", {
 m2aUrl,
 m2aProcessoId,
 });
 const workerSnapshot = await fetchProcessoFromWorker(m2aUrl);
 console.log(
 `[m2a-import] ✓ worker respondeu em ${(performance.now() - syncT0).toFixed(0)}ms`,
 {
 atas: workerSnapshot.atas?.length ?? 0,
 itens: workerSnapshot.itens?.length ?? 0,
 contratos: workerSnapshot.contratos_existentes?.length ?? 0,
 resumo: workerSnapshot.resumo,
 },
 );
 console.log("[m2a-import] → persistM2ASnapshot");
 await persistM2ASnapshot(processoImportId, workerSnapshot);
 console.log(
 `[m2a-import] ✓ Passo 4 concluído em ${(performance.now() - syncT0).toFixed(0)}ms`,
 );
 return workerSnapshot;
 } finally {
 console.groupEnd();
 }
 })();
 toast.success(
 `Base externa sincronizada: ${snapshot.atas.length} ata(s), ${snapshot.itens.length} item(ns).`,
 { id:"m2a-import-sync" },
 );

 const ataById = new Map(snapshot.atas.map((ata) => [ata.id_ata, ata]));
 const syncedItems: SyncedAtaItem[] = snapshot.itens.map((item) => ({
 ...item,
 ata: ataById.get(item.id_ata),
 }));
 const assignments = new Map<number, string | null>();
 const itemMatches = new Map<
 number,
 ReturnType<typeof resolveM2AItemMatch>
 >();
 updateProgress(
 66,"Relacionando itens da planilha com a base do portal...",
 );
 for (const item of parsed.itens) {
 const match = resolveM2AItemMatch(item, syncedItems);
 itemMatches.set(item.sourceRow, match);
 assignments.set(
 item.sourceRow,
 match?.status ==="auto" ? match.item.id_ata : null,
 );
 }
 console.groupCollapsed("[Importacao] Diagnostico do match item x ata");
 console.table(
 parsed.itens.map((item) => {
 const match = itemMatches.get(item.sourceRow);
 return {
 linha: item.sourceRow,
 numero_item: item.numeroItem || item.ordemItem ||"",
 empresa: item.empresa,
 descricao: item.descricao,
 status: match?.status ??"sem_match",
 score: match?.score ?? 0,
 ata_id: match?.item.id_ata ??"",
 ata_numero: match?.item.ata?.numero_ata ??"",
 fornecedor_ata: match?.item.ata?.fornecedor?.nome ??"",
 item_m2a: match?.item.numero_item ??"",
 };
 }),
 );
 console.groupEnd();
 const totalContratosComAta = countPreviewContractsWithAta(
 parsed.itens,
 assignments,
 );

 updateProgress(78,"Salvando prévia de importação...");
 console.log("Passo 5: Persistindo JOB de importação no Supabase...");
 const { data: jobRow, error: jobErr } = await supabase
 .from("contrato_import_jobs")
 .insert({
 original_filename: file.name,
 status:"preview",
 processo_id: processoImportId,
 m2a_url: m2aUrl,
 m2a_processo_id: m2aProcessoId,
 m2a_sync_at: new Date().toISOString(),
 empresa: parsed.empresa,
 linha_cabecalho: parsed.linhaCabecalho,
 total_itens: parsed.itens.length,
 total_contratos_previstos: totalContratosComAta,
 total_valor: parsed.totalValor,
 })
 .select()
 .single();

 if (jobErr) {
 console.error("Falha ao criar contrato_import_jobs:", jobErr);
 throw jobErr;
 }
 console.log("Job criado. ID:", jobRow.id);

 console.log(
 `Passo 6: Inserindo ${parsed.itens.length} itens para revisão...`,
 );
 const itensInsert = parsed.itens.map((i) => ({
 ...(() => {
 const match = itemMatches.get(i.sourceRow);
 const canApplyMatch = match?.status ==="auto";
 const ata = canApplyMatch ? match?.item.ata : null;
 return {
 m2a_ata_id: canApplyMatch ? (match?.item.id_ata ?? null) : null,
 m2a_item_id: canApplyMatch ? (match?.item.id_item ?? null) : null,
 m2a_ata_numero: ata?.numero_ata ?? null,
 m2a_fornecedor_nome: ata?.fornecedor?.nome ?? null,
 m2a_match_status: match?.status ??"sem_match",
 m2a_match_score: match?.score ?? 0,
 };
 })(),
 job_id: jobRow.id,
 source_row: i.sourceRow,
 empresa: i.empresa,
 lote: i.lote,
 numero_item:
 compactNumber(i.numeroItem) ||
 compactNumber(itemMatches.get(i.sourceRow)?.item.numero_item) ||
 null,
 ordem_item: i.ordemItem,
 descricao: i.descricao,
 especificacao: i.especificacao,
 unidade: i.unidade,
 valor_unitario: i.valorUnitario,
 }));
 const { data: insertedItens, error: itErr } = await supabase
 .from("contrato_import_itens")
 .insert(itensInsert)
 .select("id, source_row");

 if (itErr) {
 console.error("Falha ao inserir itens preliminares:", itErr);
 throw itErr;
 }
 console.log("Itens inseridos.");

 console.log("Passo 7: Vinculando dotações e quantidades aos itens...");
 const rowToId = new Map(insertedItens.map((r) => [r.source_row, r.id]));
 const dotInsert = parsed.itens.flatMap((i) =>
 i.dotacoes.map((d) => ({
 job_id: jobRow.id,
 item_id: rowToId.get(i.sourceRow)!,
 secretaria_sigla: d.secretariaSigla,
 dotacao: d.dotacao,
 ref_coluna: d.refColuna,
 quantidade: d.quantidade,
 })),
 );
 if (dotInsert.length) {
 updateProgress(90,"Salvando dotações e quantidades...");
 console.log(`Inserindo ${dotInsert.length} dotações...`);
 const { error: dErr } = await supabase
 .from("contrato_import_dotacoes")
 .insert(dotInsert);
 if (dErr) {
 console.error("Falha ao inserir dotações:", dErr);
 throw dErr;
 }
 console.log("Dotações inseridas.");
 }

 console.log("Passo 8: Registrando log de auditoria...");
 await logAudit({
 action:"contrato_import",
 entityType:"contrato_import_job",
 entityId: jobRow.id,
 payload: {
 filename: file.name,
 itens: parsed.itens.length,
 contratos: totalContratosComAta,
 processo_id: processoImportId,
 m2a_processo_id: m2aProcessoId,
 },
 });

 toast.success(
 `Planilha importada — ${parsed.itens.length} itens, ${totalContratosComAta} contratos previstos`,
 );
 finishTask("Planilha analisada com sucesso.");
 setActiveJobId(jobRow.id);
 setFile(null);
 setM2aProcessoUrl("");
 qc.invalidateQueries({ queryKey: ["cij-list"] });
 console.log("Fluxo de importação finalizado.");
 } catch (e: any) {
 console.error("ERRO CRÍTICO NA IMPORTAÇÃO:", e);
 failTask(e?.message ??"Falha ao importar planilha.");
 toast.error("Falha ao importar planilha", { description: e?.message });
 } finally {
 console.timeEnd("TempoTotalImportacao");
 console.groupEnd();
 setBusy(false);
 }
 }

 async function atualizarItem(
 id: string,
 patch: {
 valor_unitario?: number;
 excluido?: boolean;
 descricao?: string;
 unidade?: string;
 m2a_ata_id?: string | null;
 m2a_item_id?: string | null;
 m2a_ata_numero?: string | null;
 m2a_fornecedor_nome?: string | null;
 numero_item?: string | null;
 m2a_match_status?: string;
 m2a_match_score?: number;
 },
 ) {
 console.log(`Atualizando item ${id}...`, patch);
 const { error } = await supabase
 .from("contrato_import_itens")
 .update(patch)
 .eq("id", id);
 if (error) {
 console.error("Erro ao atualizar item:", error);
 return toast.error(error.message);
 }
 qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
 }

 async function atualizarAtaItem(item: any, ataId: string) {
 if (ataId ==="__none__") {
 await atualizarItem(item.id, {
 m2a_ata_id: null,
 m2a_item_id: null,
 m2a_ata_numero: null,
 m2a_fornecedor_nome: null,
 m2a_match_status:"manual_sem_ata",
 m2a_match_score: 0,
 });
 return;
 }

 const ata = m2aAtas.find((row: any) => row.m2a_ata_id === ataId);
 const numeroAlvo =
 compactNumber(item.numero_item) || compactNumber(item.ordem_item);
 const m2aItem = m2aItens.find(
 (row: any) =>
 row.m2a_ata_id === ataId &&
 compactNumber(row.numero_item) === numeroAlvo,
 );

 if (!m2aItem) {
 console.warn("[Importacao] Ata selecionada sem item M2A correspondente ao numero da planilha.",
 {
 itemId: item.id,
 ataId,
 numeroPlanilha: item.numero_item,
 ordemPlanilha: item.ordem_item,
 descricao: item.descricao,
 },
 );
 }

 await atualizarItem(item.id, {
 m2a_ata_id: ataId,
 m2a_item_id: (m2aItem as any)?.m2a_item_id ?? null,
 m2a_ata_numero: (ata as any)?.numero_ata ?? null,
 m2a_fornecedor_nome: (ata as any)?.fornecedor_nome ?? null,
 numero_item: (m2aItem as any)?.numero_item ?? item.numero_item ?? null,
 m2a_match_status: m2aItem ?"manual" :"manual_sem_item",
 m2a_match_score: m2aItem ? 100 : 70,
 });
 }

 async function alternarDotacao(id: string, ignorar: boolean) {
 console.log(`Alternando status da dotação ${id} para ignorado=${ignorar}`);
 const { error } = await supabase
 .from("contrato_import_dotacoes")
 .update({ ignorado: ignorar })
 .eq("id", id);
 if (error) {
 console.error("Erro ao alternar dotação:", error);
 return toast.error(error.message);
 }
 qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
 }

 async function excluirJob(id: string) {
 console.log(`Solicitação de exclusão total do Job ${id}...`);
 const { error: dErr } = await supabase
 .from("contrato_import_dotacoes")
 .delete()
 .eq("job_id", id);
 if (dErr) return toast.error(dErr.message);
 const { error: iErr } = await supabase
 .from("contrato_import_itens")
 .delete()
 .eq("job_id", id);
 if (iErr) return toast.error(iErr.message);
 const { error: jErr } = await supabase
 .from("contrato_import_jobs")
 .delete()
 .eq("id", id);
 if (jErr) return toast.error(jErr.message);
 if (activeJobId === id) setActiveJobId(null);
 toast.success("Importação excluída");
 qc.invalidateQueries({ queryKey: ["cij-list"] });
 }

 async function autorizarGeracao() {
 if (!jobDetail) return;
 console.group("M2A: Geração de Contratos em Lote");
 console.time("ProcessoGeracaoLote");

 // Validações de UI antes de prosseguir
 console.log("Passo 1: Validando informações do lote...");
 const numeroBaseContrato = normalizeContratoBase(numeroProcessoBase);
 if (!numeroBaseContrato)
 return toast.error("Informe o nº base do processo (ex.: 026/2025)");
 if (fornecedoresSemPreposto.length > 0) {
 console.table(
 fornecedoresSemPreposto.map((target) => ({
 fornecedor: target.fornecedorNome,
 contratos: target.contratos,
 })),
 );
 return toast.error("Preposto pendente por fornecedor.", {
 description:"Preencha o nome do preposto para cada fornecedor listado na aba Autorizar geração.",
 });
 }
 if (!objetoBatch.trim())
 return toast.error("Informe o objeto desta geração de contratos");
 if (contratosPreliminares.length === 0)
 return toast.error("Nenhum contrato a gerar");
 if (contratosSemAtaM2A.length > 0) {
 console.table(
 contratosSemAtaM2A.map((contrato) => ({
 fornecedor: contrato.empresa,
 secretaria: contrato.secretariaSigla,
 dotacao: contrato.dotacao,
 itens: contrato.itens.map((item) => item.numeroItem).join(","),
 })),
 );
 return toast.error("Há contratos sem ata definida.", {
 description:"Revise a aba Itens e selecione a ata correta para os itens sem vínculo.",
 });
 }
 if (contratosSemCadastroM2A.length > 0) {
 console.table(
 contratosSemCadastroM2A.map(({ contrato, secretaria }) => ({
 sigla: contrato.secretariaSigla,
 dotacao: contrato.dotacao,
 secretaria: secretaria?.nome ??"não encontrada",
 unidade_gestora: secretaria?.m2a_orgao_id,
 orgao_dotacao: secretaria?.m2a_dot_orgao_id,
 unidade_orcamentaria: secretaria?.m2a_uo_id,
 despesa_projeto_atividade: secretaria?.m2a_dot_id,
 fiscal_id: secretaria?.m2a_fiscal_codigo,
 gestor_id: secretaria?.m2a_gestor_codigo,
 })),
 );
 return toast.error("Cadastro externo incompleto", {
 description:"Complete Unidade Gestora, Órgão da Dotação, UO, Dotação, Fiscal e Gestor em /secretarias antes de gerar os contratos.",
 });
 }

 console.log("Dados validados:", {
 objeto: objetoBatch,
 qtdContratos: contratosPreliminares.length,
 });

 startTask("Gerando contratos",
 `Preparando ${contratosPreliminares.length} contrato(s)...`,
 );
 setBusy(true);
 try {
 // Resolve processo: usar selecionado OU criar um novo agrupando o lote.
 let processoIdFinal: string | null =
 ((jobDetail.job as any).processo_id as string | null) ||
 processoId ||
 null;
 let processoCriadoNestaGeracao = false;
 if (!processoIdFinal && criarProcesso) {
 updateProgress(8,"Criando processo administrativo...");
 console.log("Passo 2: Criando novo processo administrativo para o lote...",
 );
 const { data: novoProc, error: procErr } = await supabase
 .from("processos")
 .insert({
 numero_processo: numeroProcessoBase || null,
 objeto: objetoBatch,
 data_abertura: dataBatch,
 status:"em_andamento",
 m2a_url: (jobDetail.job as any).m2a_url ?? null,
 m2a_processo_id: (jobDetail.job as any).m2a_processo_id ?? null,
 })
 .select("id")
 .single();

 if (procErr) {
 console.error("Falha ao criar processo:", procErr);
 throw procErr;
 }
 processoIdFinal = novoProc.id;
 processoCriadoNestaGeracao = true;
 console.log("Processo criado com ID:", novoProc.id);
 await logAudit({
 action:"create",
 entityType:"processo",
 entityId: novoProc.id,
 payload: { origem:"importar-contratos", objeto: objetoBatch },
 });
 } else {
 updateProgress(8,"Vinculando processo administrativo existente...");
 console.log("Passo 2: Utilizando processo administrativo existente. ID:",
 processoIdFinal,
 );
 if (processoIdFinal) {
 await supabase
 .from("processos")
 .update({
 numero_processo: numeroProcessoBase || null,
 objeto: objetoBatch,
 status:"em_andamento",
 m2a_url: (jobDetail.job as any).m2a_url ?? null,
 m2a_processo_id: (jobDetail.job as any).m2a_processo_id ?? null,
 })
 .eq("id", processoIdFinal);
 }
 }

 // Para cada contrato preliminar, alocar nº na secretaria de forma ATÔMICA via RPC em lote.
 console.log("Passo 3: Reservando numeração sequencial automática...");
 updateProgress(18,"Reservando numeração automática...");
 const preliminaresResolvidos = contratosPreliminares.map((contrato) => ({
 contrato,
 secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
 }));

 const semSecretaria = preliminaresResolvidos.filter(
 ({ secretaria }) => !secretaria,
 );
 if (semSecretaria.length > 0) {
 console.table(
 semSecretaria.map(({ contrato }) => ({
 sigla: contrato.secretariaSigla,
 dotacao: contrato.dotacao,
 })),
 );
 throw new Error("Há contratos sem secretaria correspondente. Confira sigla + dotação no cadastro de secretarias.",
 );
 }

 const semM2A = preliminaresResolvidos.filter(
 ({ secretaria }) => !hasM2AActors(secretaria),
 );
 if (semM2A.length > 0) {
 console.table(
 semM2A.map(({ contrato, secretaria }) => ({
 sigla: contrato.secretariaSigla,
 dotacao: contrato.dotacao,
 secretaria: secretaria?.nome,
 unidade_gestora: secretaria?.m2a_orgao_id,
 orgao_dotacao: secretaria?.m2a_dot_orgao_id,
 unidade_orcamentaria: secretaria?.m2a_uo_id,
 despesa_projeto_atividade: secretaria?.m2a_dot_id,
 fiscal_id: secretaria?.m2a_fiscal_codigo,
 gestor_id: secretaria?.m2a_gestor_codigo,
 })),
 );
 throw new Error("Há secretarias sem Unidade Gestora, Órgão da Dotação, UO, Dotação, Fiscal ou Gestor cadastrados.",
 );
 }

 const porSecretaria = new Map<
 string,
 { secretaria: SecretariaM2A; qtd: number }
 >();
 for (const { secretaria } of preliminaresResolvidos) {
 const sec = secretaria!;
 const key = `${sec.numero}:${sec.sigla}`;
 const atual = porSecretaria.get(key) ?? { secretaria: sec, qtd: 0 };
 atual.qtd += 1;
 porSecretaria.set(key, atual);
 }

 const proximoPorSec = new Map<
 string,
 Awaited<ReturnType<typeof getNextContratoNumbers>>
 >();
 for (const [secKey, { secretaria: sec, qtd }] of porSecretaria) {
 console.log(
 `[Numeracao] Reservando bloco de ${qtd} números para ${sec.sigla} / ${sec.nome}...`,
 );

 const numeros = await getNextContratoNumbers(supabase, {
 numeroBase: numeroBaseContrato,
 secretariaSigla: sec.sigla,
 quantidade: qtd,
 });
 const ultimoNumero = numeros.at(-1);
 if (!ultimoNumero) {
 throw new Error(`Falha ao reservar numeração para ${sec.sigla}.`);
 }

 const { error: numeracaoError } = await supabase
 .from("numeracao")
 .upsert(
 {
 secretaria_num: sec.numero,
 contador: ultimoNumero.sequencia,
 updated_at: new Date().toISOString(),
 },
 { onConflict:"secretaria_num" },
 );
 if (numeracaoError) {
 throw new Error(
 `Falha ao atualizar contador de ${sec.sigla}: ${numeracaoError.message}`,
 );
 }
 proximoPorSec.set(secKey, numeros);
 console.log(
 `Reserva para ${sec.sigla} OK. Bloco: ${numeros.map((item) => item.numeroContrato).join(",")}`,
 );
 }

 const fornecedoresPersistiveis = fornecedoresPrepostoTargets
 .filter((target) => target.key !== UNKNOWN_SUPPLIER_KEY)
 .map((target) => ({
 fornecedor_nome: target.fornecedorNome,
 fornecedor_nome_norm: target.key,
 preposto_nome: prepostosByFornecedor[target.key].trim(),
 ativo: true,
 }));

 if (fornecedoresPersistiveis.length > 0) {
 updateProgress(30,"Atualizando prepostos por fornecedor...");
 const { error: fornecedorErr } = await supabase
 .from("fornecedores_prepostos")
 .upsert(fornecedoresPersistiveis, {
 onConflict:"fornecedor_nome_norm",
 });
 if (fornecedorErr) {
 throw new Error(
 `Falha ao salvar prepostos por fornecedor: ${fornecedorErr.message}`,
 );
 }
 qc.invalidateQueries({ queryKey: ["fornecedores-prepostos-ativos"] });
 }

 console.log("Passo 4: Preparando payload de inserção massiva...");
 updateProgress(40,"Preparando contratos para gravação...");
 const inserts: any[] = [];
 const preliminarPorIndex: typeof contratosPreliminares = [];
 for (const { contrato: c, secretaria } of preliminaresResolvidos) {
 const sec = secretaria!;
 const fornecedorKey = resolveFornecedorKey(c);
 const prepostoContrato =
 prepostosByFornecedor[fornecedorKey]?.trim() ??"";
 if (!prepostoContrato) {
 throw new Error(
 `Preposto não informado para fornecedor: ${resolveFornecedorNome(c)}`,
 );
 }

 const secKey = `${sec.numero}:${sec.sigla}`;
 const nextNumber = proximoPorSec.get(secKey)?.shift();
 if (!nextNumber) continue;

 const numero = nextNumber.numeroContrato;
 inserts.push({
 numero_contrato: numero,
 secretaria_num: sec.numero,
 secretaria_id: sec.id,
 secretaria_nome: sec.nome,
 secretaria_sigla: sec.sigla,
 preposto: prepostoContrato,
 fiscal: sec.m2a_fiscal_nome ??"",
 objeto: objetoBatch,
 link_contrato: jobDetail.job.original_filename,
 status:"ativo",
 import_job_id: jobDetail.job.id,
 dotacao: c.dotacao,
 m2a_ata_id: c.m2aAtaId,
 m2a_ata_numero: c.m2aAtaNumero,
 fornecedor_nome: c.fornecedorNome,
 processo_id: processoIdFinal,
 });
 preliminarPorIndex.push(c);
 }

 // Rastreia o que foi inserido para rollback em caso de falha posterior.
 let contratosInseridosIds: string[] = [];
 const processoCriadoId: string | null = processoCriadoNestaGeracao
 ? processoIdFinal
 : null;

 try {
 console.log(
 `Passo 5: Persistindo ${inserts.length} cabeçalhos de contratos...`,
 );
 updateProgress(50, `Criando ${inserts.length} contrato(s)...`);
 const { data: contratosInseridos, error: insErr } = await supabase
 .from("contratos")
 .insert(inserts)
 .select("id");

 if (insErr) {
 console.error("Falha na inserção massiva de cabeçalhos:", insErr);
 throw insErr;
 }
 contratosInseridosIds = (contratosInseridos ?? []).map(
 (r: any) => r.id,
 );
 console.log("Cabeçalhos criados.");

 // Para cada contrato inserido, criar contrato_itens + contrato_item_dotacoes
 console.log("Passo 6: Gerando itens e dotações subordinadas (sequencial)...",
 );
 for (let i = 0; i < contratosInseridosIds.length; i++) {
 updateProgress(
 55 + ((i + 1) / Math.max(contratosInseridosIds.length, 1)) * 35,
 `Gerando contrato ${i + 1} de ${contratosInseridosIds.length}...`,
 );
 const contratoId = contratosInseridosIds[i];
 const c = preliminarPorIndex[i];
 const m2aNumeroItemById = new Map(
 m2aItens.map((item: any) => [item.m2a_item_id, item.numero_item]),
 );
 console.log(
 `[Contrato ${i + 1}/${contratosInseridosIds.length}] Gerando itens para ID ${contratoId}...`,
 );

 const itensPayload = c.itens.map((it, idx) => ({
 contrato_id: contratoId,
 ordem_item: it.ordemItem ?? idx + 1,
 numero_item:
 compactNumber(it.numeroItem) ||
 compactNumber(m2aNumeroItemById.get(it.m2aItemId ??"")) ||
 null,
 lote: it.lote || null,
 descricao: it.descricao,
 especificacao: it.especificacao || null,
 unidade: it.unidade,
 quantidade: it.quantidade,
 valor_unitario: it.valorUnitario,
 valor_total: it.subtotal,
 m2a_item_id: it.m2aItemId,
 }));

 if (itensPayload.length === 0) continue;
 const { data: itensIns, error: itensErr } = await supabase
 .from("contrato_itens")
 .insert(itensPayload)
 .select("id");

 if (itensErr) {
 console.error(
 `Erro nos itens do contrato ${contratoId}:`,
 itensErr,
 );
 throw itensErr;
 }
 const dotPayload = (itensIns ?? []).map((row) => ({
 item_id: row.id,
 secretaria_sigla: c.secretariaSigla,
 dotacao: c.dotacao,
 quantidade_alocada: 0,
 }));
 c.itens.forEach((it, idx) => {
 if (dotPayload[idx])
 dotPayload[idx].quantidade_alocada = it.quantidade;
 });
 const { error: dotErr } = await supabase
 .from("contrato_item_dotacoes")
 .insert(dotPayload);

 if (dotErr) {
 console.error(
 `Erro nas dotações do contrato ${contratoId}:`,
 dotErr,
 );
 throw dotErr;
 }
 }
 console.log("Geração de itens subordinados finalizada.");
 } catch (innerErr) {
 // Rollback: apaga contratos parcialmente inseridos (itens/dotações caem em cascata se FK existir,
 // caso contrário ficam órfãos — best-effort).
 console.error("FALHA CRÍTICA DURANTE PERSISTÊNCIA. Iniciando Rollback manual...",
 );
 if (contratosInseridosIds.length > 0) {
 console.log("[Rollback] Removendo dotações...");
 await supabase
 .from("contrato_item_dotacoes")
 .delete()
 .in("item_id",
 (
 (
 await supabase
 .from("contrato_itens")
 .select("id")
 .in("contrato_id", contratosInseridosIds)
 ).data ?? []
 ).map((r: any) => r.id),
 );
 console.log("[Rollback] Removendo itens...");
 await supabase
 .from("contrato_itens")
 .delete()
 .in("contrato_id", contratosInseridosIds);
 const rollbackDeletedAt = new Date().toISOString();
 console.log("[Rollback] Ocultando cabeçalhos...");
 await supabase
 .from("contratos")
 .update({ deleted_at: rollbackDeletedAt })
 .in("id", contratosInseridosIds);
 }
 if (processoCriadoId) {
 console.log("[Rollback] Ocultando processo criado. ID:",
 processoCriadoId,
 );
 await supabase
 .from("processos")
 .update({ deleted_at: new Date().toISOString() })
 .eq("id", processoCriadoId);
 }
 console.log("[Rollback] Limpeza finalizada.");
 throw innerErr;
 }

 console.log("Passo 7: Finalizando Job de importação...");
 updateProgress(94,"Finalizando lote de contratos...");
 await supabase
 .from("contrato_import_jobs")
 .update({
 status:"autorizado",
 authorized_at: new Date().toISOString(),
 })
 .eq("id", jobDetail.job.id);

 console.log("Passo 8: Registrando auditoria final...");
 await logAudit({
 action:"contrato_import_autorizar",
 entityType:"contrato_import_job",
 entityId: jobDetail.job.id,
 payload: {
 contratos_gerados: inserts.length,
 processo_id: processoIdFinal,
 objeto: objetoBatch,
 },
 });

 toast.success(
 `${inserts.length} contratos gerados${processoIdFinal && !processoId ?" e processo criado" :""}`,
 );
 finishTask(`${inserts.length} contrato(s) gerado(s) com sucesso.`);
 qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
 qc.invalidateQueries({ queryKey: ["cij-list"] });
 qc.invalidateQueries({ queryKey: ["contratos"] });
 qc.invalidateQueries({ queryKey: ["processos"] });
 qc.invalidateQueries({ queryKey: ["processos-min"] });
 qc.invalidateQueries({ queryKey: ["numeracao"] });
 console.log("Lote processado com sucesso.");
 if (processoIdFinal) {
 navigate({ to:"/processos/$id", params: { id: processoIdFinal } });
 }
 } catch (e: any) {
 console.error("ERRO NO PROCESSO DE GERAÇÃO:", e);
 failTask(e?.message ??"Falha ao gerar contratos.");
 toast.error("Falha ao gerar contratos (alterações revertidas)", {
 description: e?.message,
 });
 } finally {
 console.timeEnd("ProcessoGeracaoLote");
 console.groupEnd();
 setBusy(false);
 }
 }

 const totalValor = contratosPreliminares.reduce(
 (s, c) => s + c.totalValor,
 0,
 );
 const totalItens = contratosPreliminares.reduce(
 (s, c) => s + c.totalItens,
 0,
 );
 const itensSemValor = (jobDetail?.itens ?? []).filter(
 (i: any) => !i.excluido && (!i.valor_unitario || i.valor_unitario <= 0),
 ).length;
 const isAutorizado = jobDetail?.job?.status ==="autorizado";

 return (
 <AppShell
 title="Importar contratos"
 subtitle="Upload da planilha, revisão e geração em lote"
 >
 <WorkflowGuide
 title="Fluxo da importação"
 steps={[
 {
 label:"Importar",
 description:"Planilha e processo no portal",
 to:"/importar-contratos",
 icon: Upload,
 state:"active",
 },
 {
 label:"Processos",
 description:"Snapshot de atas",
 to:"/processos",
 icon: FileText,
 },
 {
 label:"Contratos",
 description:"Gerar lote",
 to:"/contratos",
 icon: FileSignature,
 },
 {
 label:"Enviar",
 description:"Portal e documentos",
 to:"/contratos",
 icon: Send,
 },
 ]}
 />

 <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
 {/* Sidebar: upload + histórico */}
 <div className="flex flex-col gap-4">
 <Card className="border-border/60">
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2">
 <Upload className="size-4" /> Nova importação
 </CardTitle>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <div className="flex flex-col gap-1.5">
 <Label>Planilha (.xlsx)</Label>
 <Input
 type="file"
 accept=".xlsx"
 onChange={(e) => setFile(e.target.files?.[0] ?? null)}
 />
 {file && (
 <div className="mt-1.5 truncate text-[13px] text-muted-foreground">
 {file.name}
 </div>
 )}
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Link do processo no portal *</Label>
 <Input
 value={m2aProcessoUrl}
 onChange={(event) => setM2aProcessoUrl(event.target.value)}
 placeholder="http://precodereferencia.m2atecnologia.com.br/processo_administrativo/34291/"
 />
 <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
 Ao importar, o sistema varre todas as atas, itens e contratos
 existentes desse processo para separar os contratos pela ata
 correta.
 </p>
 </div>
 <Button
 className="w-full"
 disabled={
 !file || busy || !extractM2AProcessoId(m2aProcessoUrl)
 }
 onClick={handleImportar}
 size="sm"
 >
 {busy ? (
 <Loader2 className="size-4 animate-spin" />
 ) : (
 <FileSpreadsheet className="size-4" />
 )}{""}
 Analisar e importar
 </Button>
 <p className="text-[13px] leading-relaxed text-muted-foreground">
 A planilha vai para uma área de revisão. Nada é enviado ao
 sistema de contratos até você clicar em{""}
 <strong>Autorizar geração</strong>.
 </p>
 </CardContent>
 </Card>

 <Card className="overflow-hidden border-border/60">
 <CardHeader className="pb-3">
 <CardTitle>Importações recentes</CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <div>
 {(jobs ?? []).map((j) => (
 <div
 key={j.id}
 className={`group relative w-full border-b border-border/60 transition-colors hover:bg-muted/40 ${activeJobId === j.id ?"bg-muted/40 dark:bg-slate-800/50" :""}`}
 >
 <button
 type="button"
 onClick={() => setActiveJobId(j.id)}
 className="w-full text-left px-4 py-2.5 pr-10"
 >
 <div className="flex items-center justify-between gap-2">
 <div className="truncate text-[13px] font-medium">
 {j.empresa ??"-"}
 </div>
 <Badge
 variant={
 j.status ==="autorizado" ?"default" :"secondary"
 }
 className="text-[10px]"
 >
 {j.status}
 </Badge>
 </div>
 <div className="truncate text-[13px] text-muted-foreground">
 {j.original_filename}
 </div>
 <div className="mt-0.5 flex gap-3 text-[12px] text-muted-foreground">
 <span>{j.total_itens} itens</span>
 <span>{j.total_contratos_previstos} contratos</span>
 <span>{formatBRL(j.total_valor)}</span>
 </div>
 </button>
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 type="button"
 size="icon"
 variant="ghost"
 className="absolute top-1.5 right-1.5 size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
 onClick={(e) => e.stopPropagation()}
 title="Excluir importação"
 >
 <Trash2 className="size-3.5" />
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent
 onClick={(e: React.MouseEvent) => e.stopPropagation()}
 >
 <AlertDialogHeader>
 <AlertDialogTitle>
 Excluir importação?
 </AlertDialogTitle>
 <AlertDialogDescription>"{j.original_filename}" será removida com seus itens
 e dotações em revisão. Contratos já gerados não são
 afetados.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={() => excluirJob(j.id)}>
 Excluir
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 ))}

 {(jobs ?? []).length === 0 && (
 <EmptyState
 icon={FileSpreadsheet}
 title="Nenhuma importação ainda"
 description="Envie uma planilha para criar a primeira revisão."
 />
 )}
 </div>
 </CardContent>
 </Card>
 </div>

 {/* Principal: revisão */}
 <div className="min-w-0">
 {!activeJobId && (
 <Card className="border-dashed border-border/60">
 <EmptyState
 icon={Upload}
 title="Selecione uma importação"
 description="Escolha um registro recente ou envie uma nova planilha."
 />
 </Card>
 )}

 {activeJobId && detailFetching && !jobDetail && (
 <Card className="border-border/60">
 <CardContent className="py-12 text-center text-[13px] text-muted-foreground">
 <Loader2 className="mr-2 inline size-5 animate-spin" />
 Carregando...
 </CardContent>
 </Card>
 )}

 {jobDetail && (
 <div className="flex flex-col gap-4">
 {/* Painel de resumo */}
 <Card className="border-border/60">
 <CardContent className="grid gap-3 p-4 md:grid-cols-4">
 <Metric
 label="Empresa"
 value={jobDetail.job.empresa ??"—"}
 />
 <Metric
 label="Itens válidos"
 value={formatNumber(
 (jobDetail.itens ?? []).filter((i: any) => !i.excluido)
 .length,
 )}
 />
 <Metric
 label="Contratos a gerar"
 value={formatNumber(contratosPreliminares.length)}
 highlight
 />
 <Metric
 label="Valor total"
 value={formatBRL(totalValor)}
 highlight
 />
 </CardContent>
 </Card>

 {itensSemValor > 0 && (
 <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
 <AlertTriangle className="size-4 text-amber-600 mt-0.5" />
 <div>
 <strong>{itensSemValor}</strong> item(ns) sem valor
 unitário. Edite-os na aba"Itens" antes de autorizar — caso
 contrário ficarão com valor zero.
 </div>
 </div>
 )}

 <Tabs defaultValue="contratos">
 <TabsList>
 <TabsTrigger value="contratos">
 Contratos previstos ({contratosPreliminares.length})
 </TabsTrigger>
 <TabsTrigger value="itens">
 Itens da planilha ({jobDetail.itens.length})
 </TabsTrigger>
 <TabsTrigger value="autorizar">Autorizar geração</TabsTrigger>
 </TabsList>

 {/* Tab 1: contratos agrupados (cards colapsáveis) */}
 <TabsContent value="contratos" className="mt-3">
 <div className="flex flex-col gap-3">
 {contratosPreliminares.map((c) => {
 const sec = resolveSecretariaForContrato(
 c,
 secretariasM2A,
 );
 const nomeSec = sec?.nome ?? c.secretariaSigla;
 const prepostoPreview =
 prepostosByFornecedor[
 resolveFornecedorKey(c)
 ]?.trim() ??"";
 return (
 <Collapsible key={c.key} defaultOpen={false}>
 <Card className="overflow-hidden border-border/60">
 <CollapsibleTrigger asChild>
 <button
 type="button"
 className="w-full text-left transition-colors hover:bg-muted/50"
 >
 <CardHeader className="pb-3 pt-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className="flex items-center gap-2 min-w-0">
 <ChevronDown className="size-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90 group-data-[state=closed]:-rotate-90" />
 <Building2 className="size-4 text-muted-foreground shrink-0" />
 <span className="font-semibold text-sm truncate">
 {nomeSec}
 </span>
 <span className="text-xs text-muted-foreground truncate">
 · {c.empresa}
 </span>
 <Badge
 variant={
 c.m2aAtaId
 ?"secondary"
 :"destructive"
 }
 className="text-[10px]"
 >
 {c.m2aAtaNumero ??"Sem ata"}
 </Badge>
 </div>
 <div className="text-xs text-muted-foreground shrink-0">
 {c.totalItens} item(ns) ·{""}
 <strong className="text-foreground">
 {formatBRL(c.totalValor)}
 </strong>
 </div>
 </div>
 </CardHeader>
 </button>
 </CollapsibleTrigger>
 <CollapsibleContent>
 <div className="grid gap-2 border-t border-border/60 bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground dark:bg-muted/30 md:grid-cols-4">
 <div>
 <span className="font-medium text-foreground">
 Ata:
 </span>{""}
 {c.m2aAtaNumero ??"não definida"}
 {c.m2aAtaId ? ` · ID ${c.m2aAtaId}` :""}
 </div>
 <div>
 <span className="font-medium text-foreground">
 UG:
 </span>{""}
 {sec?.m2a_orgao_id ??"não cadastrada"}
 </div>
 <div>
 <span className="font-medium text-foreground">
 Órgão Dot.:
 </span>{""}
 {sec?.m2a_dot_orgao_id ??"não cadastrado"}
 </div>
 <div>
 <span className="font-medium text-foreground">
 Fiscal:
 </span>{""}
 {sec?.m2a_fiscal_nome ??"não cadastrado"}
 {sec?.m2a_fiscal_codigo
 ? ` - ID ${sec.m2a_fiscal_codigo}`
 :""}
 </div>
 <div>
 <span className="font-medium text-foreground">
 Fornecedor:
 </span>{""}
 {c.fornecedorNome ?? c.empresa ??"—"}
 </div>
 <div>
 <span className="font-medium text-foreground">
 Gestor:
 </span>{""}
 {sec?.m2a_gestor_nome ??"não cadastrado"}
 {sec?.m2a_gestor_codigo
 ? ` - ID ${sec.m2a_gestor_codigo}`
 :""}
 </div>
 <div>
 <span className="font-medium text-foreground">
 Preposto:
 </span>{""}
 {prepostoPreview ||"não informado"}
 </div>
 </div>
 <CardContent className="border-t border-border/60 p-0 ">
 <Table className="[&_th]:h-9 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2 text-[13px]">
 <TableHeader>
 <TableRow>
 <TableHead className="w-16">
 Nº item
 </TableHead>
 <TableHead className="w-16">
 Lote
 </TableHead>
 <TableHead>Descrição</TableHead>
 <TableHead>Especificação</TableHead>
 <TableHead className="w-24">
 Unidade
 </TableHead>
 <TableHead className="w-16 text-right">
 Qtd
 </TableHead>
 <TableHead className="w-28 text-right">
 V. unit
 </TableHead>
 <TableHead className="w-32 text-right">
 V. total
 </TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {c.itens.map((it, i) => (
 <TableRow key={i}>
 <TableCell className="tabular-nums">
 {it.ordemItem ?? i + 1}
 </TableCell>
 <TableCell>{it.lote ||"—"}</TableCell>
 <TableCell>
 <div className="line-clamp-2">
 {it.descricao}
 </div>
 </TableCell>
 <TableCell>
 <div className="line-clamp-2 text-muted-foreground">
 {it.especificacao ||"—"}
 </div>
 </TableCell>
 <TableCell>{it.unidade}</TableCell>
 <TableCell className="text-right tabular-nums">
 {formatNumber(it.quantidade)}
 </TableCell>
 <TableCell className="text-right tabular-nums">
 {formatBRL(it.valorUnitario)}
 </TableCell>
 <TableCell className="text-right tabular-nums font-medium">
 {formatBRL(it.subtotal)}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </CardContent>
 </CollapsibleContent>
 </Card>
 </Collapsible>
 );
 })}
 {contratosPreliminares.length === 0 && (
 <Card className="border-border/60">
 <EmptyState
 icon={FileSignature}
 title="Nenhum contrato previsto"
 description="Todos os itens estão excluídos ou sem dotação ativa."
 />
 </Card>
 )}
 </div>
 </TabsContent>

 {/* Tab 2: itens editáveis */}
 <TabsContent value="itens" className="mt-3">
 <Card className="overflow-hidden border-border/60">
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-14">Nº item</TableHead>
 <TableHead className="w-16">Lote</TableHead>
 <TableHead className="w-64">Ata</TableHead>
 <TableHead>Descrição</TableHead>
 <TableHead>Especificação</TableHead>
 <TableHead className="w-20">Unidade</TableHead>
 <TableHead className="w-44 text-right">
 Valor unit. (R$)
 </TableHead>
 <TableHead className="w-16 text-right">
 Ações
 </TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {jobDetail.itens.map((i: any) => (
 <TableRow
 key={i.id}
 className={i.excluido ?"opacity-40" :""}
 >
 <TableCell className="text-xs font-mono">
 {i.ordem_item ||"—"}
 </TableCell>
 <TableCell className="text-[13px]">
 {i.lote ||"—"}
 </TableCell>
 <TableCell>
 <select
 className="h-9 w-full rounded-md border border-input bg-card px-2 text-[13px] transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
 value={i.m2a_ata_id ??"__none__"}
 disabled={isAutorizado}
 onChange={(event) =>
 atualizarAtaItem(i, event.target.value)
 }
 >
 <option value="__none__">Sem ata</option>
 {m2aAtas.map((ata: any) => (
 <option
 key={ata.m2a_ata_id}
 value={ata.m2a_ata_id}
 >
 {ata.numero_ata} ·{""}
 {ata.fornecedor_nome ??"Fornecedor"}
 </option>
 ))}
 </select>
 <div className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
 <span>{i.m2a_match_status ??"pendente"}</span>
 {i.m2a_item_id && (
 <span className="font-mono">
 item {i.m2a_item_id}
 </span>
 )}
 </div>
 </TableCell>
 <TableCell className="text-[13px]">
 <div className="line-clamp-2">{i.descricao}</div>
 </TableCell>
 <TableCell className="text-[13px]">
 <div className="line-clamp-2 text-muted-foreground">
 {i.especificacao ||"—"}
 </div>
 </TableCell>
 <TableCell className="text-[13px]">
 {i.unidade}
 </TableCell>
 <TableCell className="text-right">
 <ValorUnitInput
 disabled={isAutorizado}
 initial={Number(i.valor_unitario ?? 0)}
 onSave={async (v) => {
 await atualizarItem(i.id, {
 valor_unitario: v,
 });
 }}
 />
 </TableCell>
 <TableCell className="text-right">
 <Button
 variant="ghost"
 size="icon"
 className="size-7"
 disabled={isAutorizado}
 onClick={() =>
 atualizarItem(i.id, { excluido: !i.excluido })
 }
 >
 <Trash2 className="size-3.5" />
 </Button>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </Card>

 <Card className="mt-4 border-border/60">
 <CardHeader className="pb-2">
 <CardTitle>
 Dotações ({jobDetail.dotacoes.length})
 </CardTitle>
 </CardHeader>
 <CardContent className="p-0">
 <div>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Secretaria</TableHead>
 <TableHead>Dotação</TableHead>
 <TableHead>Item</TableHead>
 <TableHead className="text-right">Qtd</TableHead>
 <TableHead className="text-right w-24">
 Status
 </TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {jobDetail.dotacoes.map((d: any) => {
 const item = jobDetail.itens.find(
 (i: any) => i.id === d.item_id,
 );
 return (
 <TableRow
 key={d.id}
 className={d.ignorado ?"opacity-40" :""}
 >
 <TableCell className="text-xs">
 <Badge
 variant="outline"
 className="font-mono text-[10px]"
 >
 {d.secretaria_sigla}
 </Badge>
 </TableCell>
 <TableCell className="text-xs">
 {d.dotacao}
 </TableCell>
 <TableCell className="text-xs truncate max-w-xs">
 {item?.descricao ??"—"}
 </TableCell>
 <TableCell className="text-right text-xs font-mono">
 {formatNumber(d.quantidade)}
 </TableCell>
 <TableCell className="text-right">
 <Button
 size="sm"
 variant={d.ignorado ?"outline" :"ghost"}
 className="h-6 text-[10px]"
 disabled={isAutorizado}
 onClick={() =>
 alternarDotacao(d.id, !d.ignorado)
 }
 >
 {d.ignorado ?"Reativar" :"Ignorar"}
 </Button>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Tab 3: autorizar */}
 <TabsContent value="autorizar" className="mt-3">
 <Card className="border-border/60">
 <CardHeader className="pb-3">
 <CardTitle className="flex items-center gap-2">
 {isAutorizado ? (
 <>
 <CheckCircle2 className="size-4 text-emerald-500" />{""}
 Importação já autorizada
 </>
 ) : (
 <>
 <ShieldCheck className="size-4" /> Autorizar geração
 no sistema
 </>
 )}
 </CardTitle>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 {isAutorizado ? (
 <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-900 dark:text-emerald-200">
 <strong>{contratosPreliminares.length}</strong>{""}
 contratos já foram gerados a partir desta importação.
 Veja-os em <strong>/contratos</strong>.
 </div>
 ) : (
 <>
 {/* 1) Vínculo de processo — vem ANTES dos dados do lote */}
 <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3 ">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Processo
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Vincular a processo existente</Label>
 <select
 className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 "
 value={processoId}
 onChange={(e) => setProcessoId(e.target.value)}
 >
 <option value="">
 — Nenhum (criar novo abaixo) —
 </option>
 {(processos ?? []).map((p: any) => (
 <option key={p.id} value={p.id}>
 {p.numero_processo ??"(sem nº)"} ·{""}
 {p.objeto?.slice(0, 60)}
 {p.m2a_processo_id
 ? ` · Código externo #${p.m2a_processo_id}`
 :""}
 </option>
 ))}
 </select>
 {processoId && (
 <p className="text-[13px] text-emerald-600 dark:text-emerald-400">
 Nº do processo e Objeto serão reaproveitados
 do processo selecionado.
 </p>
 )}
 </div>

 <div className="flex items-center gap-2 pt-1 text-[13px]">
 <Checkbox
 id="criarProc"
 checked={criarProcesso && !processoId}
 disabled={!!processoId}
 onCheckedChange={(checked) =>
 setCriarProcesso(checked === true)
 }
 />
 <label
 htmlFor="criarProc"
 className={`cursor-pointer ${processoId ?"text-muted-foreground" :""}`}
 >
 Ou criar um novo processo automaticamente para
 este lote
 </label>
 </div>
 </div>

 {/* 2) Dados do lote */}
 <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Dados do lote (aplicados a todos os contratos)
 </div>
 <div className="grid gap-3 md:grid-cols-2">
 <div className="flex flex-col gap-1.5">
 <Label>Nº base do processo *</Label>
 <Input
 placeholder="026/2025"
 value={numeroProcessoBase}
 onChange={(e) =>
 setNumeroProcessoBase(e.target.value)
 }
 disabled={!!processoId}
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Data dos contratos *</Label>
 <div className="py-2 text-[13px] italic text-muted-foreground">
 Será preenchida no envio pela extensão
 </div>
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Objeto *</Label>
 <Input
 placeholder="Ex.: Aquisição de material de expediente para as Secretarias..."
 value={objetoBatch}
 onChange={(e) => setObjetoBatch(e.target.value)}
 disabled={!!processoId}
 />
 <p className="text-[13px] text-muted-foreground">
 {processoId
 ?"Reaproveitado do processo vinculado."
 :"Mesmo objeto será gravado em todos os contratos gerados e no processo."}
 </p>
 </div>
 <p className="text-[13px] text-muted-foreground">
 Unidade Gestora, dotação, Fiscal e Gestor são
 definidos automaticamente a partir do cadastro da
 secretaria/dotação detectada na planilha.
 </p>

 <div className="rounded-xl border border-border/60 bg-card p-3 dark:bg-foreground">
 <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Preposto por fornecedor
 </div>
 {fornecedoresPrepostoTargets.length === 0 ? (
 <p className="text-[13px] text-muted-foreground">
 Nenhum fornecedor identificado para os
 contratos deste lote.
 </p>
 ) : (
 <div className="flex max-h-56 flex-col gap-2 overflow-auto pr-1">
 {fornecedoresPrepostoTargets.map((target) => {
 const hasSaved = !!fornecedorMapFromDb.get(
 target.key,
 );
 const prepostoValue =
 prepostosByFornecedor[target.key] ??"";
 return (
 <div
 key={target.key}
 className="grid gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-2 md:grid-cols-[1fr_260px]"
 >
 <div className="min-w-0">
 <div
 className="truncate text-xs font-medium text-foreground"
 title={target.fornecedorNome}
 >
 {target.fornecedorNome}
 </div>
 <div className="mt-0.5 text-[12px] text-muted-foreground">
 {target.contratos} contrato(s)
 {hasSaved
 ?" · cadastro existente"
 :""}
 </div>
 </div>
 <Input
 value={prepostoValue}
 onChange={(event) =>
 setPrepostosByFornecedor(
 (current) => ({
 ...current,
 [target.key]:
 event.target.value,
 }),
 )
 }
 placeholder="Nome do preposto"
 className="h-9 text-[13px]"
 />
 </div>
 );
 })}
 </div>
 )}
 </div>

 <Separator className="my-2" />

 <div className="rounded-xl border border-border/60 bg-card p-3 text-[13px] text-muted-foreground ">
 <div className="font-medium text-slate-800 ">
 Pré-checagem
 </div>
 <div className="mt-1">
 {contratosPreliminares.length -
 contratosSemCadastroM2A.length}{""}
 de {contratosPreliminares.length} contrato(s)
 com cadastro completo.
 </div>
 <div className="mt-1">
 {fornecedoresPrepostoTargets.length -
 fornecedoresSemPreposto.length}{""}
 de {fornecedoresPrepostoTargets.length}{""}
 fornecedor(es) com preposto definido.
 </div>
 {contratosSemCadastroM2A.length > 0 && (
 <div className="mt-2 text-destructive">
 {contratosSemCadastroM2A.length} contrato(s)
 precisam de ajuste em /secretarias antes da
 geração.
 </div>
 )}
 {fornecedoresSemPreposto.length > 0 && (
 <div className="mt-2 text-destructive">
 {fornecedoresSemPreposto.length}{""}
 fornecedor(es) ainda estão sem preposto
 informado.
 </div>
 )}
 {contratosSemAtaM2A.length > 0 && (
 <div className="mt-2 text-destructive">
 {contratosSemAtaM2A.length} contrato(s) ainda
 estão sem ata definida.
 </div>
 )}
 </div>
 </div>

 <Separator />

 <div className="flex flex-col gap-1 rounded-xl bg-muted/40 p-3 text-[13px] text-muted-foreground dark:bg-muted/30 ">
 <div>
 Serão criados{""}
 <strong>{contratosPreliminares.length}</strong>{""}
 contratos, somando <strong>{totalItens}</strong>{""}
 itens e <strong>{formatBRL(totalValor)}</strong>.
 </div>
 <div>
 Cada contrato consome 1 número da numeração
 automática da secretaria correspondente.
 </div>
 {processoId ? (
 <div>
 Contratos serão vinculados ao processo
 selecionado (sem criar processo novo).
 </div>
 ) : (
 criarProcesso && (
 <div>
 Um novo processo será criado e vinculado a
 todos os contratos deste lote.
 </div>
 )
 )}
 </div>

 <Button
 size="lg"
 className="w-full"
 disabled={
 busy ||
 contratosPreliminares.length === 0 ||
 contratosSemCadastroM2A.length > 0 ||
 fornecedoresSemPreposto.length > 0 ||
 contratosSemAtaM2A.length > 0
 }
 onClick={autorizarGeracao}
 >
 {busy ? (
 <Loader2 className="size-4 animate-spin" />
 ) : (
 <ShieldCheck className="size-4" />
 )}
 Autorizar e gerar {contratosPreliminares.length}{""}
 contratos
 </Button>
 </>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 )}
 </div>
 </div>
 </AppShell>
 );
}
