import { createFileRoute } from"@tanstack/react-router";
import { routeHead } from"@/lib/utils/route-head";
import { useMemo, useState } from"react";
import { useQuery, useQueryClient } from"@tanstack/react-query";
import { AppShell } from"@/components/layout/AppShell";
import { EmptyState } from"@/components/layout/EmptyState";
import { supabase } from"@/integrations/supabase/client";
import { normalizeText } from"@/lib/utils/normalize";
import { logAudit } from"@/lib/audit";
import { toast } from"sonner";
import { Button } from"@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from"@/components/ui/card";
import { Checkbox } from"@/components/ui/checkbox";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from"@/components/ui/alert-dialog";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from"@/components/ui/table";
import { HandCoins, Search, Plus, Save, Trash2 } from"lucide-react";

export const Route = createFileRoute("/fornecedores")({
 component: Page,
 head: () =>
 routeHead({
 path:"/fornecedores",
 title:"Fornecedores",
 description:"Cadastro de fornecedores, com dados de contato e vínculos com atas e contratos.",
 }),
});

type FornecedorRow = {
 id?: string;
 fornecedor_nome: string;
 fornecedor_nome_norm: string;
 fornecedor_cnpj: string | null;
 preposto_nome: string;
 ativo: boolean;
};

function buildNomeNorm(value: string) {
 return normalizeText(value).replace(/\s+/g,"").trim();
}

function emptyRow(): FornecedorRow {
 return {
 fornecedor_nome:"",
 fornecedor_nome_norm:"",
 fornecedor_cnpj: null,
 preposto_nome:"",
 ativo: true,
 };
}

