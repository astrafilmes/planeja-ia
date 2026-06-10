import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell } from "@/components/layout/AppShell";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { EmptyState } from "@/components/layout/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  FileSignature,
  FileText,
  FileUp,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { extractM2AProcessoId } from "@/lib/m2a";
import { downloadCSV } from "@/lib/export";
import { Skeleton } from "@/components/ui/skeleton";
import { PautaConsolidadaExporter } from "@/components/contratos/PautaConsolidadaExporter";

export const Route = createFileRoute("/processos")({ component: Page });

const PROCESSO_RE = /^(\d{3})\/(\d{4})-(PE|CE|DE|CR|INE|CH)$/i;

const MODALIDADES = {
  PE: "Pregão Eletrônico",
  CE: "Concorrência",
  DE: "Dispensa",
  CR: "Adesão/Carona",
  INE: "Inexigibilidade",
  CH: "Chamamento",
} as const;

type ModalidadeCodigo = keyof typeof MODALIDADES;

function parseNumeroProcesso(numero?: string | null) {
  const match = String(numero ?? "")
    .trim()
    .toUpperCase()
    .match(PROCESSO_RE);
  if (!match) return null;
  return {
    numero: `${match[1]}/${match[2]}-${match[3] as ModalidadeCodigo}`,
    ano: Number(match[2]),
    codigo: match[3] as ModalidadeCodigo,
    modalidade: MODALIDADES[match[3] as ModalidadeCodigo],
  };
}

function formatExternalStatus(p: any) {
  if (p.m2a_processo_id) return "Configurado";
  return "Pendente";
}

function externalStatusVariant(p: any): "default" | "outline" {
  return p.m2a_processo_id ? "default" : "outline";
}

function resumirObjetoProcesso(objeto?: string | null) {
  const original = String(objeto ?? "").trim();
  if (!original) return "Objeto não informado";
  return original
    .replace(
      /^registro\s+de\s+pre[cç]os\s+visando\s+(à|a)\s+futura\s+e\s+eventual\s+/i,
      "",
    )
    .replace(/^registro\s+de\s+pre[cç]os\s+para\s+/i, "")
    .replace(/^registro\s+de\s+pre[cç]os\s+/i, "")
    .replace(/^aquisi[cç][aã]o\s+de\s+/i, "Aquisição de ")
    .replace(/\s+/g, " ")
    .trim();
}

// extrai o ano (YYYY) do número do processo (ex.: 012/2025-PE → 2025)
function anoFromNumero(numero?: string | null): number | null {
  const parsed = parseNumeroProcesso(numero);
  if (parsed) return parsed.ano;
  const m = String(numero ?? "").match(/\/(\d{4})(?:-|$)/);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? y : null;
}

