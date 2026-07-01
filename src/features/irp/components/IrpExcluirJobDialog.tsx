import { memo } from "react";
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

export interface IrpExcluirJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string | null;
  onConfirm: () => void;
}

/**
 * Diálogo standalone para exclusão de uma importação IRP.
 * A sidebar já traz um AlertDialog inline; este componente é fornecido para
 * fluxos externos (ex.: botão global) reutilizarem a mesma UX.
 */
export const IrpExcluirJobDialog = memo(function IrpExcluirJobDialog({
  open,
  onOpenChange,
  filename,
  onConfirm,
}: IrpExcluirJobDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
          <AlertDialogDescription>
            "{filename ?? "importação"}" será removida do histórico. Arquivos
            já gerados nas secretarias não serão afetados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
