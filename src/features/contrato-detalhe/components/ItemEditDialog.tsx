import { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save } from "lucide-react";
import type { ItemEditForm, ItemRow } from "../lib";

export interface ItemEditDialogProps {
  item: ItemRow | null;
  form: ItemEditForm;
  onFormChange: (updater: (f: ItemEditForm) => ItemEditForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export const ItemEditDialog = memo(function ItemEditDialog({
  item,
  form,
  onFormChange,
  saving,
  onCancel,
  onSave,
}: ItemEditDialogProps) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar item</DialogTitle>
          <DialogDescription>
            Alterações afetam apenas este contrato. Sincronização posterior pode
            ser necessária.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-descricao">Descrição</Label>
            <Textarea
              id="edit-descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) =>
                onFormChange((f) => ({ ...f, descricao: e.target.value }))
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-unidade">Unidade</Label>
              <Input
                id="edit-unidade"
                value={form.unidade}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, unidade: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-qtd">Quantidade</Label>
              <Input
                id="edit-qtd"
                inputMode="decimal"
                value={form.quantidade}
                onChange={(e) =>
                  onFormChange((f) => ({ ...f, quantidade: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-vu">Valor unit.</Label>
              <Input
                id="edit-vu"
                inputMode="decimal"
                value={form.valor_unitario}
                onChange={(e) =>
                  onFormChange((f) => ({
                    ...f,
                    valor_unitario: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
