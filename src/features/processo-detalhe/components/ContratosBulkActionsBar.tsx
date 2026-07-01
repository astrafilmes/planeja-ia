import { Download, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

export interface ContratosBulkActionsBarProps {
  selectedCount: number;
  sending: boolean;
  connected: boolean;
  deletePending: boolean;
  onDownload: () => void;
  onOpenSend: () => void;
  onConfirmDelete: () => void;
}

export function ContratosBulkActionsBar({
  selectedCount,
  sending,
  connected,
  deletePending,
  onDownload,
  onOpenSend,
  onConfirmDelete,
}: ContratosBulkActionsBarProps) {
  if (selectedCount === 0) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={onDownload}>
        <Download className="size-4" /> Baixar convocação e contrato (
        {selectedCount})
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={deletePending}>
            <Trash2 className="size-4" /> Excluir ({selectedCount})
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedCount} contrato(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os contratos selecionados serão ocultados das listagens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button size="sm" onClick={onOpenSend} disabled={sending || !connected}>
        {sending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        Enviar
      </Button>
    </>
  );
}
