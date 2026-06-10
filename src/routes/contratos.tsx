import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell } from "@/components/layout/AppShell";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { EmptyState } from "@/components/layout/EmptyState";
import { useProgress } from "@/contexts/ProgressContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Plus,
  Search,
  Download,
  MoreHorizontal,
  ExternalLink,
  FileSignature,
  FileText,
  FileUp,
  Send,
  Trash2,
  X,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { normalizeContratoBase } from "@/lib/normalize";
import { getNextContratoNumbers } from "@/lib/contrato-numbering";
import { downloadCSV } from "@/lib/export";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listenM2ABulkDownload,
  requestM2ABulkDownload,
  type M2ADocumentoGerado,
} from "@/lib/m2a";
import { ContractReportGenerator } from "@/components/contratos/ContractReportGenerator";

export const Route = createFileRoute("/contratos")({ component: Page });

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDateBR(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sem data";

  const brDate = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (brDate) return `${brDate[1]}/${brDate[2]}/${brDate[3]}`;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("pt-BR");
}

const STATUS = ["ativo", "encerrado", "cancelado", "rascunho"] as const;
const M2A_STATUS = [
  "pendente",
  "processando",
  "sucesso",
  "enviado",
  "erro",
] as const;
const DOCUMENTOS_DOWNLOAD_POSICOES = new Set([4, 5]);

const ENVIO_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  sucesso: "Sucesso",
  enviado: "Enviado",
  erro: "Erro",
};

const schema = z.object({
  secretariaId: z.string().uuid("Selecione a secretaria"),
  gerarAutomatico: z.boolean().default(true),
  numeroProcessoBase: z.string().trim().max(20).optional().or(z.literal("")),
  numeroContrato: z.string().trim().max(50).optional().or(z.literal("")),
  preposto: z.string().trim().min(2).max(150),
  objeto: z.string().trim().min(3).max(2000),
  data: z.string().optional().or(z.literal("")),
  fiscal: z.string().trim().min(2).max(150),
  link_contrato: z.string().trim().min(1).max(255),
  status: z.enum(STATUS).default("ativo"),
});

function m2aBadgeClass(s: string) {
  if (["sucesso", "enviado"].includes(s))
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (s === "erro")
    return "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400";
  if (s === "processando")
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400";
}

