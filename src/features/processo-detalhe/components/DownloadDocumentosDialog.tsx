import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type ContratoRow, getContratoDocumentos } from "../lib";
import { Download } from "lucide-react";

export interface DownloadDocumentosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContracts: ContratoRow[];
  onConfirm: (documentos: string[]) => void;
}

export function DownloadDocumentosDialog({
  open,
  onOpenChange,
  selectedContracts,
  onConfirm,
}: DownloadDocumentosDialogProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Extrai todos os tipos de documentos únicos disponíveis nos contratos selecionados
  const availableDocs = useMemo(() => {
    const types = new Map<string, { id_m2a: string; nome: string }[]>();
    selectedContracts.forEach(contrato => {
      const docs = getContratoDocumentos(contrato);
      docs.forEach(doc => {
        const baseName = doc.nome.split(" - ")[0].trim().toUpperCase();
        const list = types.get(baseName) || [];
        list.push(doc);
        types.set(baseName, list);
      });
    });
    return Array.from(types.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedContracts]);

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setSelectedTypes(next);
  };

  const handleConfirm = () => {
    const ids: string[] = [];
    availableDocs.forEach(([type, docs]) => {
      if (selectedTypes.has(type)) {
        docs.forEach(d => ids.push(d.id_m2a));
      }
    });
    onConfirm(ids);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Baixar documentos</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Selecione quais tipos de documentos deseja baixar para os {selectedContracts.length} contrato(s) selecionado(s).
          </p>
          <div className="space-y-3">
            {availableDocs.map(([type, docs]) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox 
                  id={`doc-type-${type}`} 
                  checked={selectedTypes.has(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                <Label 
                  htmlFor={`doc-type-${type}`}
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {type}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({docs.length} arquivo(s))
                  </span>
                </Label>
              </div>
            ))}
            {availableDocs.length === 0 && (
              <p className="text-sm text-destructive">Nenhum documento disponível para os contratos selecionados.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            disabled={selectedTypes.size === 0} 
            onClick={handleConfirm}
          >
            <Download className="mr-2 h-4 w-4" />
            Baixar Selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
