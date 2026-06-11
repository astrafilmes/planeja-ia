import { createFileRoute, Link, useNavigate } from"@tanstack/react-router";
import { routeHead } from"@/lib/route-head";
import { useQuery, useQueryClient, useMutation } from"@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from"react";
import { AppShell } from"@/components/layout/AppShell";
import { PageHeader } from"@/components/layout/PageHeader";
import { WorkflowGuide } from"@/components/layout/WorkflowGuide";
import { EmptyState } from"@/components/layout/EmptyState";
import { FormSection } from"@/components/layout/FormSection";
import { StickyActionBar, SectionNav } from"@/components/layout/StickyActionBar";
import { useProgress } from"@/contexts/ProgressContext";
import { supabase } from"@/integrations/supabase/client";
import { Button } from"@/components/ui/button";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import { Textarea } from"@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from"@/components/ui/card";
import { Badge } from"@/components/ui/badge";
import { Checkbox } from"@/components/ui/checkbox";
import { Skeleton } from"@/components/ui/skeleton";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from"@/components/ui/select";
import {
 Table,
 TableBody,
 TableCell,
 TableFooter,
 TableHead,
 TableHeader,
 TableRow,
} from"@/components/ui/table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from"@/components/ui/tabs";
import {
 ArrowLeft,
 ChevronRight,
 Download,
 ExternalLink,
 Save,
 Search,
 Trash2,
 Send,
 CheckCircle2,
 XCircle,
 Loader2,
 Clock,
 AlertTriangle,
 FileSignature,
 FileText,
 FileUp,
 RefreshCw,
 Settings2,
 Info,
 Send as SendIcon,
} from"lucide-react";
import { toast } from"sonner";
import { logAudit } from"@/lib/audit";
import { useM2ASync } from"@/hooks/useM2ASync";
import {
 diagnoseM2A,
 ETAPAS_ORDEM,
 extractM2AProcessoId,
 listenAllM2AProgress,
 listenM2ABulkDownload,
 requestM2ABulkDownload,
 sendToM2A,
 type M2ADocumentoGerado,
} from"@/lib/m2a";
import { useM2AConnection } from"@/contexts/M2AConnectionProvider";
import { useM2APreferences } from"@/hooks/useM2APreferences";
import {
 buildM2AContractPayload,
 formatM2AQuantity,
 isNumericM2AId,
} from"@/lib/m2a-payload";
import {
 Dialog,
 DialogContent,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from"@/components/ui/dialog";
import {
 filterServidoresByUnidade,
 useServidores,
} from"@/hooks/useM2ACatalog";
import { PautaConsolidadaExporter } from"@/components/contratos/PautaConsolidadaExporter";

export const Route = createFileRoute("/processos/$id")({
 component: Page,
 head: ({ params }) =>
 routeHead({
 path: `/processos/${params?.id ??""}`,
 title: `Processo ${params?.id ??""}`.trim(),
 description:"Detalhes do processo administrativo: itens, atas, fornecedores e situação atual no Planeja IA.",
 ogType:"article",
 noindex: true,
 }),
});

function anoFromNumero(numero?: string | null): number | null {
 if (!numero) return null;
 const m = String(numero).match(/(\d{4})\s*$/);
 if (!m) return null;
 const y = Number(m[1]);
 return y >= 2000 && y <= 2100 ? y : null;
}

type Processo = {
 id: string;
 numero_processo: string | null;
 ano: number | null;
 modalidade: string | null;
 objeto: string;
 status: string;
 data_abertura: string | null;
 observacoes: string | null;
 m2a_url: string | null;
 m2a_processo_id: string | null;
 secretaria_id: string | null;
 m2a_sync_at: string | null;
 created_at: string;
 updated_at: string;
 deleted_at: string | null;
};

type ContratoRow = {
 id: string;
 numero_contrato: string;
 dotacao: string | null;
 secretaria_id: string | null;
 secretaria_sigla: string;
 secretaria_nome: string | null;
 m2a_orgao_id: string | null;
 m2a_ata_id: string | null;
 m2a_ata_numero: string | null;
 m2a_dot_orgao_id: string | null;
 m2a_uo_id: string | null;
 m2a_dot_id: string | null;
 m2a_fiscal_codigo: string | null;
 m2a_fiscal_nome: string | null;
 m2a_gestor_codigo: string | null;
 m2a_gestor_nome: string | null;
 fornecedor_nome: string | null;
 preposto: string;
 objeto: string;
 status: string;
 data: string | null;
 data_texto_legado?: string | null;
 status_envio_m2a: string;
 ultimo_erro_m2a: string | null;
 m2a_contrato_id: string | null;
 m2a_documentos_gerados: unknown;
 enviado_m2a_em: string | null;
 valor_total: number;
 itens: ContratoItemM2A[];
};

type ContratoItemM2A = {
 numero: string;
 quantidade: string;
 quantidade_numero: number;
 descricao?: string;
 m2a_item_id?: string | null;
 unidade?: string | null;
 valor_unitario?: number;
 valor_total?: number;
};
const DOCUMENTOS_DOWNLOAD_POSICOES = new Set([4, 5]);

type ProcessoAtaItem = {
 id: string;
 codigo: string;
 descricao: string;
 unidade: string | null;
 valor_unitario: number;
 m2a_item_id: string;
 m2a_ata_id: string;
};

type ItemConsolidado = {
 codigo: string;
 descricao: string;
 unidade: string | null;
 quantidadeTotal: number | null;
 quantidadeConsumida: number;
 saldo: number | null;
 valorDisponivel: number | null;
  valorUnitario: number;
  valorUnitarioContratado: number;
  valorConsumido: number;
};

const BRL = new Intl.NumberFormat("pt-BR", {
 style:"currency",
 currency:"BRL",
});

function formatDateBR(value?: string | null) {
 if (!value) return"Sem data";
 const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
 if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return date.toLocaleDateString("pt-BR");
}

function sleep(ms: number) {
 return new Promise((r) => setTimeout(r, ms));
}

function M2AStatusBadge({ status }: { status: string }) {
 const map: Record<
 string,
 { label: string; cls: string; Icon: typeof CheckCircle2 }
 > = {
 enviado: {
 label:"Enviado",
 cls:"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
 Icon: CheckCircle2,
 },
 sucesso: {
 label:"Enviado",
 cls:"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
 Icon: CheckCircle2,
 },
 erro: {
 label:"Erro",
 cls:"border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
 Icon: XCircle,
 },
 processando: {
 label:"Processando",
 cls:"border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
 Icon: Loader2,
 },
 pendente: {
 label:"Pendente",
 cls:"border-border/60 bg-muted/40 text-muted-foreground dark:text-muted-foreground",
 Icon: Clock,
 },
 };
 const m = map[status] ?? map.pendente;
 return (
 <Badge variant="outline" className={`gap-1 ${m.cls}`}>
 <m.Icon
 className={`size-3 ${status ==="processando" ?"animate-spin" :""}`}
 />
 {m.label}
 </Badge>
 );
}

function getContratoDocumentos(contrato: ContratoRow): M2ADocumentoGerado[] {
 if (!Array.isArray(contrato.m2a_documentos_gerados)) return [];
 return (contrato.m2a_documentos_gerados as any[])
 .map((item, index) => {
 if (!DOCUMENTOS_DOWNLOAD_POSICOES.has(index + 1)) return null;
 if (!item || typeof item !=="object") return null;
 const doc = item as { id_m2a?: unknown; id?: unknown; nome?: unknown };
 const id_m2a = String(doc.id_m2a ?? doc.id ??"").trim();
 if (!/^\d+$/.test(id_m2a)) return null;
 return {
 id_m2a,
 nome: `${contrato.numero_contrato} - ${String(doc.nome ?? `Documento ${id_m2a}`).trim()}`,
 contratoId: contrato.id,
 contratoNumero: contrato.numero_contrato,
 };
 })
 .filter(Boolean) as M2ADocumentoGerado[];
}

function formatQuantidade(value: number | null | undefined) {
 if (value === null || value === undefined || !Number.isFinite(value)) {
 return"—";
 }
 return value.toLocaleString("pt-BR", {
 minimumFractionDigits: 0,
 maximumFractionDigits: 4,
 });
}

function getStrictItemNumber(value: unknown) {
 const raw = String(value ?? "").trim();
 if (!raw) return Number.MAX_SAFE_INTEGER;
 const parsed = Number(raw.replace(",", "."));
 if (Number.isFinite(parsed)) return parsed;
 const firstNumber = raw.match(/\d+/)?.[0];
 return firstNumber ? Number(firstNumber) : Number.MAX_SAFE_INTEGER;
}

function compareStrictItemOrder<T>(
 a: T,
 b: T,
 getValue: (item: T) => unknown,
) {
 const valueA = getValue(a);
 const valueB = getValue(b);
 const numA = getStrictItemNumber(valueA);
 const numB = getStrictItemNumber(valueB);
 if (numA !== numB) return numA - numB;
 return String(valueA ?? "").localeCompare(String(valueB ?? ""), "pt-BR", {
  numeric: true,
  sensitivity: "base",
 });
}

function Page() {
 const { id } = Route.useParams();
 const qc = useQueryClient();
 const navigate = useNavigate();
 const { connected, ensureConnected } = useM2AConnection();
 const { startTask, updateProgress, finishTask, failTask } = useProgress();
 const m2aBatchRef = useRef({ total: 0, finished: 0 });

 const { data, isLoading, error } = useQuery({
 queryKey: ["processo-detail", id],
 queryFn: async () => {
 const [proc, contratos, ataItens] = await Promise.all([
 supabase
 .from("processos")
 .select("*")
 .eq("id", id)
 .is("deleted_at", null)
 .maybeSingle(),
 supabase
 .from("contratos")
 .select("id, numero_contrato, dotacao, secretaria_sigla, secretaria_id, preposto, objeto, status, data, data_texto_legado, status_envio_m2a, ultimo_erro_m2a, m2a_contrato_id, m2a_documentos_gerados, m2a_ata_id, m2a_ata_numero, fornecedor_nome, enviado_m2a_em, secretarias:secretaria_id(sigla, nome, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome)",
 )
 .eq("processo_id", id)
 .is("deleted_at", null)
 .order("numero_contrato"),
 supabase
 .from("m2a_itens")
 .select("id, numero_item, descricao, unidade, valor_unitario, m2a_item_id, m2a_ata_id",
 )
 .eq("processo_id", id)
 .order("numero_item"),
 ]);
 if (proc.error) throw proc.error;
 if (contratos.error) throw contratos.error;
 if (ataItens.error) throw ataItens.error;
 const contratoRows = contratos.data ?? [];
 const contratoIds = contratoRows.map((c: any) => c.id);
 const valorByContrato: Record<string, number> = {};
 const itensByContrato: Record<string, ContratoItemM2A[]> = {};
 if (contratoIds.length > 0) {
 const { data: itens, error: itensError } = await supabase
 .from("contrato_itens")
 .select("contrato_id, numero_item, ordem_item, descricao, m2a_item_id, quantidade, unidade, valor_unitario, valor_total",
 )
 .in("contrato_id", contratoIds);
 if (itensError) throw itensError;
 const m2aItemIds = [
 ...new Set(
 (itens ?? [])
 .map((it) => String(it.m2a_item_id ??"").trim())
 .filter(Boolean),
 ),
 ];
 const m2aNumeroByItemId = new Map<string, string>();
 if (m2aItemIds.length > 0) {
 const { data: m2aItens, error: m2aItensError } = await supabase
 .from("m2a_itens")
 .select("m2a_item_id, numero_item")
 .eq("processo_id", id)
 .in("m2a_item_id", m2aItemIds);
 if (m2aItensError) throw m2aItensError;
 for (const item of m2aItens ?? []) {
 m2aNumeroByItemId.set(
 item.m2a_item_id,
 String(item.numero_item ??"").trim(),
 );
 }
 }
 for (const it of itens ?? []) {
 valorByContrato[it.contrato_id] =
 (valorByContrato[it.contrato_id] ?? 0) +
 Number(it.valor_total ?? 0);
 const numero =
 String(it.numero_item ??"").trim() ||
 m2aNumeroByItemId.get(String(it.m2a_item_id ??"").trim()) ||"";
 const descricao = String(it.descricao ??"").trim();
 if (!numero && !descricao) continue;
 if (!itensByContrato[it.contrato_id]) {
 itensByContrato[it.contrato_id] = [];
 }
 itensByContrato[it.contrato_id].push({
 numero,
 quantidade: formatM2AQuantity(it.quantidade),
 quantidade_numero: Number(it.quantidade ?? 0),
 descricao,
 m2a_item_id: it.m2a_item_id ?? null,
 unidade: it.unidade ?? null,
 valor_unitario: Number(it.valor_unitario ?? 0),
 valor_total: Number(it.valor_total ?? 0),
 });
 }
 }
  for (const lista of Object.values(itensByContrato)) {
  lista.sort((a, b) => compareStrictItemOrder(a, b, (item) => item.numero));
  }
 const contratosFull: ContratoRow[] = contratoRows.map((c: any) => ({
 id: c.id,
 numero_contrato: c.numero_contrato,
 dotacao: c.dotacao ?? null,
 secretaria_id: c.secretaria_id ?? null,
 secretaria_sigla: c.secretarias?.sigla ?? c.secretaria_sigla ??"",
 secretaria_nome: c.secretarias?.nome ?? null,
 m2a_orgao_id: c.secretarias?.m2a_orgao_id ?? null,
 m2a_ata_id: c.m2a_ata_id ?? null,
 m2a_ata_numero: c.m2a_ata_numero ?? null,
 m2a_dot_orgao_id: c.secretarias?.m2a_dot_orgao_id ?? null,
 m2a_uo_id: c.secretarias?.m2a_uo_id ?? null,
 m2a_dot_id: c.secretarias?.m2a_dot_id ?? null,
 m2a_fiscal_codigo: c.secretarias?.m2a_fiscal_codigo ?? null,
 m2a_fiscal_nome: c.secretarias?.m2a_fiscal_nome ?? null,
 m2a_gestor_codigo: c.secretarias?.m2a_gestor_codigo ?? null,
 m2a_gestor_nome: c.secretarias?.m2a_gestor_nome ?? null,
 fornecedor_nome: c.fornecedor_nome ?? null,
 preposto: c.preposto,
 objeto: c.objeto,
 status: c.status,
 data: c.data,
 data_texto_legado: c.data_texto_legado ?? null,
 status_envio_m2a: c.status_envio_m2a,
 ultimo_erro_m2a: c.ultimo_erro_m2a,
 m2a_contrato_id: c.m2a_contrato_id,
 m2a_documentos_gerados: c.m2a_documentos_gerados,
 enviado_m2a_em: c.enviado_m2a_em,
 valor_total: valorByContrato[c.id] ?? 0,
 itens: itensByContrato[c.id] ?? [],
 }));
 return {
 processo: proc.data as Processo | null,
 contratos: contratosFull,
  ataItens: ((ataItens.data ?? []) as any[]).map(
 (item): ProcessoAtaItem => ({
 id: item.id,
 codigo: String(item.numero_item ??"").trim() || item.m2a_item_id,
 descricao: item.descricao ??"Item sem descrição",
 unidade: item.unidade ?? null,
 valor_unitario: Number(item.valor_unitario ?? 0),
 m2a_item_id: item.m2a_item_id,
 m2a_ata_id: item.m2a_ata_id,
 }),
  ).sort((a, b) => compareStrictItemOrder(a, b, (item) => item.codigo)),
 };
 },
 });

 const [form, setForm] = useState<Partial<Processo>>({});
 const [dirty, setDirty] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [itemSearch, setItemSearch] = useState("");
 const [batchStatus, setBatchStatus] = useState<Record<string, string>>({});
 const [sending, setSending] = useState(false);

 const [m2aDialogOpen, setM2aDialogOpen] = useState(false);
 const [m2aFiscalId, setM2aFiscalId] = useState<string>("");
 const [m2aContratoData, setM2aContratoData] = useState<string>("");

 const { sync: syncM2A, isSyncing } = useM2ASync({
 processoId: id,
 m2aProcessoUrl: form.m2a_url ?? data?.processo?.m2a_url ?? null,
 });

 useEffect(() => {
 if (data?.processo) setForm(data.processo);
 }, [data?.processo]);

 const SECTIONS = [
 { id:"dados-administrativos", label:"Dados administrativos" },
 { id:"metadados", label:"Metadados" },
 ];
 const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
 useEffect(() => {
 const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
 (el): el is HTMLElement => Boolean(el),
 );
 if (els.length === 0) return;
 const io = new IntersectionObserver(
 (entries) => {
 const visible = entries
 .filter((e) => e.isIntersecting)
 .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
 if (visible?.target?.id) setActiveSection(visible.target.id);
 },
 { rootMargin:"-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
 );
 els.forEach((el) => io.observe(el));
 return () => io.disconnect();
 }, [data?.processo?.id]);

 useEffect(() => {
 const off = listenAllM2AProgress(async (event) => {
 const contratoAtual = data?.contratos?.find(
 (contrato) => contrato.id === event.contratoId,
 );
 const belongsToProcess = Boolean(contratoAtual);
 if (!belongsToProcess) return;

 const total = Math.max(m2aBatchRef.current.total, 1);
 const etapaIndex = Math.max(ETAPAS_ORDEM.indexOf(event.etapa), 0);
 const etapaProgress =
 event.etapa ==="concluido"
 ? 1
 : event.etapa ==="erro"
 ? 1
 : etapaIndex / Math.max(ETAPAS_ORDEM.length - 1, 1);
 const progress =
 ((m2aBatchRef.current.finished + etapaProgress) / total) * 100;

 if (event.etapa !=="concluido" && event.etapa !=="erro") {
 updateProgress(
 progress,
 `${contratoAtual?.numero_contrato ??"Contrato"}: ${event.mensagem}`,
 );
 }

 if (event.etapa ==="concluido") {
 m2aBatchRef.current.finished += 1;
 updateProgress(
 (m2aBatchRef.current.finished / total) * 100,
 `${contratoAtual?.numero_contrato ??"Contrato"} enviado com sucesso.`,
 );
 setBatchStatus((status) => ({
 ...status,
 [event.contratoId]:"sucesso",
 }));
 await supabase
 .from("contratos")
 .update({
 status_envio_m2a:"sucesso",
 enviado_m2a_em: new Date().toISOString(),
 m2a_contrato_id: event.m2a_contrato_id ?? null,
 m2a_documentos_gerados: (event.documentosM2A ?? []) as any,
 ultimo_erro_m2a: null,
 })
 .eq("id", event.contratoId);
 qc.invalidateQueries({ queryKey: ["processo-detail", id] });
 if (m2aBatchRef.current.finished >= total) {
 finishTask("Envio ao portal concluído.");
 }
 }

 if (event.etapa ==="erro") {
 m2aBatchRef.current.finished += 1;
 failTask(event.mensagem ||"Falha no envio ao portal.");
 setBatchStatus((status) => ({
 ...status,
 [event.contratoId]:"erro",
 }));
 await supabase
 .from("contratos")
 .update({
 status_envio_m2a:"erro",
 ultimo_erro_m2a: event.mensagem,
 })
 .eq("id", event.contratoId);
 qc.invalidateQueries({ queryKey: ["processo-detail", id] });
 }
 });

 return off;
 }, [data?.contratos, failTask, finishTask, id, qc, updateProgress]);

 useEffect(() => {
 const off = listenM2ABulkDownload((event) => {
 if (event.status ==="iniciado") {
 startTask("Compactando documentos",
 `Preparando ${event.total} arquivo(s)...`,
 );
 }
 if (event.status ==="progresso") {
 updateProgress(
 (event.baixados / Math.max(event.total, 1)) * 100,
 `Baixando arquivo ${event.baixados} de ${event.total}...`,
 );
 }
 if (event.status ==="concluido") {
 finishTask(`${event.baixados} documento(s) compactado(s).`);
 }
 if (event.status ==="erro") {
 failTask(event.mensagem);
 }
 });
 return off;
 }, [failTask, finishTask, startTask, updateProgress]);

 const contratos = useMemo(() => data?.contratos ?? [], [data?.contratos]);

 const { data: m2aFiscais = [] } = useServidores("FISCAL");

 const selectedContracts = useMemo(
 () => contratos.filter((contrato) => selected.has(contrato.id)),
 [contratos, selected],
 );

 const selectedUnidadeIds = useMemo(
 () =>
 Array.from(
 new Set(
 selectedContracts
 .map((contrato) => contrato.m2a_orgao_id)
 .filter((value): value is string => Boolean(value)),
 ),
 ),
 [selectedContracts],
 );
 const shouldAskFiscal = selectedContracts.length === 1;
 const preferenceUnidadeGestoraId =
 selectedUnidadeIds.length === 1 ? selectedUnidadeIds[0] : null;
 const { preference, savePreference } = useM2APreferences(
 preferenceUnidadeGestoraId,
 );

 const filteredFiscais = useMemo(() => {
 if (selectedUnidadeIds.length === 1) {
 return filterServidoresByUnidade(m2aFiscais, selectedUnidadeIds[0]);
 }
 if (selectedUnidadeIds.length > 1) {
 return m2aFiscais.filter((fiscal) =>
 fiscal.unidades_gestoras.some((unidade) =>
 selectedUnidadeIds.includes(unidade.m2a_id),
 ),
 );
 }
 return m2aFiscais;
 }, [m2aFiscais, selectedUnidadeIds]);

 useEffect(() => {
 if (!preference) return;
 if (preference.data_padrao) setM2aContratoData(preference.data_padrao);
 if (preference.fiscal_id) setM2aFiscalId(preference.fiscal_id);
 }, [preference]);

 const stats = useMemo(() => {
 let total = 0;
 let enviados = 0;
 for (const c of contratos) {
 total += c.valor_total;
 if (["enviado","sucesso"].includes(c.status_envio_m2a)) enviados++;
 }
 return { total, enviados, totalContratos: contratos.length };
 }, [contratos]);

 const itensConsolidados = useMemo(() => {
 const consumedByKey = new Map<
 string,
 {
 quantidade: number;
 descricao?: string;
 unidade?: string | null;
 valor_unitario?: number;
 }
 >();

 for (const contrato of contratos) {
 for (const item of contrato.itens) {
 const key = item.m2a_item_id || item.numero || item.descricao ||"";
 if (!key) continue;
 const current = consumedByKey.get(key) ?? { quantidade: 0 };
 current.quantidade += Number(item.quantidade_numero ?? 0);
 current.descricao ||= item.descricao;
 current.unidade ||= item.unidade;
 current.valor_unitario ||= item.valor_unitario;
 consumedByKey.set(key, current);
 }
 }

    const consumedItems = Array.from(consumedByKey.entries()).map(
      ([codigo, item]): ItemConsolidado => ({
        codigo,
        descricao: item.descricao ??"Item sem descrição",
        unidade: item.unidade ?? null,
        quantidadeTotal: item.quantidade,
        quantidadeConsumida: item.quantidade,
        saldo: 0,
        valorDisponivel: 0,
        valorUnitario: item.valor_unitario ?? 0,
        valorUnitarioContratado: item.valor_unitario ?? 0,
        valorConsumido: item.quantidade * Number(item.valor_unitario ?? 0),
      }),
    );

   const ataItens = data?.ataItens ?? [];
    const usarSnapshotPortal =
      ataItens.length > 0 &&
      (consumedByKey.size === 0 || ataItens.length >= consumedByKey.size * 0.8);
   const base =
      usarSnapshotPortal
        ? ataItens.map((item) => {
            const consumed = consumedByKey.get(item.m2a_item_id);
            const quantidadeConsumida = consumed?.quantidade ?? 0;
            const valorUnitario = Number(item.valor_unitario ?? 0);
            const valorUnitarioContratado = Number(consumed?.valor_unitario ?? 0) || valorUnitario;
            return {
              codigo: item.codigo,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidadeTotal: null as number | null,
              quantidadeConsumida,
              saldo: null as number | null,
              valorDisponivel: null as number | null,
              valorUnitario,
              valorUnitarioContratado,
              valorConsumido: quantidadeConsumida * valorUnitarioContratado,
            };
          })
        : consumedItems;

 const sortedBase = [...base].sort((a, b) =>
  compareStrictItemOrder(a, b, (item) => item.codigo),
 );
 const q = itemSearch.trim().toLowerCase();
 if (!q) return sortedBase;
 return sortedBase.filter((item) =>
 [item.codigo, item.descricao, item.unidade]
 .filter(Boolean)
 .join("")
 .toLowerCase()
 .includes(q),
 );
 }, [contratos, data?.ataItens, itemSearch]);

 const selectionStats = useMemo(() => {
 let total = 0;
 for (const c of contratos) if (selected.has(c.id)) total += c.valor_total;
 return { count: selected.size, total };
 }, [contratos, selected]);

 function update<K extends keyof Processo>(k: K, v: Processo[K]) {
 setForm((f) => ({ ...f, [k]: v }));
 setDirty(true);
 }

 async function handleSave() {
 const m2aUrl = form.m2a_url ?? null;
 const m2aId = extractM2AProcessoId(m2aUrl);
 const payload = {
 numero_processo: form.numero_processo ?? null,
 ano: anoFromNumero(form.numero_processo),
 modalidade: form.modalidade ?? null,
 objeto: form.objeto ??"",
 status: data?.processo?.status ?? form.status ??"rascunho",
 data_abertura: form.data_abertura ?? null,
 observacoes: form.observacoes ?? null,
 m2a_url: m2aUrl,
 m2a_processo_id: m2aId,
 };
 const { error } = await supabase
 .from("processos")
 .update(payload)
 .eq("id", id);
 if (error) return toast.error(error.message);
 await logAudit({
 action:"update",
 entityType:"processo",
 entityId: id,
 payload,
 });
 toast.success("Processo atualizado");
 setDirty(false);
 qc.invalidateQueries({ queryKey: ["processo-detail", id] });
 qc.invalidateQueries({ queryKey: ["processos"] });
 }

 async function handleDelete() {
 const { error } = await supabase
 .from("processos")
 .update({ deleted_at: new Date().toISOString() })
 .eq("id", id);
 if (error) return toast.error(error.message);
 await logAudit({ action:"delete", entityType:"processo", entityId: id });
 toast.success("Processo excluído");
 qc.invalidateQueries({ queryKey: ["processos"] });
 navigate({ to:"/processos" });
 }

 const deleteContratos = useMutation({
 mutationFn: async (ids: string[]) => {
 const { error } = await supabase
 .from("contratos")
 .update({ deleted_at: new Date().toISOString() })
 .in("id", ids);
 if (error) throw error;
 await logAudit({
 action:"delete",
 entityType:"contrato",
 payload: { ids, processo_id: id },
 });
 },
 onSuccess: (_d, ids) => {
 toast.success(`${ids.length} contrato(s) excluído(s)`);
 setSelected(new Set());
 qc.invalidateQueries({ queryKey: ["processo-detail", id] });
 qc.invalidateQueries({ queryKey: ["contratos"] });
 },
 onError: (e: any) => toast.error(e.message ??"Falha ao excluir"),
 });

 function toggleAll(checked: boolean) {
 setSelected(checked ? new Set(contratos.map((c) => c.id)) : new Set());
 }
 function toggleOne(cid: string, checked: boolean) {
 setSelected((prev) => {
 const n = new Set(prev);
 if (checked) n.add(cid);
 else n.delete(cid);
 return n;
 });
 }

 function validateM2AConfig() {
 const ids = Array.from(selected);
 if (ids.length === 0) {
 toast.error("Nenhum contrato selecionado.");
 return null;
 }
 if (shouldAskFiscal && !m2aFiscalId) {
 toast.error("Selecione o fiscal do contrato.");
 return null;
 }
 if (!m2aContratoData) {
 toast.error("Informe a data do contrato.");
 return null;
 }
 if (
 !data?.processo?.m2a_url ||
 !extractM2AProcessoId(data.processo.m2a_url)
 ) {
 toast.error("Processo sem URL externa válida.", {
 description:"Informe e salve o link do processo no portal antes de enviar contratos.",
 });
 return null;
 }
 if (shouldAskFiscal && !isNumericM2AId(m2aFiscalId)) {
 toast.error("IDs externos inválidos.", {
 description:"Fiscal deve usar apenas código numérico.",
 });
 return null;
 }

 const invalidos = selectedContracts.filter(
 (contrato) =>
 !contrato.m2a_orgao_id ||
 !isNumericM2AId(contrato.m2a_orgao_id) ||
 !contrato.m2a_dot_orgao_id ||
 !isNumericM2AId(contrato.m2a_dot_orgao_id) ||
 !contrato.m2a_uo_id ||
 !isNumericM2AId(contrato.m2a_uo_id) ||
 !contrato.m2a_dot_id ||
 !isNumericM2AId(contrato.m2a_dot_id) ||
 (!shouldAskFiscal &&
 (!contrato.m2a_fiscal_codigo ||
 !isNumericM2AId(contrato.m2a_fiscal_codigo))) ||
 !contrato.m2a_gestor_codigo ||
 !isNumericM2AId(contrato.m2a_gestor_codigo),
 );
 if (invalidos.length > 0) {
 toast.error("Contrato sem cadastro externo completo.", {
 description:"A secretaria do contrato precisa ter Unidade Gestora, Órgão da Dotação, UO, Dotação e Gestor cadastrados.",
 });
 console.table(
 invalidos.map((contrato) => ({
 contrato: contrato.numero_contrato,
 secretaria: contrato.secretaria_sigla,
 unidade_gestora: contrato.m2a_orgao_id,
 orgao_dotacao: contrato.m2a_dot_orgao_id,
 unidade_orcamentaria: contrato.m2a_uo_id,
 despesa_projeto_atividade: contrato.m2a_dot_id,
 fiscal_id: contrato.m2a_fiscal_codigo,
 gestor_id: contrato.m2a_gestor_codigo,
 })),
 );
 return null;
 }

 const semItens = selectedContracts.filter(
 (contrato) => contrato.itens.length === 0,
 );
 if (semItens.length > 0) {
 toast.error("Contrato sem itens para envio.", {
 description:"A automação precisa dos itens importados para adicionar e ajustar quantidades.",
 });
 console.table(
 semItens.map((contrato) => ({
 contrato: contrato.numero_contrato,
 secretaria: contrato.secretaria_sigla,
 })),
 );
 return null;
 }

 const semAta = selectedContracts.filter(
 (contrato) =>
 !contrato.m2a_ata_id || !isNumericM2AId(contrato.m2a_ata_id),
 );
 if (semAta.length > 0) {
 toast.error("Contrato sem ata definida.", {
 description:"Revise a importação: cada contrato precisa carregar a ata correta dos seus itens.",
 });
 console.table(
 semAta.map((contrato) => ({
 contrato: contrato.numero_contrato,
 secretaria: contrato.secretaria_sigla,
 fornecedor: contrato.fornecedor_nome ?? contrato.preposto,
 ata_m2a: contrato.m2a_ata_id,
 })),
 );
 return null;
 }

 return { ids };
 }

 function buildM2APayload(cid: string) {
 const contrato = contratos.find((c) => c.id === cid);
 if (!contrato) return null;
 const dataContrato = m2aContratoData;
 const dadosDotacao = {
 orgao: contrato.m2a_dot_orgao_id,
 unidade_orcamentaria: contrato.m2a_uo_id,
 despesa_projeto_atividade: contrato.m2a_dot_id,
 };

 return buildM2AContractPayload({
 contratoId: cid,
 m2aProcessoUrl: data?.processo?.m2a_url,
 m2aAtaId: contrato.m2a_ata_id,
 contrato: {
 numero_contrato: contrato.numero_contrato,
 m2a_contrato_id: contrato.m2a_contrato_id,
 objeto: contrato.objeto,
 data: dataContrato,
 preposto: contrato.preposto,
 },
 itens: contrato.itens,
 dotacao: dadosDotacao,
 unidadeGestoraId: contrato.m2a_orgao_id,
 fiscalId: shouldAskFiscal ? m2aFiscalId : contrato.m2a_fiscal_codigo,
 gestorId: contrato.m2a_gestor_codigo,
 });
 }

 function handleDiagnoseM2A() {
 if (!ensureConnected()) return;
 const config = validateM2AConfig();
 if (!config) return;
 const payload = buildM2APayload(config.ids[0]);
 if (!payload) return;

 toast.info("Diagnóstico iniciado. Veja o console da aba do portal.");
 diagnoseM2A(payload as any);
 }

 async function handleSendSelectedToM2A() {
 if (!ensureConnected()) return;
 const config = validateM2AConfig();
 if (!config) return;

 setSending(true);
 setM2aDialogOpen(false);
 m2aBatchRef.current = { total: config.ids.length, finished: 0 };
 startTask("Enviando contratos ao portal",
 `Preparando ${config.ids.length} contrato(s)...`,
 );
 toast.info(
 `Iniciando envio sequencial de ${config.ids.length} contrato(s)...`,
 );

 const { error: dataError } = await supabase
 .from("contratos")
 .update({ data: m2aContratoData })
 .in("id", config.ids);
 if (dataError) {
 setSending(false);
 failTask(dataError.message);
 toast.error("Falha ao salvar a data dos contratos.", {
 description: dataError.message,
 });
 return;
 }

 for (const cid of config.ids) {
 setBatchStatus((s) => ({ ...s, [cid]:"processando" }));
 const payload = buildM2APayload(cid);
 if (!payload) continue;
 const currentIndex = config.ids.indexOf(cid) + 1;
 const contratoAtual = contratos.find((item) => item.id === cid);
 updateProgress(
 ((currentIndex - 1) / Math.max(config.ids.length, 1)) * 100,
 `Despachando ${contratoAtual?.numero_contrato ??"contrato"} (${currentIndex} de ${config.ids.length})...`,
 );

 const contrato = contratos.find((item) => item.id === cid);
 if (
 shouldAskFiscal &&
 contrato?.m2a_orgao_id &&
 payload.dadosM2A.fiscal_id
 ) {
 await savePreference({
 unidade_gestora_id: contrato.m2a_orgao_id,
 secretaria_id: contrato.secretaria_id,
 data_padrao: payload.contrato.data as string,
 fiscal_id: payload.dadosM2A.fiscal_id as string,
 gestor_id: payload.dadosM2A.gestor_id as string,
 });
 }

 sendToM2A(payload as any);
 await sleep(3000);
 }

 setSending(false);
 toast.success(
 `${config.ids.length} comando(s) de envio despachado(s) para a extensão.`,
 );
 qc.invalidateQueries({ queryKey: ["processo-detail", id] });
 }

 function handleDownloadContratoDocs(contrato: ContratoRow) {
 const docs = getContratoDocumentos(contrato);
 if (!docs.length) {
 toast.error("Este contrato ainda não possui convocação ou contrato.");
 return;
 }
 startTask("Compactando documentos",
 `Preparando ${docs.length} documento(s)...`,
 );
 requestM2ABulkDownload(docs, {
 archive: true,
 filename: `${contrato.numero_contrato ?? contrato.id}-documentos.zip`,
 });
 }

 function handleDownloadSelectedDocs() {
 const docs = selectedContracts.flatMap(getContratoDocumentos);
 if (!selected.size) return;
 if (!docs.length) {
 toast.error("Nenhuma convocação ou contrato encontrado nos contratos selecionados.",
 );
 return;
 }
 startTask("Compactando documentos",
 `Preparando ${docs.length} documento(s)...`,
 );
 requestM2ABulkDownload(docs, {
 archive: true,
 filename: `processo-${id}-documentos.zip`,
 });
 }

 if (isLoading) {
 return (
 <AppShell title="Processo">
 <div className="flex flex-col gap-4">
 <Skeleton className="h-32 w-full" />
 <Skeleton className="h-12 w-full" />
 <Skeleton className="h-64 w-full" />
 </div>
 </AppShell>
 );
 }
 if (error || !data?.processo) {
 return (
 <AppShell title="Processo">
 <Card>
 <CardContent className="p-10">
 <EmptyState
 icon={AlertTriangle}
 title={
 error ?"Erro ao carregar processo" :"Processo não encontrado"
 }
 description={
 error
 ? (error as Error).message
 :"O registro pode ter sido removido ou arquivado."
 }
 action={
 <div className="flex items-center justify-center gap-2">
 <Button
 size="sm"
 variant="outline"
 onClick={() => window.history.back()}
 >
 <ArrowLeft className="size-4" /> Voltar
 </Button>
 <Button
 size="sm"
 onClick={() =>
 qc.invalidateQueries({
 queryKey: ["processo-detail", id],
 })
 }
 >
 Tentar novamente
 </Button>
 </div>
 }
 />
 </CardContent>
 </Card>
 </AppShell>
 );
 }

 const p = data.processo;
 const allChecked = contratos.length > 0 && selected.size === contratos.length;
 const someChecked = selected.size > 0 && !allChecked;
 const objetoLongo = (p.objeto ??"").length > 220;

 return (
 <AppShell>
 <PageHeader
 breadcrumb={
 <div className="flex items-center gap-1.5 uppercase tracking-wide">
 <span>Planejamento</span>
 <ChevronRight className="size-3" />
 <span className="truncate text-foreground">
 Processo {p.numero_processo ??"sem número"}
 </span>
 </div>
 }
 title={`Processo ${p.numero_processo ??"sem número"}`}
 subtitle={p.objeto}
 onBack={() => window.history.back()}
          secondaryActions={
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSyncing || !form.m2a_url}
                onClick={() => syncM2A()}
                title="Sincronizar dados do processo com o M2A"
              >
                {isSyncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Sincronizar M2A
              </Button>
              <PautaConsolidadaExporter 
                processoIds={[id]} 
                variant="outline" 
                size="sm" 
              />
 {objetoLongo && (
 <Dialog>
 <DialogTrigger asChild>
 <Button size="sm" variant="outline">
 Ler mais
 </Button>
 </DialogTrigger>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Objeto do processo</DialogTitle>
 </DialogHeader>
 <p className="text-sm leading-6 text-muted-foreground">
 {p.objeto}
 </p>
 </DialogContent>
 </Dialog>
 )}
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button size="sm" variant="destructive">
 <Trash2 className="size-4" /> Excluir
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
 <AlertDialogDescription>
 O processo será ocultado das listagens, preservando o
 histórico para auditoria.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={handleDelete}>
 Excluir
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </>
 }
 primaryAction={
 <Button size="sm" onClick={handleSave} disabled={!dirty}>
 <Save className="size-4" /> Salvar
 </Button>
 }
 />

 <WorkflowGuide
 steps={[
 {
 label:"Importar",
 description:"Origem do lote",
 to:"/importar-contratos",
 icon: FileUp,
 state: contratos.length ?"done" :"idle",
 },
 {
 label:"Processos",
 description:"Editar e sincronizar",
 to:"/processos",
 icon: FileText,
 state:"active",
 },
 {
 label:"Contratos",
 description: `${contratos.length} vinculado(s)`,
 to:"/contratos",
 icon: FileSignature,
 state: contratos.length ?"done" :"idle",
 },
 {
 label:"Enviar",
 description:"Automação do portal",
 to:"/contratos",
 icon: SendIcon,
 },
 ]}
 />

 <Tabs defaultValue="visao-geral" className="flex flex-col gap-4">
 <TabsList>
 <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
 <TabsTrigger value="itens">
 Itens
 <Badge variant="secondary" className="ml-1">
 {itensConsolidados.length}
 </Badge>
 </TabsTrigger>
 <TabsTrigger value="contratos">
 Contratos
 <Badge variant="secondary" className="ml-1">
 {contratos.length}
 </Badge>
 </TabsTrigger>
 </TabsList>

 <TabsContent value="visao-geral">
 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
 <FormSection
 id="dados-administrativos"
 title="Dados administrativos"
 description="Identificação, modalidade e vínculo com o portal."
 icon={<Settings2 className="size-4" />}
 >
 <div className="grid gap-4 md:grid-cols-2">
 <div className="flex flex-col gap-2">
 <Label>Número do processo</Label>
 <Input
 className="font-mono"
 value={form.numero_processo ??""}
 onChange={(e) => update("numero_processo", e.target.value)}
 placeholder="015/2025-PE"
 />
 </div>
 <div className="flex flex-col gap-2">
 <Label>Modalidade</Label>
 <Input
 value={form.modalidade ??""}
 onChange={(e) => update("modalidade", e.target.value)}
 placeholder="Pregão Eletrônico"
 />
 </div>
 <div className="flex flex-col gap-2">
 <Label>Homologação do processo</Label>
 <Input
 type="date"
 value={form.data_abertura ??""}
 onChange={(e) => update("data_abertura", e.target.value)}
 />
 </div>
                <div className="flex flex-col gap-2">
                  <Label>URL do processo no portal</Label>
                  <Input
                    value={form.m2a_url ??""}
                    onChange={(e) => update("m2a_url", e.target.value)}
                    placeholder="http://.../processo_administrativo/36002/"
                  />
                </div>
 <div className="flex flex-col gap-2 md:col-span-2">
 <Label>Observações</Label>
 <Textarea
 rows={3}
 className="resize-none"
 value={form.observacoes ??""}
 onChange={(e) => update("observacoes", e.target.value)}
 />
 </div>
 </div>
 </FormSection>

 <div className="flex flex-col gap-4">
 <SectionNav
 sections={SECTIONS}
 activeId={activeSection}
 className="!block w-full lg:!block"
 />
 <FormSection
 id="metadados"
 title="Metadados"
 description="Sincronização e totais."
 icon={<Info className="size-4" />}
 >
 <div className="flex flex-col gap-4 text-sm">
 <div className="flex flex-col gap-1">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Última sincronização
 </p>
 <p className="text-xs">
 {p.m2a_sync_at
 ? new Date(p.m2a_sync_at).toLocaleString("pt-BR")
 :"Não sincronizado"}
 </p>
 </div>
 <div className="flex flex-col gap-1">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Contratos
 </p>
 <p className="font-medium">{contratos.length}</p>
 </div>
 <div className="flex flex-col gap-1">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Valor total
 </p>
 <p className="font-medium">{BRL.format(stats.total)}</p>
 </div>
 </div>
 </FormSection>
 </div>
 </div>

 </TabsContent>


 <TabsContent value="contratos">
 <Card>
 <CardHeader className="border-b border-border/60">
 <div className="flex flex-wrap items-center gap-2">
 <div className="min-w-0 flex-1">
 <CardTitle>Contratos vinculados</CardTitle>
 <p className="mt-1 text-[13px] text-muted-foreground">
 Selecione contratos para enviar ao portal, baixar documentos
 ou excluir em lote.
 </p>
 </div>
 <div className="flex-1" />
 {selected.size > 0 && (
 <>
 <Button
 size="sm"
 variant="outline"
 onClick={handleDownloadSelectedDocs}
 >
 <Download className="size-4" /> Baixar convocação e
 contrato ({selected.size})
 </Button>
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 size="sm"
 variant="destructive"
 disabled={deleteContratos.isPending}
 >
 <Trash2 className="size-4" /> Excluir ({selected.size}
 )
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 Excluir {selected.size} contrato(s)?
 </AlertDialogTitle>
 <AlertDialogDescription>
 Os contratos selecionados serão ocultados das
 listagens.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction
 onClick={() =>
 deleteContratos.mutate(Array.from(selected))
 }
 >
 Excluir
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 <Button
 size="sm"
 onClick={() => setM2aDialogOpen(true)}
 disabled={sending || !connected}
 >
 {sending ? (
 <Loader2 className="size-4 animate-spin" />
 ) : (
 <Send className="size-4" />
 )}
 Enviar
 </Button>
 </>
 )}
 </div>
 </CardHeader>
 <CardContent className="p-0">
 {contratos.length === 0 ? (
 <EmptyState
 icon={FileSignature}
 title="Nenhum contrato vinculado"
 description="Os contratos associados a este processo aparecerão aqui após importação ou cadastro manual."
 />
 ) : (
 <div>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-10 pl-4">
 <Checkbox
 checked={
 allChecked
 ? true
 : someChecked
 ?"indeterminate"
 : false
 }
 onCheckedChange={(v) => toggleAll(v === true)}
 />
 </TableHead>
 <TableHead className="w-44">Contrato</TableHead>
  <TableHead className="w-32">Início vigência</TableHead>
 <TableHead className="w-72">Empresa</TableHead>
 <TableHead>Objeto</TableHead>
 <TableHead className="text-right">Valor</TableHead>
 <TableHead>Status</TableHead>
 <TableHead className="text-right pr-4 w-32">
 Ações
 </TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {contratos.map((c) => {
 const effectiveStatus =
 batchStatus[c.id] ?? c.status_envio_m2a;
 const isSelected = selected.has(c.id);
 return (
 <TableRow
 key={c.id}
 data-state={isSelected ?"selected" : undefined}
 className="hover:bg-muted/40 dark:hover:bg-slate-800/40"
 >
 <TableCell className="pl-4 py-2">
 <Checkbox
 checked={isSelected}
 onCheckedChange={(v) =>
 toggleOne(c.id, v === true)
 }
 />
 </TableCell>
 <TableCell className="py-2">
 <Button
 asChild
 variant="outline"
 size="sm"
 className="w-fit font-mono"
 >
 <Link to="/contratos/$id" params={{ id: c.id }}>
 {c.numero_contrato}
 </Link>
 </Button>
 </TableCell>
 <TableCell className="py-2 text-[13px] tabular-nums text-muted-foreground">
 {formatDateBR(c.data ?? c.data_texto_legado)}
 </TableCell>
 <TableCell
 className="min-w-0"
 title={c.fornecedor_nome || undefined}
 >
 <div className="line-clamp-2 text-sm font-medium text-foreground">
 {c.fornecedor_nome ||"Sem fornecedor"}
 </div>
 </TableCell>
 <TableCell className="min-w-0" title={c.objeto}>
 <div className="line-clamp-2 text-sm text-foreground/85">
 {c.objeto}
 </div>
 </TableCell>
 <TableCell className="py-2 text-right tabular-nums font-medium">
 {BRL.format(c.valor_total)}
 </TableCell>
 <TableCell className="py-2">
 <M2AStatusBadge status={effectiveStatus} />
 </TableCell>
 <TableCell className="py-2 text-right pr-4">
 <div className="flex justify-end gap-1">
 <Button
 size="icon"
 variant="ghost"
 title="Baixar convocação e contrato"
 onClick={() => handleDownloadContratoDocs(c)}
 >
 <Download className="size-3.5" />
 </Button>
 <Button
 asChild
 size="icon"
 variant="ghost"
 title="Abrir contrato"
 >
 <Link
 to="/contratos/$id"
 params={{ id: c.id }}
 >
 <ExternalLink className="size-3.5" />
 </Link>
 </Button>
 </div>
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 <TableFooter>
 <TableRow>
 <TableCell
 colSpan={5}
 className="pl-4 py-2 text-xs text-muted-foreground"
 >
 {selectionStats.count > 0 ? (
 <>
 <b className="text-foreground">
 {selectionStats.count}
 </b>{""}
 selecionado(s) de {contratos.length}
 </>
 ) : (
 <>
 {contratos.length} contrato(s) — clique para
 selecionar
 </>
 )}
 </TableCell>
 <TableCell className="text-right py-2 tabular-nums font-semibold">
 {BRL.format(
 selectionStats.count > 0
 ? selectionStats.total
 : stats.total,
 )}
 </TableCell>
 <TableCell
 colSpan={2}
 className="py-2 pr-4 text-right text-[13px] text-muted-foreground"
 >
 {selectionStats.count > 0
 ?"Soma da seleção"
 :"Soma total"}
 </TableCell>
 </TableRow>
 </TableFooter>
 </Table>
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="itens">
 <Card>
 <CardHeader className="border-b border-border/60">
 <div className="flex flex-wrap items-center gap-3">
 <div className="min-w-0 flex-1">
 <CardTitle>Itens consolidados</CardTitle>
 <p className="mt-1 text-[13px] text-muted-foreground">
 Itens importados e consumidos pelos contratos deste
 processo.
 </p>
 </div>
 <div className="flex-1" />
 <div className="relative w-full sm:w-80">
 <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={itemSearch}
 onChange={(event) => setItemSearch(event.target.value)}
 className="pl-9"
 placeholder="Buscar item por código ou descrição"
 />
 </div>
 </div>
 </CardHeader>
 <CardContent className="p-0">
 <Table>
 <TableHeader>
              <TableRow>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24">Unidade</TableHead>
                <TableHead className="w-28 text-right">
                  Quantidade
                </TableHead>
                <TableHead className="w-40 text-right">
                  Valor unit. inicial
                </TableHead>
                <TableHead className="w-40 text-right">
                  Valor contratado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensConsolidados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={FileText}
                      title="Nenhum item encontrado"
                      description={
                        itemSearch
                          ?"Ajuste a busca para localizar outros itens."
                          :"Os itens importados da ata aparecerão aqui."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                itensConsolidados.map((item) => (
                  <TableRow key={`${item.codigo}-${item.descricao}`}>
                    <TableCell className="text-xs">
                      {item.codigo}
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.descricao}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.unidade ??"—"}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatQuantidade(item.quantidadeConsumida)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {BRL.format(item.valorUnitario ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {BRL.format(item.valorUnitarioContratado ?? 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
 </Table>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>

 {dirty && (
 <StickyActionBar
 status={
 <span className="inline-flex items-center gap-1.5">
 <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
 Alterações não salvas
 </span>
 }
 >
 <Button size="sm" onClick={handleSave}>
 <Save className="size-4" /> Salvar alterações
 </Button>
 </StickyActionBar>
 )}



 <Dialog open={m2aDialogOpen} onOpenChange={setM2aDialogOpen}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Configurar envio pela extensão</DialogTitle>
 </DialogHeader>
 <div className="grid gap-4 py-2 md:grid-cols-[1fr_240px]">
 <div className="flex flex-col gap-4">
 <p className="text-[13px] text-muted-foreground">
 Informe a data de assinatura. Em envio individual, você pode
 escolher o fiscal; em lote, fiscal, gestor, unidade gestora,
 itens e dotação serão carregados do cadastro da secretaria.
 </p>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="flex flex-col gap-2">
 <Label>Data de assinatura *</Label>
 <Input
 type="date"
 value={m2aContratoData}
 onChange={(event) => setM2aContratoData(event.target.value)}
 />
 </div>
 {shouldAskFiscal ? (
 <div className="flex flex-col gap-2">
 <Label>Fiscal do contrato *</Label>
 <Select value={m2aFiscalId} onValueChange={setM2aFiscalId}>
 <SelectTrigger>
 <SelectValue placeholder="Selecione o Fiscal" />
 </SelectTrigger>
 <SelectContent>
 {filteredFiscais.map((f) => (
 <SelectItem
 key={f.id_local}
 value={f.m2a_id}
 className="text-xs"
 >
 {f.nome} - ID {f.m2a_id}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {filteredFiscais.length === 0 && (
 <p className="text-[13px] text-red-600 dark:text-red-400">
 Nenhum fiscal mapeado para a secretaria selecionada.
 </p>
 )}
 </div>
 ) : (
 <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[13px] text-muted-foreground ">
 Fiscal e gestor serão aplicados a partir do cadastro de cada
 secretaria.
 </div>
 )}
 </div>
 <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[13px] text-muted-foreground ">
 <div className="font-medium text-slate-800 ">
 Dados automáticos
 </div>
 <div className="mt-1">
 {selectedUnidadeIds.length || 0} unidade(s) gestora(s),
 {selectionStats.count} contrato(s) e{""}
 {BRL.format(selectionStats.total)} serão enviados em
 sequência.
 </div>
 </div>
 </div>
 <div className="rounded-xl border border-border/60 bg-card p-3 dark:bg-foreground">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Seleção
 </div>
 <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto pr-1">
 {selectedContracts.slice(0, 8).map((contrato) => (
 <div
 key={contrato.id}
 className="rounded-lg border border-border/60 px-2 py-1.5 text-xs "
 >
 <div className="font-mono font-medium">
 {contrato.numero_contrato}
 </div>
 <div className="truncate text-[13px] text-muted-foreground">
 {contrato.secretaria_sigla} · {contrato.itens.length}{""}
 item(ns)
 </div>
 <div className="mt-1 font-mono text-[12px] font-semibold text-foreground/85">
 {BRL.format(contrato.valor_total)}
 </div>
 </div>
 ))}
 {selectedContracts.length > 8 && (
 <div className="text-[13px] text-muted-foreground">
 + {selectedContracts.length - 8} contrato(s)
 </div>
 )}
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button variant="ghost" onClick={() => setM2aDialogOpen(false)}>
 Cancelar
 </Button>
 <Button
 variant="outline"
 onClick={handleDiagnoseM2A}
 disabled={sending || !connected}
 >
 Testar extensão
 </Button>
 <Button
 onClick={handleSendSelectedToM2A}
 disabled={sending || !connected}
 >
 Confirmar e Enviar
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </AppShell>
 );
}
