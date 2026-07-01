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
import { Loader2, Trash2 } from "lucide-react";
import type { ItemRow } from "../lib";

export interface ItemDeleteDialogProps {
  item: ItemRow | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ItemDeleteDialog = memo(function ItemDeleteDialog({
  item,
  saving,
  onCancel,
  onConfirm,
}: ItemDeleteDialogProps) {
  return (
    <AlertDialog open={!!item} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir item</AlertDialogTitle>
          <AlertDialogDescription>
            {item
              ? `"${item.descricao}" será removido deste contrato. Esta ação não pode ser desfeita.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} onClick={onCancel}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={saving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