function Page() {
 const qc = useQueryClient();
 const [search, setSearch] = useState("");
 const [editing, setEditing] = useState<FornecedorRow>(emptyRow());
 const [deleting, setDeleting] = useState<FornecedorRow | null>(null);
 const [bulkOpen, setBulkOpen] = useState(false);
 const [selected, setSelected] = useState<Set<string>>(() => new Set());

 const { data: rows = [], isLoading } = useQuery({
 queryKey: ["fornecedores-prepostos"],
 queryFn: async () => {
 const { data, error } = await supabase
 .from("fornecedores_prepostos")
 .select("*")
 .order("fornecedor_nome");
 if (error) throw error;
 return data as FornecedorRow[];
 },
 });

 const filtered = useMemo(() => {
 const q = buildNomeNorm(search);
 if (!q) return rows;
 return rows.filter((row) =>
 buildNomeNorm(
 [row.fornecedor_nome, row.preposto_nome, row.fornecedor_cnpj]
 .filter(Boolean)
 .join(""),
 ).includes(q),
 );
 }, [rows, search]);

 const allVisibleSelected =
 filtered.length > 0 &&
 filtered.every((row) => row.id && selected.has(row.id));
 const someVisibleSelected =
 filtered.some((row) => row.id && selected.has(row.id)) &&
 !allVisibleSelected;

 async function saveCurrent() {
 const fornecedorNome = editing.fornecedor_nome.trim();
 const prepostoNome = editing.preposto_nome.trim();
 const fornecedorNomeNorm =
 buildNomeNorm(fornecedorNome) || editing.fornecedor_nome_norm;

 if (!fornecedorNome || !prepostoNome || !fornecedorNomeNorm) {
 return toast.error("Fornecedor e preposto são obrigatórios.");
 }

 const payload = {
 fornecedor_nome: fornecedorNome,
 fornecedor_nome_norm: fornecedorNomeNorm,
 fornecedor_cnpj: editing.fornecedor_cnpj?.trim() || null,
 preposto_nome: prepostoNome,
 ativo: editing.ativo,
 };

 const result = editing.id
 ? await supabase
 .from("fornecedores_prepostos")
 .update(payload)
 .eq("id", editing.id)
 : await supabase.from("fornecedores_prepostos").insert(payload);

 if (result.error) return toast.error(result.error.message);

 await logAudit({
 action: editing.id ?"update" :"insert",
 entityType:"fornecedor_preposto",
 entityId: editing.id ?? null,
 payload,
 });

 toast.success("Cadastro salvo.");
 setEditing(emptyRow());
 qc.invalidateQueries({ queryKey: ["fornecedores-prepostos"] });
 }

 async function removeRow(row: FornecedorRow) {
 if (!row.id) return;
 const { error } = await supabase
 .from("fornecedores_prepostos")
 .delete()
 .eq("id", row.id);
 if (error) return toast.error(error.message);

 await logAudit({
 action:"delete",
 entityType:"fornecedor_preposto",
 entityId: row.id,
 payload: {
 fornecedor_nome: row.fornecedor_nome,
 preposto_nome: row.preposto_nome,
 },
 });

 toast.success("Cadastro removido.");
 if (editing.id === row.id) setEditing(emptyRow());
 setDeleting(null);
 setSelected((current) => {
 const next = new Set(current);
 if (row.id) next.delete(row.id);
 return next;
 });
 qc.invalidateQueries({ queryKey: ["fornecedores-prepostos"] });
 }

 async function removeSelected() {
 const ids = Array.from(selected);
 if (ids.length === 0) return;
 const { error } = await supabase
 .from("fornecedores_prepostos")
 .delete()
 .in("id", ids);
 if (error) return toast.error(error.message);
 await Promise.all(
 ids.map((id) =>
 logAudit({
 action:"delete",
 entityType:"fornecedor_preposto",
 entityId: id,
 }),
 ),
 );
 toast.success(`${ids.length} cadastro(s) removido(s).`);
 if (editing.id && selected.has(editing.id)) setEditing(emptyRow());
 setSelected(new Set());
 setBulkOpen(false);
 qc.invalidateQueries({ queryKey: ["fornecedores-prepostos"] });
 }

 function toggleOne(id: string | undefined, checked: boolean) {
 if (!id) return;
 setSelected((current) => {
 const next = new Set(current);
 if (checked) next.add(id);
 else next.delete(id);
 return next;
 });
 }

 function toggleAll(checked: boolean) {
 if (!checked) return setSelected(new Set());
 setSelected(
 new Set(filtered.map((row) => row.id).filter(Boolean) as string[]),
 );
 }

 return (
 <AppShell
 title="Fornecedores"
 subtitle="Cadastro de fornecedor e preposto padrão para geração automática"
 actions={
 selected.size > 0 ? (
 <Button
 size="sm"
 variant="destructive"
 onClick={() => setBulkOpen(true)}
 >
 <Trash2 className="size-4" /> Excluir ({selected.size})
 </Button>
 ) : null
 }
 >
 <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
 <Card className="border-border/60">
 <CardHeader className="pb-3">
 <CardTitle>Novo vínculo</CardTitle>
 </CardHeader>
 <CardContent className="flex flex-col gap-3">
 <div className="flex flex-col gap-1.5">
 <Label>Fornecedor *</Label>
 <Input
 value={editing.fornecedor_nome}
 onChange={(event) =>
 setEditing((current) => ({
 ...current,
 fornecedor_nome: event.target.value,
 fornecedor_nome_norm: buildNomeNorm(event.target.value),
 }))
 }
 placeholder="FORTAL COMERCIO LTDA EPP"
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Preposto *</Label>
 <Input
 value={editing.preposto_nome}
 onChange={(event) =>
 setEditing((current) => ({
 ...current,
 preposto_nome: event.target.value,
 }))
 }
 placeholder="NOME DA PESSOA FÍSICA"
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>CNPJ (opcional)</Label>
 <Input
 value={editing.fornecedor_cnpj ??""}
 onChange={(event) =>
 setEditing((current) => ({
 ...current,
 fornecedor_cnpj: event.target.value,
 }))
 }
 placeholder="00.000.000/0001-00"
 />
 </div>
 <div className="flex gap-2 pt-1">
 <Button className="flex-1" onClick={saveCurrent}>
 {editing.id ? (
 <>
 <Save className="size-4" /> Salvar
 </>
 ) : (
 <>
 <Plus className="size-4" /> Adicionar
 </>
 )}
 </Button>
 {editing.id && (
 <Button
 variant="outline"
 onClick={() => setEditing(emptyRow())}
 className="px-4"
 >
 Limpar
 </Button>
 )}
 </div>
 </CardContent>
 </Card>

 <Card className="overflow-hidden border-border/60">
 <CardHeader className="pb-3">
 <div className="flex items-center gap-2">
 <Search className="size-4 text-muted-foreground" />
 <Input
 value={search}
 onChange={(event) => setSearch(event.target.value)}
 className="h-9"
 placeholder="Buscar fornecedor, preposto ou CNPJ..."
 />
 </div>
 </CardHeader>
 <CardContent className="p-0">
 <div>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead className="w-12">
 <Checkbox
 checked={
 allVisibleSelected
 ? true
 : someVisibleSelected
 ?"indeterminate"
 : false
 }
 onCheckedChange={(checked) =>
 toggleAll(checked === true)
 }
 aria-label="Selecionar fornecedores"
 />
 </TableHead>
 <TableHead>Fornecedor</TableHead>
 <TableHead className="hidden sm:table-cell">
 Preposto
 </TableHead>
 <TableHead className="hidden md:table-cell">CNPJ</TableHead>
 <TableHead className="w-32 text-right">Ações</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {isLoading && (
 <TableRow>
 <TableCell
 colSpan={5}
 className="py-8 text-center text-[13px] text-muted-foreground"
 >
 Carregando...
 </TableCell>
 </TableRow>
 )}
 {!isLoading &&
 filtered.map((row) => (
 <TableRow
 key={row.id}
 data-state={
 row.id && selected.has(row.id)
 ?"selected"
 : undefined
 }
 >
 <TableCell>
 <Checkbox
 checked={row.id ? selected.has(row.id) : false}
 onCheckedChange={(checked) =>
 toggleOne(row.id, checked === true)
 }
 aria-label={`Selecionar ${row.fornecedor_nome}`}
 />
 </TableCell>
 <TableCell className="font-medium">
 <div className="truncate">{row.fornecedor_nome}</div>
 <div className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground sm:hidden">
 {row.preposto_nome ||"Sem preposto"}
 </div>
 <div className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground md:hidden">
 {row.fornecedor_cnpj ??"Sem CNPJ"}
 </div>
 </TableCell>
 <TableCell className="hidden sm:table-cell">
 {row.preposto_nome}
 </TableCell>
 <TableCell className="hidden md:table-cell">
 {row.fornecedor_cnpj ??"—"}
 </TableCell>
 <TableCell className="text-right">
 <div className="flex justify-end gap-1">
 <Button
 size="sm"
 variant="ghost"
 className="shrink-0"
 onClick={() => setEditing(row)}
 >
 Editar
 </Button>
 <Button
 size="icon"
 variant="ghost"
 className="shrink-0 text-destructive hover:text-destructive"
 onClick={() => setDeleting(row)}
 >
 <Trash2 className="size-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 {!isLoading && filtered.length === 0 && (
 <TableRow>
 <TableCell colSpan={5}>
 <EmptyState
 icon={HandCoins}
 title="Nenhum fornecedor encontrado"
 description="Ajuste a busca ou cadastre um novo fornecedor e preposto."
 />
 </TableCell>
 </TableRow>
 )}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>
 </div>

 <AlertDialog
 open={!!deleting}
 onOpenChange={(open) => !open && setDeleting(null)}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
 <AlertDialogDescription>
 {deleting?.fornecedor_nome} será removido da lista de prepostos.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={() => deleting && removeRow(deleting)}>
 Excluir
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 Excluir fornecedores selecionados?
 </AlertDialogTitle>
 <AlertDialogDescription>
 {selected.size} cadastro(s) serão removidos da lista de prepostos.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={removeSelected}>
 Excluir selecionados
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </AppShell>
 );
}
