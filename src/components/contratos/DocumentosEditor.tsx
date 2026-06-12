import { useMemo, useState } from"react";
import { supabase } from"@/integrations/supabase/client";
import { Button } from"@/components/ui/button";
import { EmptyState } from"@/components/layout/EmptyState";
import { Badge } from"@/components/ui/badge";
import { Checkbox } from"@/components/ui/checkbox";
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
import { Archive, Download, FileText, Trash2 } from"lucide-react";
import { toast } from"sonner";
import { logAudit } from"@/lib/audit";
import {
 type M2ABulkDownloadDocumento,
 type M2ADocumentoGerado,
} from"@/lib/m2a";
import { downloadM2ADocuments } from"@/lib/m2a-documents";
import { useProgress } from"@/contexts/ProgressContext";
import JSZip from"jszip";
import * as FileSaver from"file-saver";

const saveAs =
 (FileSaver as any).saveAs ??
 (FileSaver as any).default?.saveAs ??
 (FileSaver as any).default;

type Doc = {
 id: string;
 contrato_id: string;
 nome: string;
 tipo: string;
 storage_path: string;
 mime_type: string | null;
 size_bytes: number | null;
};

type DocumentoLista =
 | {
 key: string;
 origem:"m2a";
 nome: string;
 tipo: string;
 detalhe: string;
 m2a: M2ADocumentoGerado;
 }
 | {
 key: string;
 origem:"local";
 nome: string;
 tipo: string;
 detalhe: string;
 local: Doc;
 };

