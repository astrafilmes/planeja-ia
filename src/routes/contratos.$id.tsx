import { createFileRoute, Link } from"@tanstack/react-router";
import { routeHead } from"@/lib/route-head";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { useEffect, useMemo, useState } from"react";
import { AppShell } from"@/components/layout/AppShell";
import { EmptyState } from"@/components/layout/EmptyState";
import { WorkflowGuide } from"@/components/layout/WorkflowGuide";
import { FormSection } from"@/components/layout/FormSection";
import { useProgress } from"@/contexts/ProgressContext";
import { supabase } from"@/integrations/supabase/client";
import { Button } from"@/components/ui/button";
import { Card, CardContent } from"@/components/ui/card";
import { Badge } from"@/components/ui/badge";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import { Progress } from"@/components/ui/progress";
import { Skeleton } from"@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from"@/components/ui/tabs";
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
import { toast } from"sonner";
import {
 Send,
 ArrowLeft,
 ExternalLink,
 AlertTriangle,
 FileSignature,
 FileText,
 FileUp,
 Users,
 Paperclip,
 CheckCircle2,
 XCircle,
 Loader2,
 Clock,
 Save,
 Pencil,
 Trash2,
} from"lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
 ETAPAS_ORDEM,
 ETAPA_LABEL,
 extractM2AProcessoId,
 listenM2AProgress,
 sendToM2A,
 type M2AEtapa,
 type M2AProgressEvent,
} from"@/lib/m2a";
import { useM2AConnection } from"@/contexts/M2AConnectionProvider";
import { useM2APreferences } from"@/hooks/useM2APreferences";
import { buildM2AContractPayload, isNumericM2AId } from"@/lib/m2a-payload";
import {
 AtoresEditor,
 type DefaultServidor,
} from"@/components/contratos/AtoresEditor";
import { DocumentosEditor } from"@/components/contratos/DocumentosEditor";
import { ContractReportGenerator } from"@/components/contratos/ContractReportGenerator";

export const Route = createFileRoute("/contratos/$id")({
 component: Page,
 head: ({ params }) =>
 routeHead({
 path: `/contratos/${params?.id ??""}`,
 title: `Contrato ${params?.id ??""}`.trim(),
 description:"Visualize itens, fiscais, documentos e histórico do contrato no Planeja IA.",
 ogType:"article",
 noindex: true,
 }),
});

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

function M2AStatusBadge({ status }: { status: string }) {
 const map: Record<
 string,
 { label: string; cls: string; Icon: typeof CheckCircle2 }
 > = {
 enviado: {
 label:"Enviado",
 cls:"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 Icon: CheckCircle2,
 },
 sucesso: {
 label:"Enviado",
 cls:"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 Icon: CheckCircle2,
 },
 erro: {
 label:"Erro",
 cls:"bg-red-500/10 text-red-600 border-red-500/30",
 Icon: XCircle,
 },
 processando: {
 label:"Processando",
 cls:"bg-blue-500/10 text-blue-600 border-blue-500/30",
 Icon: Loader2,
 },
 pendente: {
 label:"Pendente",
 cls:"bg-muted text-muted-foreground border-border",
 Icon: Clock,
 },
 };
 const m = map[status] ?? map.pendente;
 return (
 <Badge
 variant="outline"
 className={`gap-1 text-[10px] font-medium ${m.cls}`}
 >
 <m.Icon
 className={`size-3 ${status ==="processando" ?"animate-spin" :""}`}
 />
 {m.label}
 </Badge>
 );
}

