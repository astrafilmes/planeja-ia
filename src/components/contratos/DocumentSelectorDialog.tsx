import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Archive, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export type DocumentTypeOption = {
  id: string;
  label: string;
  position: number;
};

// Posições 1 a 6 são os tipos de documentos comuns no M2A
export const M2A_DOC_TYPES: DocumentTypeOption[] = [
  { id: "despacho_autorizacao", label: "DESPACHO DE AUTORIZAÇÃO", position: 1 },
  { id: "termo_referencia", label: "TERMO DE REFERÊNCIA", position: 2 },
  { id: "minuta_contrato", label: "MINUTA DO CONTRATO", position: 3 },
  { id: "convocacao", label: "CONVOCAÇÃO", position: 4 },
  { id: "contrato", label: "CONTRATO", position: 5 },
  { id: "publicacao", label: "PUBLICAÇÃO", position: 6 },
];

interface DocumentSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selectedTypes: DocumentTypeOption[]) => void;
  isDownloading?: boolean;
  selectedCount: number;
}

export function DocumentSelectorDialog({
  open,
  onOpenChange,
  onConfirm,
  isDownloading,
  selectedCount,
}: DocumentSelectorDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(M2A_DOC_TYPES.map((t) => t.id))
  );

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(M2A_DOC_TYPES.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const handleConfirm = () => {
    const selected = M2A_DOC_TYPES.filter((t) => selectedIds.has(t.id));
    onConfirm(selected);
  };

  const allChecked = selectedIds.size === M2A_DOC_TYPES.length;
  const someChecked = selectedIds.size > 0 && !allChecked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-primary" />
            Baixar arquivos de {selectedCount} contrato(s)
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Selecione quais tipos de arquivos deseja baixar de cada contrato selecionado. O sistema irá gerar um único arquivo ZIP.
          </p>

          <div className="rounded-md border border-border">
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
              <Checkbox
                id="select-all-types"
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={(v) => toggleAll(v === true)}
              />
              <label
                htmlFor="select-all-types"
                className="text-sm font-semibold cursor-pointer"
              >
                Selecionar todos os tipos
              </label>
            </div>

            <ScrollArea className="h-[200px]">
              <div className="divide-y divide-border">
                {M2A_DOC_TYPES.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`type-${type.id}`}
                        checked={selectedIds.has(type.id)}
                        onCheckedChange={(v) => toggleOne(type.id, v === true)}
                      />
                      <label
                        htmlFor={`type-${type.id}`}
                        className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                      >
                        <FileText className="size-4 text-muted-foreground" />
                        {type.label}
                      </label>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      M2A
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Archive className="mr-2 size-4" />
                Gerar ZIP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