export function DocumentosEditor({
 contratoId,
 contratoNumero,
 m2aContratoId,
 documentos,
 documentosM2A,
 onChange,
}: {
 contratoId: string;
 contratoNumero?: string;
 m2aContratoId?: string | null;
 documentos: Doc[];
 documentosM2A?: unknown;
 onChange: () => void;
}) {
 const [selected, setSelected] = useState<Set<string>>(() => new Set());
 const [downloadingZip, setDownloadingZip] = useState(false);
 const { startTask, updateProgress, finishTask, failTask } = useProgress();

 // Progresso do download em lote agora é reportado diretamente pelo helper
 // downloadM2ADocuments (sem listener global da extensão Chrome).

 const docsM2A = useMemo(() => {
 if (!Array.isArray(documentosM2A)) return [];
 return (documentosM2A as any[])
 .map((item, index) => {
 if (!item || typeof item !=="object") return null;
 const doc = item as { id_m2a?: unknown; id?: unknown; nome?: unknown };
 const id_m2a = String(doc.id_m2a ?? doc.id ??"").trim();
 if (!/^\d+$/.test(id_m2a)) return null;
 const nomeDoc = String(doc.nome ?? `Documento ${index + 1}`).trim();
          return {
            key: `m2a:${id_m2a}`,
            origem:"m2a" as const,
            nome: nomeDoc,
            tipo:"Portal",
            detalhe:"Documento do portal",
            m2a: {
              id_m2a,
              nome: `${nomeDoc} - ${contratoNumero ?? contratoId}`,
              contratoId,
              contratoNumero,
              m2aContratoId: m2aContratoId ?? undefined,
            },
          };
 })
 .filter(Boolean) as DocumentoLista[];
 }, [contratoId, contratoNumero, m2aContratoId, documentosM2A]);

 const docsLocais = useMemo(
 () =>
 documentos.map(
 (d) =>
 ({
 key: `local:${d.id}`,
 origem:"local",
 nome: d.nome,
 tipo: d.tipo,
 detalhe: `${d.mime_type ??"Arquivo"}${d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` :""}`,
 local: d,
 }) as DocumentoLista,
 ),
 [documentos],
 );

 const todosDocumentos = useMemo(
 () => [...docsM2A, ...docsLocais],
 [docsM2A, docsLocais],
 );

 const selectedDocs = useMemo(
 () => todosDocumentos.filter((doc) => selected.has(doc.key)),
 [selected, todosDocumentos],
 );
 const allSelected =
 todosDocumentos.length > 0 &&
 todosDocumentos.every((doc) => selected.has(doc.key));
 const someSelected = selectedDocs.length > 0 && !allSelected;

 function downloadName(nome: string) {
 return appendContratoToFileName(nome, contratoNumero ?? contratoId);
 }

 async function baixar(d: Doc) {
 const { data, error } = await supabase.storage
 .from("contrato-documentos")
 .createSignedUrl(d.storage_path, 60);
 if (error || !data) return toast.error(error?.message ??"Falha");
 triggerUrlDownload(data.signedUrl, downloadName(d.nome));
 }

 async function baixarDocumento(doc: DocumentoLista) {
    if (doc.origem ==="m2a") {
 startTask("Baixando documento", `Preparando ${doc.nome}...`);
 try {
 await downloadM2ADocuments([doc.m2a], undefined, (e) => {
 if (e.mensagem && (e.status === "documento" || e.status === "iniciado")) {
 updateProgress(e.percent ?? 0, e.mensagem, { isIndeterminate: e.percent == null });
 }
 if (e.status ==="concluido") finishTask("Documento baixado.");
 if (e.status ==="erro") failTask(e.mensagem ??"Falha ao baixar");
 });
 } catch (err: any) {
 toast.error(err?.message ??"Falha ao baixar documento.");
 }
 return;
 }
 await baixar(doc.local);
 }

 async function baixarZip(docs: DocumentoLista[]) {
 if (!docs.length) {
 toast.error("Nenhum documento disponível para compactar.");
 return;
 }

 const m2a = docs
 .filter((doc) => doc.origem ==="m2a")
 .map((doc) => doc.m2a);
 const locais = docs.filter((doc) => doc.origem ==="local");
 const baseName = safeFileName(contratoNumero ?? contratoId);
 const zipName = `${baseName}-documentos.zip`;

 setDownloadingZip(true);
 try {
 if (!m2a.length) {
 startTask("Compactando documentos",
 `Preparando ${locais.length} arquivo(s)...`,
 );
 const zip = new JSZip();
 for (let index = 0; index < locais.length; index++) {
 const doc = locais[index];
 updateProgress(
 (index / Math.max(locais.length, 1)) * 100,
 `Baixando ${doc.nome} (${index + 1} de ${locais.length})...`,
 );
 const { data, error } = await supabase.storage
 .from("contrato-documentos")
 .createSignedUrl(doc.local.storage_path, 60);
 if (error || !data) throw error ?? new Error("Falha ao assinar URL");
 const response = await fetch(data.signedUrl);
 if (!response.ok) {
 throw new Error(`HTTP ${response.status} ao baixar ${doc.nome}`);
 }
 zip.file(
 safeFileName(downloadName(doc.nome || doc.local.storage_path)),
 await response.arrayBuffer(),
 );
 }
 const out = await zip.generateAsync({ type:"blob" });
 saveAs(out, zipName);
 finishTask(`${locais.length} documento(s) compactado(s).`);
 return;
 }

 const externos: M2ABulkDownloadDocumento[] = [...m2a];
 for (const doc of locais) {
 const { data, error } = await supabase.storage
 .from("contrato-documentos")
 .createSignedUrl(doc.local.storage_path, 60);
 if (error || !data) throw error ?? new Error("Falha ao assinar URL");
 externos.push({
 origem:"url",
 url: data.signedUrl,
 nome: downloadName(doc.nome || doc.local.storage_path),
 mimeType: doc.local.mime_type ?? undefined,
 });
 }

 startTask("Compactando documentos",
 `Compactando ${externos.length} arquivo(s) no servidor...`,
 );
 await downloadM2ADocuments(externos, { archive: true, filename: zipName }, (e) => {
 if (e.status ==="concluido") finishTask(`${e.total} documento(s) compactado(s).`);
 if (e.status ==="erro") failTask(e.mensagem ??"Falha ao gerar ZIP");
 });
 } catch (e: any) {
 failTask(e.message ??"Falha ao gerar ZIP");
 toast.error(e.message ??"Falha ao gerar ZIP");
 } finally {
 setDownloadingZip(false);
 }
 }

 async function excluir(d: Doc) {
 await supabase.storage.from("contrato-documentos").remove([d.storage_path]);
 const { error } = await supabase
 .from("contrato_documentos")
 .delete()
 .eq("id", d.id);
 if (error) return toast.error(error.message);
 await logAudit({
 action:"delete",
 entityType:"contrato_documento",
 entityId: d.id,
 });
 toast.success("Documento removido");
 setSelected((current) => {
 const next = new Set(current);
 next.delete(`local:${d.id}`);
 return next;
 });
 onChange();
 }

 function toggleSelected(key: string, checked: boolean) {
 setSelected((current) => {
 const next = new Set(current);
 if (checked) next.add(key);
 else next.delete(key);
 return next;
 });
 }

 function toggleAll(checked: boolean) {
 if (!checked) return setSelected(new Set());
 setSelected(new Set(todosDocumentos.map((doc) => doc.key)));
 }

 return (
 <div className="flex flex-col gap-4">
 <div className="overflow-hidden rounded-xl border border-border/60 bg-card dark:bg-foreground">
 <div className="flex flex-col gap-3 border-b border-border/60 px-3 py-3 md:flex-row md:items-center md:justify-between">
 <div className="flex items-center gap-2">
 <Checkbox
 checked={
 allSelected ? true : someSelected ?"indeterminate" : false
 }
 onCheckedChange={(checked) => toggleAll(checked === true)}
 disabled={todosDocumentos.length === 0}
 aria-label="Selecionar todos os documentos"
 />
 <div>
 <div className="text-sm font-semibold">
 Documentos do contrato
 </div>
 <div className="text-[13px] text-muted-foreground">
 {docsM2A.length} gerado(s) no portal · {docsLocais.length}{""}
 anexo(s) local(is)
 </div>
 </div>
 </div>
 <div className="flex flex-wrap items-center gap-2">
 {selectedDocs.length > 0 && (
 <Button
 size="sm"
 variant="outline"
 disabled={downloadingZip}
 onClick={() => baixarZip(selectedDocs)}
 >
 <Archive className="size-4" /> ZIP selecionados (
 {selectedDocs.length})
 </Button>
 )}
 <Button
 size="sm"
 variant="outline"
 disabled={todosDocumentos.length === 0 || downloadingZip}
 onClick={() => baixarZip(todosDocumentos)}
 >
 <Archive className="size-4" /> ZIP todos
 </Button>
 </div>
 </div>

 {todosDocumentos.length === 0 ? (
 <EmptyState
 icon={FileText}
 title="Nenhum documento disponível"
 description="Quando o portal gerar documentos ou anexos locais existirem, eles aparecerão aqui."
 />
 ) : (
 <div className="divide-y divide-slate-200 dark:divide-slate-800">
 {todosDocumentos.map((doc) => (
 <div
 key={doc.key}
 className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
 >
 <Checkbox
 checked={selected.has(doc.key)}
 onCheckedChange={(checked) =>
 toggleSelected(doc.key, checked === true)
 }
 aria-label={`Selecionar ${doc.nome}`}
 />
 <button
 type="button"
 className="min-w-0 text-left"
 onClick={() => baixarDocumento(doc)}
 title="Baixar documento"
 >
 <div className="flex min-w-0 items-center gap-2">
 <FileText className="size-4 shrink-0 text-muted-foreground" />
 <span className="truncate text-sm font-medium">
 {doc.nome}
 </span>
 <Badge
 variant={doc.origem ==="m2a" ?"secondary" :"outline"}
 className="shrink-0 text-[10px]"
 >
 {doc.tipo}
 </Badge>
 </div>
 <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
 {doc.detalhe}
 </div>
 </button>
 <div className="flex items-center gap-1">
 <Button
 size="icon"
 variant="ghost"
 className="size-8"
 title="Baixar"
 onClick={() => baixarDocumento(doc)}
 >
 <Download className="size-3.5" />
 </Button>
 {doc.origem ==="local" && (
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 size="icon"
 variant="ghost"
 className="size-8 text-destructive hover:text-destructive"
 title="Remover"
 >
 <Trash2 className="size-3.5" />
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>
 Remover documento?
 </AlertDialogTitle>
 <AlertDialogDescription>
 {doc.local.nome}. Esta ação não pode ser desfeita.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction onClick={() => excluir(doc.local)}>
 Remover
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {todosDocumentos.length > 0 && (
 <p className="text-[13px] text-muted-foreground">
 Clique no nome do documento para baixar individualmente. Use a seleção
 para baixar vários ou gerar pacote ZIP.
 </p>
 )}
 </div>
 );
}

function formatBytes(value: number) {
 if (value < 1024) return `${value} B`;
 if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
 return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function safeFileName(value: string) {
 return String(value ||"documento")
 .normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"")
 .replace(/[\\/:*?"<>|]+/g,"")
 .replace(/\s+/g," ")
 .trim()
 .slice(0, 140);
}

function appendContratoToFileName(nome: string, contrato: string) {
 const raw = String(nome ||"documento").trim();
 const numero = String(contrato ||"").trim();
 if (!numero) return raw;
 const dot = raw.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
 const base = (dot?.[1] ?? raw).trim();
 const ext = dot?.[2] ??"";
 if (base.endsWith(` - ${numero}`)) return raw;
 return `${base} - ${numero}${ext}`;
}

function triggerUrlDownload(url: string, filename: string) {
 const a = document.createElement("a");
 a.href = url;
 a.download = safeFileName(filename);
 a.target ="_blank";
 document.body.appendChild(a);
 a.click();
 a.remove();
}