function normalizeDocumentosM2A(
  value: unknown,
  contrato: { id: string; numero_contrato: string },
): M2ADocumentoGerado[] {
  if (!Array.isArray(value)) return [];
  return (value as any[])
    .map((item, index) => {
      if (!DOCUMENTOS_DOWNLOAD_POSICOES.has(index + 1)) return null;
      if (!item || typeof item !== "object") return null;
      const doc = item as { id_m2a?: unknown; id?: unknown; nome?: unknown };
      const id_m2a = String(doc.id_m2a ?? doc.id ?? "").trim();
      const nome = String(doc.nome ?? `Documento ${id_m2a}`).trim();
      if (!/^\d+$/.test(id_m2a)) return null;
      return {
        id_m2a,
        nome: `${contrato.numero_contrato} - ${nome}`,
        contratoId: contrato.id,
        contratoNumero: contrato.numero_contrato,
      };
    })
    .filter(Boolean) as M2ADocumentoGerado[];
}

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDetailRoute = pathname !== "/contratos";

  const [search, setSearch] = useState("");
  const [secFilter, setSecFilter] = useState<string>("__all");
  const [m2aFilter, setM2aFilter] = useState<string>("__all");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [downloadingDocs, setDownloadingDocs] = useState(false);
  const { startTask, updateProgress, finishTask, failTask } = useProgress();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      gerarAutomatico: true,
      status: "ativo",
      preposto: "",
      objeto: "",
      fiscal: "",
      link_contrato: "",
      secretariaId: "",
    },
  });
  const gerarAuto = form.watch("gerarAutomatico");

  const { data: secretarias } = useQuery({
    queryKey: ["secretarias-list"],
    enabled: !isDetailRoute,
    queryFn: async () =>
      (
        await supabase
          .from("secretarias")
          .select("id, numero, sigla, nome")
          .order("numero")
      ).data ?? [],
  });

  const { data: contratos, isLoading } = useQuery({
    queryKey: ["contratos", search, secFilter, m2aFilter],
    enabled: !isDetailRoute,
    queryFn: async () => {
      let q = supabase
        .from("contratos")
        .select(
          "id, numero_contrato, secretaria_id, secretaria_sigla, secretaria_nome, fornecedor_nome, preposto, objeto, fiscal, data, data_texto_legado, status, status_envio_m2a, m2a_contrato_id, m2a_documentos_gerados, link_contrato, created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (search)
        q = q.or(
          `numero_contrato.ilike.%${search}%,objeto.ilike.%${search}%,fornecedor_nome.ilike.%${search}%,preposto.ilike.%${search}%`,
        );
      if (secFilter !== "__all") q = q.eq("secretaria_id", secFilter);
      if (m2aFilter !== "__all") q = q.eq("status_envio_m2a", m2aFilter);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      const list = data ?? [];
      const ids = list.map((c: any) => c.id);
      const totals: Record<string, number> = {};
      if (ids.length) {
        const { data: itens } = await supabase
          .from("contrato_itens")
          .select("contrato_id, valor_total")
          .in("contrato_id", ids);
        for (const it of (itens ?? []) as any[]) {
          totals[it.contrato_id] =
            (totals[it.contrato_id] ?? 0) + Number(it.valor_total ?? 0);
        }
      }
      return list.map((c: any) => ({ ...c, valor_total: totals[c.id] ?? 0 }));
    },
  });

  const stats = useMemo(() => {
    const list = contratos ?? [];
    return {
      count: list.length,
      total: list.reduce((s: number, c: any) => s + c.valor_total, 0),
    };
  }, [contratos]);

  const hasFilters = search || secFilter !== "__all" || m2aFilter !== "__all";

  function clearFilters() {
    setSearch("");
    setSecFilter("__all");
    setM2aFilter("__all");
  }

  useEffect(() => {
    const off = listenM2ABulkDownload((event) => {
      if (event.status === "iniciado") {
        setDownloadingDocs(true);
        startTask(
          "Compactando documentos",
          `Preparando ${event.total} arquivo(s)...`,
        );
      }
      if (event.status === "progresso") {
        setDownloadingDocs(true);
        updateProgress(
          (event.baixados / Math.max(event.total, 1)) * 100,
          `Baixando arquivo ${event.baixados} de ${event.total}...`,
        );
      }
      if (event.status === "concluido") {
        setDownloadingDocs(false);
        finishTask(`${event.baixados} documento(s) compactado(s).`);
        toast.success(`${event.baixados} documento(s) enviados para download.`);
      }
      if (event.status === "erro") {
        setDownloadingDocs(false);
        failTask(event.mensagem);
        toast.error("Falha no download em lote", {
          description: event.mensagem,
        });
      }
    });
    return off;
  }, [failTask, finishTask, startTask, updateProgress]);

  async function onSubmit(v: z.infer<typeof schema>) {
    const sec = secretarias?.find((s: any) => s.id === v.secretariaId);
    if (!sec) return toast.error("Secretaria inválida");
    let numero = v.numeroContrato ?? "";
    if (v.gerarAutomatico) {
      const numeroBase = normalizeContratoBase(v.numeroProcessoBase);
      if (!numeroBase)
        return toast.error("Informe o número base do processo (ex.: 026/2025)");
      const [nextNumber] = await getNextContratoNumbers(supabase, {
        numeroBase,
        secretariaSigla: sec.sigla,
        quantidade: 1,
      });
      const { error: numeracaoError } = await supabase.from("numeracao").upsert(
        {
          secretaria_num: sec.numero,
          contador: nextNumber.sequencia,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "secretaria_num",
        },
      );
      if (numeracaoError) {
        return toast.error("Falha ao atualizar contador", {
          description: numeracaoError.message,
        });
      }
      numero = nextNumber.numeroContrato;
    }
    if (!numero) return toast.error("Informe o número do contrato");
    const insert = {
      numero_contrato: numero,
      secretaria_num: sec.numero,
      secretaria_id: sec.id,
      secretaria_nome: sec.nome,
      secretaria_sigla: sec.sigla,
      preposto: v.preposto,
      objeto: v.objeto,
      data: v.data || null,
      fiscal: v.fiscal,
      link_contrato: v.link_contrato,
      status: v.status,
    };
    const { data, error } = await supabase
      .from("contratos")
      .insert(insert)
      .select()
      .single();
    if (error) return toast.error(error.message);
    await logAudit({
      action: "create",
      entityType: "contrato",
      entityId: data.id,
      payload: insert,
    });
    toast.success(`Contrato ${numero} criado`);
    form.reset({
      gerarAutomatico: true,
      status: "ativo",
      preposto: "",
      objeto: "",
      fiscal: "",
      link_contrato: "",
      secretariaId: "",
    });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["contratos"] });
  }

  async function handleDelete(c: any) {
    const { error } = await supabase
      .from("contratos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "delete",
      entityType: "contrato",
      entityId: c.id,
    });
    toast.success("Contrato excluído");
    setDeleting(null);
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(c.id);
      return n;
    });
    qc.invalidateQueries({ queryKey: ["contratos"] });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase
      .from("contratos")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    await Promise.all(
      ids.map((id) =>
        logAudit({ action: "delete", entityType: "contrato", entityId: id }),
      ),
    );
    toast.success(`${ids.length} contrato(s) excluído(s)`);
    setSelected(new Set());
    setBulkOpen(false);
    qc.invalidateQueries({ queryKey: ["contratos"] });
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set((contratos ?? []).map((c: any) => c.id)));
    else setSelected(new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function exportarCSV() {
    const rows = (contratos ?? []).map((c: any) => ({
      numero_contrato: c.numero_contrato,
      secretaria: c.secretaria_sigla,
      empresa: c.fornecedor_nome ?? "",
      objeto: c.objeto,
      fiscal: c.fiscal,
      valor: c.valor_total,
      data: formatDateBR(c.data ?? c.data_texto_legado),
      status: c.status,
      status_m2a: c.status_envio_m2a,
      link: c.link_contrato,
    }));
    downloadCSV(`contratos-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success(`${rows.length} contratos exportados`);
  }

  function handleBulkDownloadDocumentos() {
    const docs = (contratos ?? [])
      .filter((contrato: any) => selected.has(contrato.id))
      .flatMap((contrato: any) =>
        normalizeDocumentosM2A(contrato.m2a_documentos_gerados, contrato),
      );

    if (!selected.size) return;
    if (!docs.length) {
      toast.error(
        "Nenhuma convocação ou contrato encontrado nos contratos selecionados.",
      );
      return;
    }

    startTask(
      "Compactando documentos",
      `Preparando ${docs.length} documento(s)...`,
    );
    requestM2ABulkDownload(docs, {
      archive: true,
      filename: `contratos-documentos-${new Date().toISOString().slice(0, 10)}.zip`,
    });
  }

  if (isDetailRoute) return <Outlet />;

  return (
    <AppShell
      title="Contratos"
      subtitle="Cadastro, numeração automática e consulta"
      actions={
        <>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDownloadDocumentos}
              disabled={downloadingDocs}
            >
              <Download className="size-4" /> Baixar convocação e contrato
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkOpen(true)}
            >
              <Trash2 className="size-4" /> Excluir ({selected.size})
            </Button>
          )}
          {selected.size > 0 ? (
            <ContractReportGenerator contractIds={Array.from(selected)} isBatch={true} />
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={exportarCSV}
              disabled={!contratos?.length}
            >
              <Download className="size-4" /> CSV Simples
            </Button>
          )}
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v)
                form.reset({
                  gerarAutomatico: true,
                  status: "ativo",
                  preposto: "",
                  objeto: "",
                  fiscal: "",
                  link_contrato: "",
                  secretariaId: "",
                });
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl gap-0 p-0">
              <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-[#0B0F19]">
                <DialogTitle>Novo contrato</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex max-h-[80vh] flex-col"
              >
                <div className="flex flex-col gap-5 overflow-y-auto p-5">
                  {/* Identificação */}
                  <section className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Identificação
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                      <div className="col-span-3 flex flex-col gap-1.5">
                        <Label>Secretaria *</Label>
                        <Select
                          value={form.watch("secretariaId")}
                          onValueChange={(v) =>
                            form.setValue("secretariaId", v, {
                              shouldValidate: true,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                          <SelectContent>
                            {secretarias?.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.numero} — {s.sigla} — {s.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.formState.errors.secretariaId && (
                          <p className="text-[13px] text-destructive">
                            {form.formState.errors.secretariaId.message}
                          </p>
                        )}
                      </div>
                      <div className="col-span-3 flex h-[60px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-[#0B0F19]">
                        <div>
                          <div className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                            Numeração automática
                          </div>
                          <div className="text-[13px] text-slate-500 dark:text-slate-400">
                            Contador da secretaria
                          </div>
                        </div>
                        <Switch
                          checked={gerarAuto}
                          onCheckedChange={(v) =>
                            form.setValue("gerarAutomatico", v)
                          }
                        />
                      </div>
                      {gerarAuto ? (
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <Label>Nº base do processo *</Label>
                          <Input
                            placeholder="026/2025"
                            {...form.register("numeroProcessoBase")}
                          />
                        </div>
                      ) : (
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <Label>Nº do contrato *</Label>
                          <Input
                            placeholder="026/2025GAB04"
                            {...form.register("numeroContrato")}
                          />
                        </div>
                      )}
                      <div className="col-span-2 flex flex-col gap-1.5">
                        <Label>Data</Label>
                        <Input type="date" {...form.register("data")} />
                      </div>
                    </div>
                  </section>

                  {/* Pessoas e link */}
                  <section className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Pessoas e referência
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                      <div className="col-span-2 flex flex-col gap-1.5">
                        <Label>Preposto *</Label>
                        <Input {...form.register("preposto")} />
                      </div>
                      <div className="col-span-2 flex flex-col gap-1.5">
                        <Label>Fiscal *</Label>
                        <Input {...form.register("fiscal")} />
                      </div>
                      <div className="col-span-2 flex flex-col gap-1.5">
                        <Label>Link / código *</Label>
                        <Input
                          className="font-mono"
                          placeholder="5115"
                          {...form.register("link_contrato")}
                        />
                      </div>
                      <div className="col-span-6 flex flex-col gap-1.5">
                        <Label>Objeto *</Label>
                        <Textarea
                          rows={3}
                          className="resize-none"
                          {...form.register("objeto")}
                        />
                      </div>
                    </div>
                  </section>
                </div>
                <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-[#0B0F19]">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting
                      ? "Salvando..."
                      : "Salvar contrato"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <WorkflowGuide
        steps={[
          {
            label: "Importar",
            description: "Planilha revisada",
            to: "/importar-contratos",
            icon: FileUp,
            state: "done",
          },
          {
            label: "Processos",
            description: "Processo e atas",
            to: "/processos",
            icon: FileText,
            state: "done",
          },
          {
            label: "Contratos",
            description: "Selecionar e revisar",
            to: "/contratos",
            icon: FileSignature,
            state: "active",
          },
          {
            label: "Enviar",
            description: "Portal e PDFs 4/5",
            to: "/contratos",
            icon: Send,
          },
        ]}
      />

      <Card className="mb-4 p-6">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-10">
          <div className="md:col-span-5">
            <Label>Buscar</Label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nº, objeto, empresa..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-3">
            <Label>Secretaria</Label>
            <Select value={secFilter} onValueChange={setSecFilter}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas</SelectItem>
                {secretarias?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sigla} — {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Status</Label>
            <Select value={m2aFilter} onValueChange={setM2aFilter}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos</SelectItem>
                {M2A_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ENVIO_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <div className="flex items-center justify-between text-xs text-muted-foreground md:col-span-10">
              <span>
                {stats.count} resultado(s) · {BRL.format(stats.total)}
              </span>
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="size-3.5" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-3 sm:pl-4">
                  <Checkbox
                    checked={
                      (contratos?.length ?? 0) > 0 &&
                      selected.size === (contratos?.length ?? 0)
                    }
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead className="w-[8.25rem] whitespace-nowrap sm:w-44">
                  Contrato
                </TableHead>
                <TableHead className="hidden w-32 whitespace-nowrap md:table-cell">
                  Data
                </TableHead>
                <TableHead className="hidden min-w-52 whitespace-nowrap lg:table-cell">
                  Empresa
                </TableHead>
                <TableHead className="whitespace-nowrap">Objeto</TableHead>
                <TableHead className="hidden w-28 text-right whitespace-nowrap sm:table-cell">
                  Valor
                </TableHead>
                <TableHead className="hidden w-28 whitespace-nowrap sm:table-cell">
                  Status
                </TableHead>
                <TableHead className="w-20 pr-3 text-right whitespace-nowrap sm:pr-4">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j} className="py-2">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && (contratos?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      icon={FileSignature}
                      title={
                        hasFilters
                          ? "Nenhum contrato encontrado"
                          : "Nenhum contrato cadastrado"
                      }
                      description={
                        hasFilters
                          ? "Ajuste a busca ou limpe os filtros para consultar outros contratos."
                          : "Crie um contrato manualmente ou importe uma planilha para começar."
                      }
                      action={
                        hasFilters ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={clearFilters}
                          >
                            Limpar filtros
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setOpen(true)}
                          >
                            <Plus className="size-4" />
                            Criar contrato
                          </Button>
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {contratos?.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  data-state={selected.has(c.id) ? "selected" : undefined}
                  onClick={() =>
                    navigate({ to: "/contratos/$id", params: { id: c.id } })
                  }
                >
                  <TableCell
                    className="pl-3 py-2 sm:pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(v) => toggleOne(c.id, !!v)}
                      aria-label={`Selecionar ${c.numero_contrato}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                        {c.numero_contrato}
                      </span>
                      <div className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                        {c.secretaria_sigla ?? "Sem secretaria"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-2 font-mono text-[13px] text-slate-600 whitespace-nowrap dark:text-slate-300 md:table-cell">
                    {formatDateBR(c.data ?? c.data_texto_legado)}
                  </TableCell>
                  <TableCell
                    className="hidden min-w-0 py-2 lg:table-cell"
                    title={c.fornecedor_nome ?? ""}
                  >
                    <div className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {c.fornecedor_nome ?? "Sem empresa"}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-0" title={c.objeto}>
                    <div className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {c.objeto}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400 lg:hidden">
                      <span className="truncate">
                        {c.fornecedor_nome ?? "Sem empresa"}
                      </span>
                      <span className="md:hidden">
                        {formatDateBR(c.data ?? c.data_texto_legado)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium ${m2aBadgeClass(
                          c.status_envio_m2a ?? "pendente",
                        )}`}
                      >
                        {ENVIO_STATUS_LABELS[
                          c.status_envio_m2a ?? "pendente"
                        ] ??
                          c.status_envio_m2a ??
                          "Pendente"}
                      </Badge>
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        {BRL.format(c.valor_total)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-2 text-right tabular-nums text-xs font-medium whitespace-nowrap sm:table-cell">
                    {BRL.format(c.valor_total)}
                  </TableCell>
                  <TableCell className="hidden py-2 sm:table-cell">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${m2aBadgeClass(c.status_envio_m2a ?? "pendente")}`}
                    >
                      {ENVIO_STATUS_LABELS[c.status_envio_m2a ?? "pendente"] ??
                        c.status_envio_m2a ??
                        "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="pr-3 py-2 text-right whitespace-nowrap sm:pr-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        title="Abrir"
                        onClick={() =>
                          navigate({
                            to: "/contratos/$id",
                            params: { id: c.id },
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        title="Excluir"
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {(contratos?.length ?? 0) > 0 && (
              <TableFooter>
                <TableRow className="sm:hidden">
                  <TableCell
                    colSpan={4}
                    className="px-3 py-3 text-xs text-muted-foreground"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        <b className="text-foreground">{stats.count}</b>{" "}
                        contrato(s)
                        {selected.size > 0 && (
                          <>
                            {" "}
                            · <b className="text-foreground">
                              {selected.size}
                            </b>{" "}
                            selecionado(s)
                          </>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {BRL.format(stats.total)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow className="hidden sm:table-row">
                  <TableCell
                    colSpan={5}
                    className="pl-4 py-2 text-xs text-muted-foreground"
                  >
                    <b className="text-foreground">{stats.count}</b> contrato(s)
                    {selected.size > 0 && (
                      <>
                        {" "}
                        · <b className="text-foreground">
                          {selected.size}
                        </b>{" "}
                        selecionado(s)
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2 tabular-nums font-semibold whitespace-nowrap">
                    {BRL.format(stats.total)}
                  </TableCell>
                  <TableCell
                    colSpan={2}
                    className="py-2 text-right text-[11px] text-muted-foreground pr-4"
                  >
                    Soma total
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </Card>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir contrato {deleting?.numero_contrato}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O contrato será ocultado das listagens, preservando o histórico
              para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDelete(deleting)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selected.size} contrato(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os contratos selecionados serão ocultados das listagens,
              preservando o histórico para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>
              Excluir todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
