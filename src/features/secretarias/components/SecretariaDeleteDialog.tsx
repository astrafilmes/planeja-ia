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
import type { Sec } from "../lib";

export type SecretariaDeleteDialogProps = {
  item: Sec | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function SecretariaDeleteDialogImpl({
  item,
  isDeleting,
  onConfirm,
  onCancel,
}: SecretariaDeleteDialogProps) {
  return (
    <AlertDialog
      open={!!item}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover secretaria/dotação?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{item?.nome}&rdquo; será removida do cadastro. Essa ação não
            altera contratos já criados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Removendo…" : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const SecretariaDeleteDialog = memo(SecretariaDeleteDialogImpl);