const schema = z.object({
  numero_processo: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => PROCESSO_RE.test(v), {
      message: "Use o formato completo: 015/2025-PE.",
    }),
  objeto: z.string().trim().min(3, "Mínimo 3 caracteres").max(500),
  data_abertura: z.string().optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
  m2a_url: z.string().trim().url("URL inválida").optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isDetailRoute = pathname !== "/processos";
  const [search, setSearch] = useState("");
  const [modalidadeFilter, setModalidadeFilter] = useState<string>("__all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { numero_processo: "", objeto: "" },
  });

  const watchedNumero = form.watch("numero_processo");
  const detectedProcesso = parseNumeroProcesso(watchedNumero);

  useEffect(() => {
    if (editing) {
      form.reset({
        numero_processo: editing.numero_processo ?? "",
        objeto: editing.objeto ?? "",
        data_abertura: editing.data_abertura ?? "",
        observacoes: editing.observacoes ?? "",
        m2a_url: editing.m2a_url ?? "",
      });
      setOpen(true);
    }
  }, [editing, form]);

  const { data: processos, isLoading } = useQuery({
    queryKey: ["processos", search, modalidadeFilter],
    enabled: !isDetailRoute,
    queryFn: async () => {
      let q = supabase
        .from("processos")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (search)
        q = q.or(`numero_processo.ilike.%${search}%,objeto.ilike.%${search}%`);
      if (modalidadeFilter !== "__all") {
        q = q.ilike("numero_processo", `%-${modalidadeFilter}`);
      }
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setSelected(new Set());
  }, [processos]);

  async function onSubmit(v: FormValues) {
    const parsed = parseNumeroProcesso(v.numero_processo);
    if (!parsed) {
      toast.error("Informe o número completo do processo.");
      return;
    }
    const payload: any = { ...v };
    payload.numero_processo = parsed.numero;
    payload.ano = parsed.ano;
    payload.modalidade = parsed.modalidade;
    payload.status = editing?.status ?? "em_andamento";
    if (!payload.data_abertura) delete payload.data_abertura;
    if (payload.m2a_url) {
      payload.m2a_processo_id = extractM2AProcessoId(payload.m2a_url);
    } else {
      payload.m2a_url = null;
      payload.m2a_processo_id = null;
    }

    if (editing) {
      const { error } = await supabase
        .from("processos")
        .update(payload)
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit({
        action: "update",
        entityType: "processo",
        entityId: editing.id,
        payload,
      });
      toast.success("Processo atualizado");
    } else {
      const { data, error } = await supabase
        .from("processos")
        .insert(payload)
        .select()
        .single();
      if (error) return toast.error(error.message);
      await logAudit({
        action: "create",
        entityType: "processo",
        entityId: data.id,
        payload,
      });
      toast.success("Processo criado");
    }
    form.reset({ numero_processo: "", objeto: "" });
    setEditing(null);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["processos"] });
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase
      .from("processos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", deleting.id);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "delete",
      entityType: "processo",
      entityId: deleting.id,
    });
    toast.success("Processo excluído");
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["processos"] });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("processos")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error(error.message);
    await logAudit({
      action: "delete",
      entityType: "processo",
      entityId: ids.join(","),
      payload: { ids, count: ids.length },
    });
    toast.success(`${ids.length} processo(s) excluído(s)`);
    setSelected(new Set());
    setBulkDeleteOpen(false);
    qc.invalidateQueries({ queryKey: ["processos"] });
  }

  function exportarCSV() {
    const rows = (processos ?? []).map((p: any) => ({
      numero_processo: p.numero_processo ?? "",
      ano: p.ano ?? anoFromNumero(p.numero_processo) ?? "",
      modalidade: p.modalidade ?? "",
      objeto: p.objeto,
      status: p.status,
      data_abertura: p.data_abertura ?? "",
      status_integracao: formatExternalStatus(p),
      criado_em: p.created_at,
    }));
    downloadCSV(`processos-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success(`${rows.length} processos exportados`);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setEditing(null);
      form.reset({ numero_processo: "", objeto: "" });
    }
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    if (!checked) return setSelected(new Set());
    setSelected(new Set((processos ?? []).map((p: any) => p.id)));
  }

  if (isDetailRoute) return <Outlet />;

  const allVisibleSelected =
    (processos?.length ?? 0) > 0 &&
    (processos ?? []).every((p: any) => selected.has(p.id));
  const someVisibleSelected =
    (processos ?? []).some((p: any) => selected.has(p.id)) &&
    !allVisibleSelected;
  const hasFilters = Boolean(search || modalidadeFilter !== "__all");

  return (
    <AppShell
      title="Processos"
      subtitle="Cadastre e acompanhe processos administrativos"
      actions={
        <>
          {selected.size > 0 && (
            <>
              <PautaConsolidadaExporter 
                processoIds={Array.from(selected)} 
                variant="outline" 
                size="sm" 
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Excluir ({selected.size})
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={exportarCSV}
            disabled={!processos?.length}
          >
            <Download className="size-4" /> CSV
          </Button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl overflow-hidden p-0">
              <DialogHeader className="border-b border-slate-200 px-6 pb-4 pt-5 dark:border-slate-800">
                <DialogTitle>
                  {editing ? "Editar processo" : "Novo processo administrativo"}
                </DialogTitle>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Cadastre o processo-mãe. Os contratos serão vinculados a ele
                  na importação.
                </p>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto px-6 py-5">
                  {/* Identificação */}
                  <section className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Identificação
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
                      <div className="flex flex-col gap-1.5">
                        <Label>Nº do processo</Label>
                        <Input
                          {...form.register("numero_processo")}
                          placeholder="015/2025-PE"
                          className="font-mono"
                        />
                        <p className="text-[13px] text-slate-500 dark:text-slate-400">
                          Use o número completo com modalidade: PE, CE, DE, CR,
                          INE ou CH.
                        </p>
                        {form.formState.errors.numero_processo && (
                          <p className="text-[13px] text-destructive">
                            {form.formState.errors.numero_processo.message}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Modalidade</Label>
                        <div className="flex h-10 items-center rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                          {detectedProcesso?.modalidade ?? "Aguardando número"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Objeto *</Label>
                      <Textarea
                        rows={3}
                        {...form.register("objeto")}
                        placeholder="Descreva o objeto da contratação..."
                      />
                      {form.formState.errors.objeto && (
                        <p className="text-[13px] text-destructive">
                          {form.formState.errors.objeto.message}
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Complementos
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>Data de abertura</Label>
                        <Input
                          type="date"
                          {...form.register("data_abertura")}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Observações</Label>
                      <Textarea
                        rows={2}
                        {...form.register("observacoes")}
                        placeholder="Notas internas (opcional)"
                      />
                    </div>
                  </section>

                  <section className="flex flex-col gap-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Integração externa
                    </h3>
                    <div className="flex flex-col gap-1.5">
                      <Label>URL do processo no portal</Label>
                      <Input
                        {...form.register("m2a_url")}
                        placeholder="http://.../processo_administrativo/36002/"
                        className="font-mono text-[13px]"
                      />
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">
                        O ID do processo será extraído automaticamente da URL.
                      </p>
                      {form.formState.errors.m2a_url && (
                        <p className="text-[13px] text-destructive">
                          {form.formState.errors.m2a_url.message}
                        </p>
                      )}
                    </div>
                  </section>
                </div>
                <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-[#0B0F19]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting
                      ? "Salvando..."
                      : editing
                        ? "Salvar alterações"
                        : "Criar processo"}
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
            description: "Planilha e portal",
            to: "/importar-contratos",
            icon: FileUp,
            state: "done",
          },
          {
            label: "Processos",
            description: "Agrupador principal",
            to: "/processos",
            icon: FileText,
            state: "active",
          },
          {
            label: "Contratos",
            description: "Gerar e revisar",
            to: "/contratos",
            icon: FileSignature,
          },
          {
            label: "Enviar",
            description: "Automação do portal",
            to: "/contratos",
            icon: Send,
          },
        ]}
      />

      <Card className="mb-4 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(240px,1fr)_220px]">
            <div className="flex flex-col gap-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Número completo ou objeto"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Modalidade</Label>
              <Select
                value={modalidadeFilter}
                onValueChange={setModalidadeFilter}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {Object.entries(MODALIDADES).map(([codigo, label]) => (
                    <SelectItem key={codigo} value={codigo}>
                      {codigo} - {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleAllVisible(checked === true)
                  }
                  aria-label="Selecionar processos visíveis"
                />
              </TableHead>
              <TableHead className="w-[7.5rem] sm:w-40">Processo</TableHead>
              <TableHead>Objeto</TableHead>
              <TableHead className="hidden w-32 text-right sm:table-cell">
                Status
              </TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Skeleton className="h-5 w-20 ml-auto" />
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))}
            {!isLoading && (processos?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    icon={FileText}
                    title={
                      hasFilters
                        ? "Nenhum processo encontrado"
                        : "Nenhum processo cadastrado"
                    }
                    description={
                      hasFilters
                        ? "Ajuste a busca ou limpe os filtros para ver outros processos."
                        : "Crie o primeiro processo administrativo para agrupar atas, itens e contratos."
                    }
                    action={
                      hasFilters ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSearch("");
                            setModalidadeFilter("__all");
                          }}
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
                          Criar processo
                        </Button>
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            )}
            {processos?.map((p: any) => {
              const parsed = parseNumeroProcesso(p.numero_processo);
              const objetoResumo = resumirObjetoProcesso(p.objeto);
              return (
                <TableRow
                  key={p.id}
                  data-state={selected.has(p.id) ? "selected" : undefined}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() =>
                    navigate({ to: "/processos/$id", params: { id: p.id } })
                  }
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={(checked) =>
                        toggleSelected(p.id, checked === true)
                      }
                      aria-label={`Selecionar processo ${p.numero_processo ?? ""}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                      {p.numero_processo ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div className="line-clamp-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {objetoResumo}
                    </div>
                    <div className="mt-1 truncate text-[13px] text-slate-500 dark:text-slate-400">
                      {parsed?.modalidade ??
                        p.modalidade ??
                        "Modalidade não identificada"}
                    </div>
                    <Badge
                      variant={externalStatusVariant(p)}
                      className="mt-1 text-[10px] sm:hidden"
                    >
                      {formatExternalStatus(p)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Badge
                      variant={externalStatusVariant(p)}
                      className="text-[10px]"
                    >
                      {formatExternalStatus(p)}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/processos/$id" params={{ id: p.id }}>
                            <ArrowUpRight className="size-4 mr-2" /> Abrir
                            detalhes
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(p)}>
                          <Pencil className="size-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 className="size-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.numero_processo
                ? `Processo ${deleting.numero_processo}. `
                : ""}
              O registro será ocultado das listagens, mantendo o histórico para
              auditoria.
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processos selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} processo(s) serão ocultados das listagens. O
              histórico continuará preservado para auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>
              Excluir selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