function Page() {
 const { id } = Route.useParams();
 const qc = useQueryClient();
 const [logs, setLogs] = useState<M2AProgressEvent[]>([]);
 const [etapaAtual, setEtapaAtual] = useState<M2AEtapa | null>(null);
 const [enviando, setEnviando] = useState(false);
 const [editNumeroContrato, setEditNumeroContrato] = useState("");
 const [editAtaId, setEditAtaId] = useState("");
 const [salvandoM2AConfig, setSalvandoM2AConfig] = useState(false);
 const [warnPending, setWarnPending] = useState<null | { kind: "edit" | "delete"; item: any }>(null);
 const [warnDontShow, setWarnDontShow] = useState(false);
 const [editingItem, setEditingItem] = useState<any | null>(null);
 const [editForm, setEditForm] = useState({ descricao: "", unidade: "", quantidade: "", valor_unitario: "" });
 const [deletingItem, setDeletingItem] = useState<any | null>(null);
 const [savingItem, setSavingItem] = useState(false);

 const ITEM_WARN_KEY = "warn-edit-item";
 function requestItemAction(kind: "edit" | "delete", item: any) {
   const skip = typeof window !== "undefined" && window.localStorage.getItem(ITEM_WARN_KEY) === "off";
   if (skip) return proceedItemAction(kind, item);
   setWarnDontShow(false);
   setWarnPending({ kind, item });
 }
 function proceedItemAction(kind: "edit" | "delete", item: any) {
   if (kind === "edit") {
     setEditForm({
       descricao: item.descricao ?? "",
       unidade: item.unidade ?? "",
       quantidade: String(item.quantidade ?? ""),
       valor_unitario: String(item.valor_unitario ?? ""),
     });
     setEditingItem(item);
   } else {
     setDeletingItem(item);
   }
 }
 function confirmWarn() {
   if (warnDontShow && typeof window !== "undefined") {
     window.localStorage.setItem(ITEM_WARN_KEY, "off");
   }
   if (warnPending) proceedItemAction(warnPending.kind, warnPending.item);
   setWarnPending(null);
 }
 async function saveItemEdit() {
   if (!editingItem) return;
   setSavingItem(true);
   const qtd = Number(editForm.quantidade.replace(",", ".")) || 0;
   const vu = Number(editForm.valor_unitario.replace(",", ".")) || 0;
   const { error } = await supabase
     .from("contrato_itens")
     .update({
       descricao: editForm.descricao,
       unidade: editForm.unidade || null,
       quantidade: qtd,
       valor_unitario: vu,
       valor_total: qtd * vu,
     })
     .eq("id", editingItem.id);
   setSavingItem(false);
   if (error) return toast.error(error.message);
   toast.success("Item atualizado");
   setEditingItem(null);
   refetch();
 }
 async function deleteItemConfirmed() {
   if (!deletingItem) return;
   setSavingItem(true);
   const { error } = await supabase
     .from("contrato_itens")
     .delete()
     .eq("id", deletingItem.id);
   setSavingItem(false);
   if (error) return toast.error(error.message);
   toast.success("Item removido");
   setDeletingItem(null);
   refetch();
 }
 const { connected, ensureConnected } = useM2AConnection();
 const { startTask, updateProgress, finishTask, failTask } = useProgress();

 const {
 data: contrato,
 isLoading,
 error,
 refetch,
 } = useQuery({
 queryKey: ["contrato-full", id],
 queryFn: async () => {
 const { data: c, error: cErr } = await supabase
 .from("contratos")
 .select("*")
 .eq("id", id)
 .is("deleted_at", null)
 .maybeSingle();
 if (cErr) throw cErr;
 if (!c) return null;
 const [itens, atores, docs, processo, secretaria, m2aAtas] =
 await Promise.all([
 supabase
 .from("contrato_itens")
 .select("*")
 .eq("contrato_id", id)
 .order("ordem_item"),
 supabase.from("contrato_atores").select("*").eq("contrato_id", id),
 supabase
 .from("contrato_documentos")
 .select("*")
 .eq("contrato_id", id),
 c.processo_id
 ? supabase
 .from("processos")
 .select("*")
 .eq("id", c.processo_id)
 .is("deleted_at", null)
 .maybeSingle()
 : Promise.resolve({ data: null }),
 c.secretaria_id
 ? supabase
 .from("secretarias")
 .select("id, numero, sigla, nome, ativa, m2a_orgao_id, m2a_dot_orgao_id, m2a_uo_id, m2a_dot_id, m2a_dotacao_default, m2a_ref_coluna, m2a_fiscal_codigo, m2a_fiscal_nome, m2a_gestor_codigo, m2a_gestor_nome",
 )
 .eq("id", c.secretaria_id)
 .maybeSingle()
 : Promise.resolve({ data: null }),
 c.processo_id
 ? supabase
 .from("m2a_atas")
 .select("m2a_ata_id, numero_ata, fornecedor_nome")
 .eq("processo_id", c.processo_id)
 .order("numero_ata", { ascending: true })
 : Promise.resolve({ data: [] }),
 ]);
 const itensList = itens.data ?? [];
 const itemIds = itensList.map((i: any) => i.id);
 const dotMap: Record<string, any[]> = {};
 if (itemIds.length) {
 const { data: dots } = await supabase
 .from("contrato_item_dotacoes")
 .select("*")
 .in("item_id", itemIds);
 for (const d of (dots ?? []) as any[]) {
 (dotMap[d.item_id] ??= []).push(d);
 }
 }
 // CPFs sensíveis: só admin/gestor recebem; falha silenciosa para outros papéis.
 // Body explícito `{}` evita 400 do PostgREST.
 let secretariaWithCpf: any = secretaria.data;
 if (secretariaWithCpf?.id) {
 let cpfs: Array<{ id: string; m2a_gestor_cpf: string | null; m2a_fiscal_cpf: string | null }> = [];
 try {
 const { data, error: cpfErr } = await supabase.rpc("get_secretarias_cpfs");
 if (!cpfErr && Array.isArray(data)) cpfs = data as typeof cpfs;
 } catch {
 /* sem permissão */
 }
 const match = cpfs.find((c) => c.id === secretariaWithCpf.id);
 secretariaWithCpf = {
 ...secretariaWithCpf,
 m2a_gestor_cpf: match?.m2a_gestor_cpf ?? null,
 m2a_fiscal_cpf: match?.m2a_fiscal_cpf ?? null,
 };
 }
 return {
 contrato: c,
 itens: itensList.map((i: any) => ({
 ...i,
 dotacoes: dotMap[i.id] ?? [],
 })),
 atores: atores.data ?? [],
 documentos: docs.data ?? [],
 processo: processo.data,
 secretaria: secretariaWithCpf,
 m2aAtas: m2aAtas.data ?? [],
 };
 },
 });
 const unidadeGestoraId = contrato?.secretaria?.m2a_orgao_id ?? null;
 const { preference, savePreference } = useM2APreferences(unidadeGestoraId);

 useEffect(() => {
 const off = listenM2AProgress(id, async (e) => {
 setLogs((l) => [...l, e]);
 setEtapaAtual(e.etapa);
 const etapaIndex = Math.max(ETAPAS_ORDEM.indexOf(e.etapa), 0);
 const etapaProgress =
 e.etapa ==="concluido" || e.etapa ==="erro"
 ? 100
 : (etapaIndex / Math.max(ETAPAS_ORDEM.length - 1, 1)) * 100;
 if (e.etapa !=="concluido" && e.etapa !=="erro") {
 updateProgress(
 etapaProgress,
 ETAPA_LABEL[e.etapa]
 ? `${ETAPA_LABEL[e.etapa]}: ${e.mensagem}`
 : e.mensagem,
 );
 }
 await supabase.from("m2a_envio_logs").insert({
 contrato_id: id,
 etapa: e.etapa,
 sucesso: !!e.sucesso,
 http_status: e.http_status,
 duracao_ms: e.duracao_ms,
 mensagem: e.mensagem,
 });
 if (e.etapa ==="concluido") {
 await supabase
 .from("contratos")
 .update({
 status_envio_m2a:"sucesso",
 enviado_m2a_em: new Date().toISOString(),
 m2a_contrato_id: e.m2a_contrato_id ?? null,
 m2a_documentos_gerados: (e.documentosM2A ?? []) as any,
 ultimo_erro_m2a: null,
 })
 .eq("id", id);
 toast.success("Contrato enviado pela extensão");
 finishTask("Contrato enviado ao portal com sucesso.");
 setEnviando(false);
 refetch();
 } else if (e.etapa ==="erro") {
 await supabase
 .from("contratos")
 .update({ status_envio_m2a:"erro", ultimo_erro_m2a: e.mensagem })
 .eq("id", id);
 toast.error(e.mensagem);
 failTask(e.mensagem);
 setEnviando(false);
 refetch();
 }
 });
 return off;
 }, [failTask, finishTask, id, refetch, updateProgress]);

 useEffect(() => {
 if (!contrato?.contrato) return;
 setEditNumeroContrato(contrato.contrato.numero_contrato ??"");
 setEditAtaId(contrato.contrato.m2a_ata_id ??"");
 }, [contrato?.contrato]);

 const itens = useMemo(() => contrato?.itens ?? [], [contrato?.itens]);
 const valorTotal = useMemo(
 () =>
 itens.reduce(
 (s: number, it: any) =>
 s +
 Number(
 it.valor_total ??
 Number(it.quantidade ?? 0) * Number(it.valor_unitario ?? 0),
 ),
 0,
 ),
 [itens],
 );

 async function handleSalvarContratoM2AConfig() {
 if (!contrato) return;
 const numero = editNumeroContrato.trim();
 if (!numero) {
 toast.error("Informe o número do contrato.");
 return;
 }
 if (!isNumericM2AId(editAtaId)) {
 toast.error("Selecione uma ata válida.");
 return;
 }
 const ataSelecionada = contrato.m2aAtas.find(
 (ata: any) => ata.m2a_ata_id === editAtaId,
 );
 setSalvandoM2AConfig(true);
 const { error } = await supabase
 .from("contratos")
 .update({
 numero_contrato: numero,
 m2a_ata_id: editAtaId,
 m2a_ata_numero: ataSelecionada?.numero_ata ?? null,
 fornecedor_nome: ataSelecionada?.fornecedor_nome ?? null,
 updated_at: new Date().toISOString(),
 })
 .eq("id", id);
 setSalvandoM2AConfig(false);
 if (error) {
 toast.error(error.message);
 return;
 }
 toast.success("Contrato atualizado para envio.");
 await Promise.all([
 qc.invalidateQueries({ queryKey: ["contrato-full", id] }),
 qc.invalidateQueries({ queryKey: ["processo-detail"] }),
 ]);
 refetch();
 }

 async function handleEnviar() {
 if (!contrato) return;
 if (!ensureConnected()) return;
 const m2aUrl = contrato.processo?.m2a_url;
 const m2aId =
 contrato.processo?.m2a_processo_id || extractM2AProcessoId(m2aUrl);
 if (!m2aUrl || !m2aId)
 return toast.error("O processo não tem URL externa configurada.");
 const secretaria = contrato.secretaria;
 if (!secretaria) {
 return toast.error("Contrato sem secretaria vinculada.");
 }
 const ataId = contrato.contrato.m2a_ata_id;
 const dadosDotacao = {
 orgao: secretaria?.m2a_dot_orgao_id,
 unidade_orcamentaria: secretaria?.m2a_uo_id,
 despesa_projeto_atividade: secretaria?.m2a_dot_id,
 };
 const missing = [
 !ataId ?"Ata" : null,
 ataId && !isNumericM2AId(ataId) ?"Ata" : null,
 !isNumericM2AId(secretaria?.m2a_orgao_id) ?"Unidade Gestora" : null,
 !isNumericM2AId(secretaria?.m2a_dot_orgao_id) ?"Órgão da Dotação" : null,
 !isNumericM2AId(secretaria?.m2a_fiscal_codigo) ?"Fiscal" : null,
 !isNumericM2AId(secretaria?.m2a_gestor_codigo) ?"Gestor" : null,
 !isNumericM2AId(secretaria?.m2a_uo_id) ?"Unidade Orçamentária" : null,
 !isNumericM2AId(secretaria?.m2a_dot_id) ?"Dotação" : null,
 ].filter(Boolean);

 if (missing.length) {
 return toast.error("Cadastro externo incompleto", {
 description: `Complete: ${missing.join(",")}.`,
 });
 }

 const dataContrato = contrato.contrato.data;
 if (!dataContrato) {
 return toast.error("Informe a data do contrato antes do envio.");
 }

 let payload;
 try {
 payload = buildM2AContractPayload({
 contratoId: id,
 m2aProcessoUrl: m2aUrl,
 m2aAtaId: ataId,
 contrato: {
 ...contrato.contrato,
 data: preference?.data_padrao ?? dataContrato,
 },
 itens: contrato.itens,
 dotacao: dadosDotacao,
 unidadeGestoraId: secretaria.m2a_orgao_id,
 fiscalId: preference?.fiscal_id ?? secretaria.m2a_fiscal_codigo,
 gestorId: preference?.gestor_id ?? secretaria.m2a_gestor_codigo,
 });
 } catch (error) {
 return toast.error((error as Error).message);
 }

 setLogs([]);
 setEnviando(true);
 setEtapaAtual("validacao");
 startTask("Enviando contrato ao portal",
 `Preparando ${contrato.contrato.numero_contrato}...`,
 );
 await supabase
 .from("contratos")
 .update({ status_envio_m2a:"processando", ultimo_erro_m2a: null })
 .eq("id", id);

 await savePreference({
 unidade_gestora_id: secretaria.m2a_orgao_id ||"",
 secretaria_id: contrato.contrato.secretaria_id,
 data_padrao: payload.contrato.data as string,
 fiscal_id: payload.dadosM2A.fiscal_id as string,
 gestor_id: payload.dadosM2A.gestor_id as string,
 });

 sendToM2A(payload as any);
 }

 if (isLoading) {
 return (
 <AppShell title="Contrato">
 <div className="flex flex-col gap-3">
 <Skeleton className="h-28 w-full" />
 <Skeleton className="h-24 w-full" />
 <Skeleton className="h-64 w-full" />
 </div>
 </AppShell>
 );
 }
 if (error || !contrato) {
 return (
 <AppShell title="Contrato">
 <Card className="border-border/60">
 <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
 <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
 <p className="text-sm font-medium">
 {error ?"Erro ao carregar contrato" :"Contrato não encontrado"}
 </p>
 {error && (
 <p className="mx-auto max-w-md break-all font-mono text-[13px] text-muted-foreground">
 {(error as Error).message}
 </p>
 )}
 <div className="flex items-center justify-center gap-2 pt-2">
 <Button
 size="sm"
 variant="outline"
 onClick={() => window.history.back()}
 >
 <ArrowLeft className="size-4" /> Voltar
 </Button>
 <Button size="sm" onClick={() => refetch()}>
 Tentar novamente
 </Button>
 </div>
 </CardContent>
 </Card>
 </AppShell>
 );
 }

 const c = contrato.contrato;
 const idx = etapaAtual ? ETAPAS_ORDEM.indexOf(etapaAtual) : -1;
 const pct =
 etapaAtual ==="concluido"
 ? 100
 : etapaAtual ==="erro"
 ? 100
 : idx >= 0
 ? Math.round(((idx + 1) / ETAPAS_ORDEM.length) * 100)
 : 0;
 const statusM2A = c.status_envio_m2a ??"pendente";
 const contratoDataLabel = formatDateBR(c.data ?? c.data_texto_legado);
 const documentosM2ACount = Array.isArray(c.m2a_documentos_gerados)
 ? c.m2a_documentos_gerados.length
 : 0;
 const documentosTotalCount = contrato.documentos.length + documentosM2ACount;

 return (
 <AppShell
 title={`Contrato ${c.numero_contrato}`}
 subtitle={c.objeto}
 actions={
 <>
 <Button
 size="sm"
 variant="outline"
 onClick={() => window.history.back()}
 >
 <ArrowLeft className="size-4" /> Voltar
 </Button>
 <ContractReportGenerator contractIds={[id]} />
 <Button
 size="sm"
 onClick={handleEnviar}
 disabled={enviando || !connected}
 >
 {enviando ? (
 <Loader2 className="size-4 animate-spin" />
 ) : (
 <Send className="size-4" />
 )}
 {enviando ?"Enviando..." :"Enviar ao portal"}
 </Button>
 </>
 }
 >
 <WorkflowGuide
 steps={[
 {
 label:"Importar",
 description:"Origem ou cadastro",
 to:"/importar-contratos",
 icon: FileUp,
 state: c.import_job_id ?"done" :"idle",
 },
 {
 label:"Processos",
 description: contrato.processo?.numero_processo ??"Sem vínculo",
 to:"/processos",
 icon: FileText,
 state: contrato.processo ?"done" :"idle",
 },
 {
 label:"Contrato",
 description:"Revisar dados",
 to:"/contratos",
 icon: FileSignature,
 state:"active",
 },
 {
 label:"Enviar",
 description:
 statusM2A ==="sucesso" || statusM2A ==="enviado"
 ?"Documentos prontos"
 :"Executar extensão",
 to:"/contratos",
 icon: Send,
 state:
 statusM2A ==="sucesso" || statusM2A ==="enviado"
 ?"done"
 :"idle",
 },
 ]}
 />

 {/* Smart Header com KPIs */}
 <Card className="mb-3 overflow-hidden border-border/60">
 <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
 <div className="flex flex-col gap-2 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
             Número do contrato
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="truncate font-mono text-2xl font-semibold tracking-tight text-foreground">
               {c.numero_contrato}
              </p>
              {contrato.processo && (
                <Link
                  to="/processos/$id"
                  params={{ id: contrato.processo.id }}
                  className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  title="Abrir processo"
                >
                  Processo {contrato.processo.numero_processo ?? ""}
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Início vigência
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
             {contratoDataLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <M2AStatusBadge status={statusM2A} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Preposto: <span className="text-foreground">{c.preposto}</span> ·
          Fiscal: <span className="text-foreground">{c.fiscal}</span>
        </p>
      </div>
 <div className="grid grid-cols-3 border-t border-border/60 bg-muted/40 dark:bg-muted/30 lg:grid-cols-3 lg:border-l lg:border-t-0">
 <div className="border-r border-border/60 px-4 py-3 ">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Valor
 </p>
 <p className="text-base font-semibold tabular-nums">
 {BRL.format(valorTotal)}
 </p>
 </div>
 <div className="border-r border-border/60 px-4 py-3 ">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Itens
 </p>
 <p className="text-base font-semibold tabular-nums">
 {itens.length}
 </p>
 </div>
 <div className="px-4 py-3">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Anexos
 </p>
 <p className="text-base font-semibold tabular-nums">
 {contrato.documentos.length}
 </p>
 </div>
 </div>
 </div>
 </Card>

 {/* Dados do contrato — Grid Denso */}
 <FormSection
 id="dados-contrato"
 title="Dados do contrato"
 description="Identificação, vínculos e configuração da automação."
 icon={<FileSignature className="size-4" />}
 className="mb-3"
 >
 <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-3 text-xs md:grid-cols-[repeat(4,minmax(0,1fr))] lg:grid-cols-[repeat(6,minmax(0,1fr))]">
          <Field label="Nº contrato" mono>
           {c.numero_contrato}
          </Field>
          <Field label="Início vigência">{contratoDataLabel}</Field>
          <Field label="Preposto">{c.preposto}</Field>
          <Field label="Fiscal">{c.fiscal}</Field>
          <Field label="Ata" mono>
           {c.m2a_ata_numero ?? c.m2a_ata_id ??"—"}
          </Field>
          <div className="col-span-2 min-w-0 rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30 md:col-span-4 lg:col-span-6">
            <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label>Ata correta para este contrato</Label>
                <Select value={editAtaId} onValueChange={setEditAtaId}>
                  <SelectTrigger className="min-w-0">
                    <SelectValue placeholder="Selecione a ata" />
                  </SelectTrigger>
                  <SelectContent>
                    {contrato.m2aAtas.map((ata: any) => (
                      <SelectItem key={ata.m2a_ata_id} value={ata.m2a_ata_id}>
                        {ata.numero_ata ?? `Ata ${ata.m2a_ata_id}`} ·{""}
                        {ata.fornecedor_nome ??"Fornecedor sem nome"} · #
                        {ata.m2a_ata_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="w-full md:w-auto"
                onClick={handleSalvarContratoM2AConfig}
                disabled={salvandoM2AConfig || contrato.m2aAtas.length === 0}
              >
                {salvandoM2AConfig ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
               Salvar ajuste
              </Button>
            </div>
          </div>
 <div className="col-span-2 md:col-span-4 lg:col-span-6">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Objeto
 </p>
 <p className="mt-0.5 line-clamp-3 text-sm leading-snug">
 {c.objeto}
 </p>
 </div>
 </div>
 </FormSection>


 {/* Painel de envio */}
 <FormSection
 id="envio-extensao"
 title="Envio pela extensão"
 description="Acompanhamento da automação no portal."
 icon={<Send className="size-4" />}
 className="mb-3"
  action={
                    contrato.processo?.m2a_url ? (
                      <a
                        className="inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] text-primary hover:bg-primary/5"
                        target="_blank"
                        rel="noreferrer"
                        href={contrato.processo.m2a_url}
                      >
                        Abrir portal
                      </a>
                    ) : null
                  }
 >
 <div className="flex flex-col gap-3">
 <Progress value={pct} className="h-1.5" />
 {logs.length > 0 && (
 <div className="flex max-h-52 flex-col gap-1 overflow-auto rounded-xl border border-border/60 bg-muted/40 p-3 font-mono text-[11px] dark:bg-muted/30">
 {logs.map((l, i) => (
 <div
 key={i}
 className={
 l.sucesso === false || l.etapa ==="erro"
 ?"text-destructive"
 :""
 }
 >
 [{ETAPA_LABEL[l.etapa]}] {l.mensagem}
 {l.duracao_ms ? ` (${l.duracao_ms}ms)` :""}
 </div>
 ))}
 </div>
 )}
 {c.ultimo_erro_m2a && (
 <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-2.5 text-[13px] text-red-700 dark:text-red-400">
 <p className="font-medium mb-0.5 flex items-center gap-1">
 <XCircle className="size-3" /> Último erro
 </p>
 <p className="font-mono text-[11px] break-all">
 {c.ultimo_erro_m2a}
 </p>
 </div>
 )}
 </div>
 </FormSection>


 {/* Tabs com dados internos */}
 <Tabs defaultValue="itens">
 <TabsList>
 <TabsTrigger value="itens">
 <FileText className="size-3.5" /> Itens ({itens.length})
 </TabsTrigger>
 <TabsTrigger value="atores">
 <Users className="size-3.5" /> Servidores ({contrato.atores.length})
 </TabsTrigger>
 <TabsTrigger value="docs">
 <Paperclip className="size-3.5" /> Documentos (
 {documentosTotalCount})
 </TabsTrigger>
 </TabsList>

 <TabsContent value="itens">
 <Card className="overflow-hidden border-border/60">
 {itens.length === 0 ? (
 <EmptyState
 icon={FileText}
 title="Nenhum item cadastrado"
 description="Importe os itens via planilha para preencher este contrato."
 action={
 <Link to="/importar-contratos">
 <Button size="sm" variant="outline">
 Importar contratos
 </Button>
 </Link>
 }
 />
 ) : (
 <div>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-12 pl-4">#</TableHead>
 <TableHead className="hidden w-20 sm:table-cell">
 Lote
 </TableHead>
 <TableHead>Descrição</TableHead>
 <TableHead className="hidden w-20 sm:table-cell">
 Unid.
 </TableHead>
 <TableHead className="w-24 text-right">Qtd</TableHead>
 <TableHead className="hidden w-32 text-right sm:table-cell">
 Vlr unit.
 </TableHead>
 <TableHead className="hidden w-32 text-right sm:table-cell">
 Vlr total
 </TableHead>
 <TableHead className="w-20 pr-4 text-right">Ações</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {itens.map((it: any, i: number) => {
 const total = Number(
 it.valor_total ??
 Number(it.quantidade ?? 0) *
 Number(it.valor_unitario ?? 0),
 );
 return (
 <TableRow
 key={it.id}
 className="hover:bg-muted/40 dark:hover:bg-slate-800/40"
 >
 <TableCell className="pl-4 py-2 font-mono text-xs text-muted-foreground">
 {it.numero_item ?? i + 1}
 </TableCell>
 <TableCell className="hidden py-2 text-xs sm:table-cell">
 {it.lote ??"—"}
 </TableCell>
 <TableCell className="py-2 text-sm">
 <div className="line-clamp-2 font-medium leading-tight">
 {it.descricao}
 </div>
 {it.especificacao && (
 <div
 className="line-clamp-2 max-w-2xl text-[13px] text-muted-foreground"
 title={it.especificacao}
 >
 {it.especificacao}
 </div>
 )}
 <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground sm:hidden">
 <span>Lote {it.lote ??"—"}</span>
 <span>Unid. {it.unidade ??"—"}</span>
 <span>{BRL.format(total)}</span>
 </div>
 </TableCell>
 <TableCell className="hidden py-2 text-xs sm:table-cell">
 {it.unidade ??"—"}
 </TableCell>
 <TableCell className="py-2 text-right text-xs tabular-nums">
 {Number(it.quantidade ?? 0).toLocaleString("pt-BR")}
 </TableCell>
 <TableCell className="hidden py-2 text-right text-xs tabular-nums sm:table-cell">
 {BRL.format(Number(it.valor_unitario ?? 0))}
 </TableCell>
 <TableCell className="hidden py-2 text-right pr-4 text-xs tabular-nums font-medium sm:table-cell">
 {BRL.format(total)}
 </TableCell>
 </TableRow>
 );
 })}
 </TableBody>
 <TableFooter>
 <TableRow className="sm:hidden">
 <TableCell
 colSpan={3}
 className="px-4 py-3 text-xs text-muted-foreground"
 >
 <div className="flex items-center justify-between gap-3">
 <span>
 <b className="text-foreground">{itens.length}</b>{""}
 item(ns)
 </span>
 <span className="font-semibold tabular-nums text-foreground">
 {BRL.format(valorTotal)}
 </span>
 </div>
 </TableCell>
 </TableRow>
 <TableRow className="hidden sm:table-row">
 <TableCell
 colSpan={4}
 className="pl-4 py-2 text-xs text-muted-foreground"
 >
 <b className="text-foreground">{itens.length}</b>{""}
 item(ns)
 </TableCell>
 <TableCell className="text-right py-2 text-xs tabular-nums text-muted-foreground">
 {itens
 .reduce(
 (s: number, it: any) =>
 s + Number(it.quantidade ?? 0),
 0,
 )
 .toLocaleString("pt-BR")}
 </TableCell>
 <TableCell className="py-2 text-right text-[11px] text-muted-foreground">
 Total
 </TableCell>
 <TableCell className="text-right pr-4 py-2 tabular-nums font-semibold">
 {BRL.format(valorTotal)}
 </TableCell>
 </TableRow>
 </TableFooter>
 </Table>
 </div>
 )}
 </Card>
 </TabsContent>

 <TabsContent value="atores">
 <Card className="border-border/60">
 <CardContent className="p-4">
     <AtoresEditor
 contratoId={id}
 atores={contrato.atores as any}
 onChange={refetch}
 locked={statusM2A === "sucesso"}
 defaults={
 [
 {
 tipo:"fiscal",
 nome: contrato.secretaria?.m2a_fiscal_nome ?? c.fiscal,
 cpf: contrato.secretaria?.m2a_fiscal_cpf ?? null,
 origem: contrato.secretaria?.m2a_fiscal_nome
 ? `Secretaria ${c.secretaria_sigla}`
 :"Contrato",
 },
 {
 tipo:"gestor",
 nome: contrato.secretaria?.m2a_gestor_nome ?? null,
 cpf: contrato.secretaria?.m2a_gestor_cpf ?? null,
 origem: `Secretaria ${c.secretaria_sigla}`,
 },
 {
 tipo:"preposto",
 nome: c.preposto,
 cpf: null,
 origem:"Definido no contrato",
 },
 ] as DefaultServidor[]
 }
 />
 </CardContent>
 </Card>
 </TabsContent>
 <TabsContent value="docs">
 <Card className="border-border/60">
 <CardContent className="p-4">
 <DocumentosEditor
 contratoId={id}
 contratoNumero={c.numero_contrato}
 documentos={contrato.documentos as any}
 documentosM2A={c.m2a_documentos_gerados}
 onChange={refetch}
 />
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </AppShell>
 );
}

function Field({
 label,
 children,
 mono,
}: {
 label: string;
 children: React.ReactNode;
 mono?: boolean;
}) {
 return (
 <div className="min-w-0">
 <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 {label}
 </p>
 <p
 className={`mt-0.5 text-sm truncate ${mono ?"font-mono text-xs" :""}`}
 title={typeof children ==="string" ? children : undefined}
 >
 {children}
 </p>
 </div>
 );
}
