import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRL, type ContratoRow } from "../lib";

export interface FiscalOption {
  id_local: string;
  m2a_id: string;
  nome: string;
}

export interface EnviarM2ADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  m2aContratoData: string;
  onDataChange: (value: string) => void;
  m2aFiscalId: string;
  onFiscalChange: (value: string) => void;
  shouldAskFiscal: boolean;
  filteredFiscais: FiscalOption[];
  selectedContracts: ContratoRow[];
  selectedUnidadesCount: number;
  selectionStats: { count: number; total: number };
  sending: boolean;
  connected: boolean;
  onDiagnose: () => void;
  onConfirm: () => void;
}

export function EnviarM2ADialog({
  open,
  onOpenChange,
  m2aContratoData,
  onDataChange,
  m2aFiscalId,
  onFiscalChange,
  shouldAskFiscal,
  filteredFiscais,
  selectedContracts,
  selectedUnidadesCount,
  selectionStats,
  sending,
  connected,
  onDiagnose,
  onConfirm,
}: EnviarM2ADialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurar envio ao portal M2A</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-[1fr_240px]">
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-muted-foreground">
              Informe a data de assinatura. Em envio individual, você pode
              escolher o fiscal; em lote, fiscal, gestor, unidade gestora, itens
              e dotação serão carregados do cadastro da secretaria.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Data de assinatura *</Label>
                <Input
                  type="date"
                  value={m2aContratoData}
                  onChange={(event) => onDataChange(event.target.value)}
                />
              </div>
              {shouldAskFiscal ? (
                <div className="flex flex-col gap-2">
                  <Label>Fiscal do contrato *</Label>
                  <Select value={m2aFiscalId} onValueChange={onFiscalChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o Fiscal" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredFiscais.map((f) => (
                        <SelectItem
                          key={f.id_local}
                          value={f.m2a_id}
                          className="text-xs"
                        >
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filteredFiscais.length === 0 && (
                    <p className="text-[13px] text-red-600 dark:text-red-400">
                      Nenhum fiscal mapeado para a secretaria selecionada.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-[13px] text-muted-foreground">
                  Fiscal e gestor serão aplicados a partir do cadastro de cada
                  secretaria.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-[13px] text-muted-foreground">
              <div className="font-medium text-slate-800">Dados automáticos</div>
              <div className="mt-1">
                {selectedUnidadesCount || 0} unidade(s) gestora(s),{" "}
                {selectionStats.count} contrato(s) e{" "}
                {BRL.format(selectionStats.total)} serão enviados em sequência.
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Seleção
            </div>
            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto pr-1">
              {selectedContracts.slice(0, 8).map((contrato) => (
                <div
                  key={contrato.id}
                  className="rounded-lg border border-border/60 px-2 py-1.5 text-xs"
                >
                  <div className="font-mono font-medium">
                    {contrato.numero_contrato}
                  </div>
                  <div className="truncate text-[13px] text-muted-foreground">
                    {contrato.secretaria_sigla} · {contrato.itens.length}{" "}
                    item(ns)
                  </div>
                  <div className="mt-1 font-mono text-[12px] font-semibold text-foreground/85">
                    {BRL.format(contrato.valor_total)}
                  </div>
                </div>
              ))}
              {selectedContracts.length > 8 && (
                <div className="text-[13px] text-muted-foreground">
                  + {selectedContracts.length - 8} contrato(s)
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={onDiagnose}
            disabled={sending || !connected}
          >
            Diagnosticar M2A
          </Button>
          <Button onClick={onConfirm} disabled={sending || !connected}>
            Confirmar e Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
