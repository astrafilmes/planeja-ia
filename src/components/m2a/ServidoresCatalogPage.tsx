import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, Trash2, UserCheck, X } from "lucide-react";
import { notify } from "@/lib/notify";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { supabase } from "@/integrations/supabase/client";
import {
  type M2ACargo,
  type M2AServidor,
  useServidores,
  useUnidadesGestoras,
} from "@/hooks/useM2ACatalog";
import { logAudit } from "@/lib/audit";

type ServidorForm = {
  id_local?: string;
  m2a_id: string;
  nome: string;
  cpf: string;
  unidade_ids: string[];
};

type ServidoresCatalogPageProps = {
  cargo: Extract<M2ACargo, "FISCAL" | "GESTOR">;
  title: string;
  subtitle: string;
  singularLabel: string;
};

function emptyServidor(): ServidorForm {
  return { m2a_id: "", nome: "", cpf: "", unidade_ids: [] };
}

export function ServidoresCatalogPage({
  cargo,
  title,
  subtitle,
  singularLabel,
}: ServidoresCatalogPageProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServidorForm>(emptyServidor());
  const [deleting, setDeleting] = useState<M2AServidor | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  const { data: servidores = [], isLoading } = useServidores(cargo);
  const { data: unidades = [] } = useUnidadesGestoras();

  const filteredServidores = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return servidores;
    return servidores.filter(
      (servidor) =>
        servidor.nome.toLowerCase().includes(q) ||
        servidor.m2a_id.toLowerCase().includes(q) ||
        servidor.cpf?.includes(q),
    );
  }, [search, servidores]);

  function openNew() {
    setEditing(emptyServidor());
    setOpen(true);
  }

  function openEdit(servidor: M2AServidor) {
    setEditing({
      id_local: servidor.id_local,
      m2a_id: servidor.m2a_id,
      nome: servidor.nome,
      cpf: servidor.cpf ?? "",
      unidade_ids: servidor.unidades_gestoras.map((unidade) => unidade.id_local),
    });
    setOpen(true);
  }

  async function save() {
    const m2aId = editing.m2a_id.trim();
    const nome = editing.nome.trim();
    const cpf = editing.cpf.trim() || null;

    if (!m2aId) return notify.error("Código externo é obrigatório.");
    if (!/^\d+$/.test(m2aId)) {
      return notify.error("Código externo deve conter apenas números.");
    }
    if (!nome) return notify.error("Nome é obrigatório.");
    if (editing.unidade_ids.length === 0) {
      return notify.error("Vincule ao menos uma unidade gestora.");
    }

    const servidorPayload = { m2a_id: m2aId, nome, cpf, cargo };
    const servidorResult = editing.id_local
      ? await supabase
          .from("m2a_servidores")
          .update(servidorPayload)
          .eq("id_local", editing.id_local)
          .select("id_local")
          .single()
      : await supabase
          .from("m2a_servidores")
          .insert(servidorPayload)
          .select("id_local")
          .single();

    if (servidorResult.error) return notify.error(servidorResult.error.message);

    const servidorId = servidorResult.data.id_local;
    const deleteLinks = await supabase
      .from("m2a_servidor_unidade")
      .delete()
      .eq("servidor_id", servidorId);
    if (deleteLinks.error) return notify.error(deleteLinks.error.message);

    const insertLinks = await supabase.from("m2a_servidor_unidade").insert(
      editing.unidade_ids.map((unidadeId) => ({
        servidor_id: servidorId,
        unidade_id: unidadeId,
      })),
    );
    if (insertLinks.error) return notify.error(insertLinks.error.message);

    notify.success(`${singularLabel} salvo com sucesso.`);
    setOpen(false);
    invalidateCatalog();
  }

  async function handleDelete() {
    if (!deleting) return;
    const target = deleting;

    const { error } = await supabase
      .from("m2a_servidores")
      .delete()
      .eq("id_local", target.id_local);
    if (error) return notify.error(error.message);

    await logAudit({
      action: "delete",
      entityType: `m2a_${cargo.toLowerCase()}`,
      entityId: target.m2a_id,
    });

    notify.success(`${singularLabel} removido.`);
    setDeleting(null);
    setSelected((current) => {
      const next = new Set(current);
      next.delete(target.id_local);
      return next;
    });
    invalidateCatalog();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from("m2a_servidores")
      .delete()
      .in("id_local", ids);
    if (error) return notify.error(error.message);

    await Promise.all(
      ids.map((id) =>
        logAudit({
          action: "delete",
          entityType: `m2a_${cargo.toLowerCase()}`,
          entityId: id,
        }),
      ),
    );

    notify.success(`${ids.length} registro(s) removido(s).`);
    setSelected(new Set());
    setBulkOpen(false);
    invalidateCatalog();
  }

  function invalidateCatalog() {
    qc.invalidateQueries({ queryKey: ["m2a-servidores"] });
    qc.invalidateQueries({ queryKey: ["m2a-unidades-gestoras"] });
  }

  const columns: DataTableColumn<M2AServidor>[] = [
    {
      id: "nome",
      header: "Nome",
      sortable: true,
      sortAccessor: (r) => r.nome,
      cell: (r) => <span className="font-medium">{r.nome}</span>,
    },
    {
      id: "codigo",
      header: "Código externo",
      width: "w-32",
      sortable: true,
      sortAccessor: (r) => r.m2a_id,
      cell: (r) => <span className="font-mono text-xs">{r.m2a_id}</span>,
    },
    {
      id: "unidades",
      header: "Unidades Gestoras",
      cell: (r) => (
        <span className="block max-w-md truncate text-[13px] text-muted-foreground">
          {r.unidades_gestoras.map((unidade) => unidade.nome).join(", ")}
        </span>
      ),
    },
  ];

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => setBulkOpen(true)}>
              <Trash2 className="size-4" /> Excluir ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" /> Novo
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, código ou CPF..."
            className="h-9 pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <DataTable<M2AServidor>
        data={filteredServidores}
        columns={columns}
        getRowId={(r) => r.id_local}
        isLoading={isLoading}
        pagination={{ pageSize: 25 }}
        selection={{
          selected,
          onChange: setSelected,
          getRowAriaLabel: (r) => `Selecionar ${r.nome}`,
        }}
        emptyState={
          <EmptyState
            icon={UserCheck}
            title="Nenhum registro encontrado"
            description="Ajuste a busca ou cadastre um novo responsável."
          />
        }
        rowActions={(servidor) => (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => openEdit(servidor)}
              aria-label={`Editar ${servidor.nome}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-destructive hover:text-destructive"
              onClick={() => setDeleting(servidor)}
              aria-label={`Excluir ${servidor.nome}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing.id_local ? "Editar" : "Novo"} {singularLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-2 pr-1">
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <div className="flex flex-col gap-1.5">
                <Label>Nome Completo *</Label>
                <Input
                  value={editing.nome}
                  onChange={(event) =>
                    setEditing({ ...editing, nome: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Código externo *</Label>
                <Input
                  inputMode="numeric"
                  value={editing.m2a_id}
                  onChange={(event) =>
                    setEditing({ ...editing, m2a_id: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>CPF (opcional)</Label>
              <Input
                value={editing.cpf}
                onChange={(event) =>
                  setEditing({ ...editing, cpf: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Unidades Gestoras Vinculadas</Label>
              <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30 md:grid-cols-2">
                {unidades.map((unidade) => (
                  <label
                    key={unidade.id_local}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/85 transition-colors hover:bg-muted/40 dark:hover:bg-foreground"
                  >
                    <Checkbox
                      checked={editing.unidade_ids.includes(unidade.id_local)}
                      onCheckedChange={(checked) => {
                        const current = editing.unidade_ids;
                        const next = checked
                          ? [...current, unidade.id_local]
                          : current.filter((id) => id !== unidade.id_local);
                        setEditing({ ...editing, unidade_ids: next });
                      }}
                    />
                    <span className="min-w-0 truncate">{unidade.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {singularLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.nome}" será removido do catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registros selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} registro(s) serão removidos do catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>
              Remover selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
