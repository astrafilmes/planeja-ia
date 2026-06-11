import { useState } from"react";
import { supabase } from"@/integrations/supabase/client";
import { Button } from"@/components/ui/button";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import { Badge } from"@/components/ui/badge";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from"@/components/ui/select";
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
import { Trash2, Plus, Shield, UserCog, UserCheck } from"lucide-react";
import { toast } from"sonner";
import { logAudit } from"@/lib/audit";
import { formatCPF, isValidCPF, onlyDigits } from"@/lib/cpf";

type Ator = {
 id: string;
 contrato_id: string;
 tipo: string;
 nome: string;
 cpf: string | null;
 email: string | null;
 portaria: string | null;
};

const TIPOS = ["fiscal","fiscal_suplente","gestor","preposto","ordenador",
] as const;

export type DefaultServidor = {
 tipo:"fiscal" |"gestor" |"preposto";
 nome: string | null;
 cpf?: string | null;
 origem: string;
};

const TIPO_META: Record<
 string,
 { label: string; Icon: typeof Shield; cls: string }
> = {
 fiscal: {
 label:"Fiscal",
 Icon: Shield,
 cls:"bg-blue-500/10 text-blue-600 border-blue-500/30",
 },
 gestor: {
 label:"Gestor",
 Icon: UserCog,
 cls:"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 },
 preposto: {
 label:"Preposto",
 Icon: UserCheck,
 cls:"bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
 },
};

export function AtoresEditor({
 contratoId,
 atores,
 onChange,
 defaults = [],
}: {
 contratoId: string;
 atores: Ator[];
 onChange: () => void;
 defaults?: DefaultServidor[];
}) {
 const [form, setForm] = useState({
 tipo:"fiscal_suplente",
 nome:"",
 cpf:"",
 email:"",
 portaria:"",
 });
 const [saving, setSaving] = useState(false);
 const [showForm, setShowForm] = useState(false);

 async function adicionar() {
 if (!form.nome.trim()) return toast.error("Informe o nome");
 const cpfDigits = onlyDigits(form.cpf);
 if (cpfDigits && !isValidCPF(cpfDigits)) return toast.error("CPF inválido");
 setSaving(true);
 const { error } = await supabase.from("contrato_atores").insert({
 contrato_id: contratoId,
 tipo: form.tipo,
 nome: form.nome.trim(),
 cpf: cpfDigits || null,
 email: form.email.trim() || null,
 portaria: form.portaria.trim() || null,
 });
 setSaving(false);
 if (error) return toast.error(error.message);
 await logAudit({
 action:"create",
 entityType:"contrato_ator",
 entityId: contratoId,
 payload: form,
 });
 setForm({
 tipo:"fiscal_suplente",
 nome:"",
 cpf:"",
 email:"",
 portaria:"",
 });
 setShowForm(false);
 toast.success("Servidor adicionado");
 onChange();
 }

 async function excluir(id: string) {
 const { error } = await supabase
 .from("contrato_atores")
 .delete()
 .eq("id", id);
 if (error) return toast.error(error.message);
 await logAudit({
 action:"delete",
 entityType:"contrato_ator",
 entityId: id,
 });
 toast.success("Servidor removido");
 onChange();
 }

 return (
 <div className="flex flex-col gap-4">
 {/* Servidores padrão (automáticos) */}
 {defaults.length > 0 && (
 <div className="flex flex-col gap-2">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Servidores padrão
 </div>
 <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
 {defaults.map((d, i) => {
 const meta = TIPO_META[d.tipo];
 const Icon = meta.Icon;
 return (
 <div
 key={i}
 className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30"
 >
 <Badge
 variant="outline"
 className={`gap-1 text-[10px] ${meta.cls}`}
 >
 <Icon className="size-3" /> {meta.label}
 </Badge>
 <div
 className="text-sm font-medium leading-tight truncate"
 title={d.nome ??""}
 >
 {d.nome || (
 <span className="text-muted-foreground italic font-normal">
 não definido
 </span>
 )}
 </div>
 <div className="truncate text-[12px] text-muted-foreground">
 {d.cpf ? `${formatCPF(d.cpf)} · ` :""}
 {d.origem}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Servidores adicionais */}
 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
 Servidores adicionais ({atores.length})
 </div>
 {!showForm && (
 <Button
 size="sm"
 variant="outline"
 onClick={() => setShowForm(true)}
 >
 <Plus className="size-3.5" /> Adicionar servidor
 </Button>
 )}
 </div>

 {showForm && (
 <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
 <div className="grid gap-2 md:grid-cols-5">
 <div className="flex flex-col gap-1.5">
 <Label>Tipo</Label>
 <Select
 value={form.tipo}
 onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {TIPOS.map((t) => (
 <SelectItem key={t} value={t}>
 {t.replace("_","")}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Nome *</Label>
 <Input
 value={form.nome}
 onChange={(e) =>
 setForm((f) => ({ ...f, nome: e.target.value }))
 }
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>CPF</Label>
 <Input
 value={form.cpf}
 maxLength={14}
 placeholder="000.000.000-00"
 onChange={(e) =>
 setForm((f) => ({ ...f, cpf: formatCPF(e.target.value) }))
 }
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>E-mail</Label>
 <Input
 type="email"
 value={form.email}
 onChange={(e) =>
 setForm((f) => ({ ...f, email: e.target.value }))
 }
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <Label>Portaria</Label>
 <Input
 value={form.portaria}
 onChange={(e) =>
 setForm((f) => ({ ...f, portaria: e.target.value }))
 }
 />
 </div>
 </div>
 <div className="flex gap-2">
 <Button size="sm" onClick={adicionar} disabled={saving}>
 <Plus className="size-4" /> Adicionar
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => setShowForm(false)}
 >
 Cancelar
 </Button>
 </div>
 </div>
 )}

 {atores.length === 0 ? (
 <p className="text-[13px] italic text-muted-foreground">
 Nenhum servidor adicional. Os padrões acima já cobrem fiscal, gestor
 e preposto.
 </p>
 ) : (
 <div className="overflow-hidden rounded-xl border border-border/60">
 {atores.map((a) => (
 <div
 key={a.id}
 className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 "
 >
 <div className="min-w-0">
 <div className="text-sm">
 <b className="uppercase text-[10px] tracking-wider text-muted-foreground mr-2">
 {a.tipo.replace("_","")}
 </b>
 {a.nome}
 </div>
 <div className="text-[11px] text-muted-foreground truncate">
 {a.cpf ? formatCPF(a.cpf) :"—"} · {a.email ??"—"}{""}
 {a.portaria ? `· Port. ${a.portaria}` :""}
 </div>
 </div>
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 size="icon"
 variant="ghost"
 className="size-7 text-destructive hover:text-destructive"
 >
 <Trash2 className="size-3.5" />
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Remover servidor?</AlertDialogTitle>
 <AlertDialogDescription>
 {a.tipo} — {a.nome}
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={() => excluir(a.id)}>
 Remover
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
