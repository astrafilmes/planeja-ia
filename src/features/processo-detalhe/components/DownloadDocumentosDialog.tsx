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

  // Lista fixa de tipos que o usuário sempre deve ver, replicando a interface individual
  const FIXED_TYPES = [
    "CONTRATO",
    "CONVOCAÇÃO",
    "EXTRATO",
    "DESPACHO",
    "RATIFICAÇÃO",
    "COMUNICAÇÃO INTERNA",
    "ADEQUAÇÃO ORÇAMENTÁRIA",
    "CERTIDÃO DE AFIXAÇÃO",
    "OUTROS"
  ];

  // Agrupa os documentos por esses tipos fixos
  const groupedDocs = useMemo(() => {
    const groups = new Map<string, { id_m2a: string; nome: string }[]>();
    
    // Inicializa os grupos fixos
    FIXED_TYPES.forEach(type => groups.set(type, []));

    selectedContracts.forEach(contrato => {
      const docs = getContratoDocumentos(contrato as any);
      docs.forEach(doc => {
        const nomeUpper = doc.nome.trim().toUpperCase();
        let matched = false;

        // Tenta encaixar nos tipos fixos (usando includes para maior abrangência)
        if (nomeUpper.includes("CONTRATO")) { groups.get("CONTRATO")?.push(doc); matched = true; }
        else if (nomeUpper.includes("CONVOCAÇÃO") || nomeUpper.includes("CONVOCACAO") || nomeUpper.includes("CONVOCA")) { groups.get("CONVOCAÇÃO")?.push(doc); matched = true; }
        else if (nomeUpper.includes("EXTRATO")) { groups.get("EXTRATO")?.push(doc); matched = true; }
        else if (nomeUpper.includes("DESPACHO")) { groups.get("DESPACHO")?.push(doc); matched = true; }
        else if (nomeUpper.includes("RATIFICAÇÃO") || nomeUpper.includes("RATIFICACAO")) { groups.get("RATIFICAÇÃO")?.push(doc); matched = true; }
        else if (nomeUpper.includes("COMUNICAÇÃO INTERNA") || nomeUpper.includes("COMUNICACAO INTERNA") || nomeUpper.includes("CI ")) { groups.get("COMUNICAÇÃO INTERNA")?.push(doc); matched = true; }
        else if (nomeUpper.includes("ADEQUAÇÃO") || nomeUpper.includes("ADEQUACAO") || nomeUpper.includes("ORÇAMENTÁRIA")) { groups.get("ADEQUAÇÃO ORÇAMENTÁRIA")?.push(doc); matched = true; }
        else if (nomeUpper.includes("CERTIDÃO") || nomeUpper.includes("AFIXAÇÃO") || nomeUpper.includes("AFIXACAO")) { groups.get("CERTIDÃO DE AFIXAÇÃO")?.push(doc); matched = true; }
        
        if (!matched) {
          groups.get("OUTROS")?.push(doc);
        }
      });
    });

    return Array.from(groups.entries());
  }, [selectedContracts]);

  const toggleType = (type: string) => {
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setSelectedTypes(next);
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedTypes(new Set(FIXED_TYPES));
    } else {
      setSelectedTypes(new Set());
    }
  };

  const allSelected = selectedTypes.size === FIXED_TYPES.length;
  const someSelected = selectedTypes.size > 0 && !allSelected;

  const handleConfirm = () => {
    const ids: string[] = [];
    groupedDocs.forEach(([type, docs]) => {
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
          <div className="flex items-center gap-2 mb-4 p-2 bg-muted/30 rounded-md border border-border/40">
            <Checkbox 
              id="select-all-types" 
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(checked) => toggleAll(checked === true)}
            />
            <Label htmlFor="select-all-types" className="text-sm font-semibold cursor-pointer">
              Selecionar todos os tipos
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Selecione quais tipos de documentos deseja baixar para os {selectedContracts.length} contrato(s) selecionado(s).{'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                            
                                            ok faca isso}
          </p>
          <div className="space-y-1">
            {groupedDocs.map(([type, docs]) => (
              <div 
                key={type} 
                className="flex items-center space-x-2 py-1.5 px-2 rounded-sm hover:bg-muted/50 transition-colors"
              >
                <Checkbox 
                  id={`doc-type-${type}`} 
                  checked={selectedTypes.has(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                <Label 
                  htmlFor={`doc-type-${type}`}
                  className="text-sm font-medium leading-none cursor-pointer flex-1 flex items-center justify-between"
                >
                  <span>{type}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">
                    {docs.length > 0 ? `${docs.length} arquivo(s)` : "Nenhum arquivo encontrado"}
                  </span>
                </Label>
              </div>
            ))}
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
