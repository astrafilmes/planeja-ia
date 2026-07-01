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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface ItemWarnDialogProps {
  open: boolean;
  dontShow: boolean;
  onDontShowChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ItemWarnDialog = memo(function ItemWarnDialog({
  open,
  dontShow,
  onDontShowChange,
  onCancel,
  onConfirm,
}: ItemWarnDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Atenção</AlertDialogTitle>
          <AlertDialogDescription>
            Esta alteração pode interferir na sincronização com a M2A. Deseja
            continuar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="warn-edit-item-dontshow"
            checked={dontShow}
            onCheckedChange={(v) => onDontShowChange(v === true)}
          />
          <Label
            htmlFor="warn-edit-item-dontshow"
            className="cursor-pointer text-sm font-normal"
          >
            Não mostrar este aviso novamente
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Continuar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
