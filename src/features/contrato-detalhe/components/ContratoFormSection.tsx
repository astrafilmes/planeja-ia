import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/layout/FormSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileSignature, Loader2, Save } from "lucide-react";
import type { M2AAtaOption } from "../lib";

export interface ContratoFormSectionProps {
  editNumeroContrato: string;
  setEditNumeroContrato: (v: string) => void;
  editData: string;
  setEditData: (v: string) => void;
  editDataFim: string;
  setEditDataFim: (v: string) => void;
  editAtaId: string;
  setEditAtaId: (v: string) => void;
  editPreposto: string;
  setEditPreposto: (v: string) => void;
  editFiscal: string;
  setEditFiscal: (v: string) => void;
  editObjeto: string;
  setEditObjeto: (v: string) => void;
  m2aAtas: M2AAtaOption[];
  salvando: boolean;
  onSalvar: () => void;
}

export const ContratoFormSection = memo(function ContratoFormSection({
  editNumeroContrato,
  setEditNumeroContrato,
  editData,
  setEditData,
  editDataFim,
  setEditDataFim,
  editAtaId,
  setEditAtaId,
  editPreposto,
  setEditPreposto,
  editFiscal,
  setEditFiscal,
  editObjeto,
  setEditObjeto,
  m2aAtas,
  salvando,
  onSalvar,
}: ContratoFormSectionProps) {
  return (
    <FormSection
      id="dados-contrato"
      title="Dados do contrato"
      description="Identificação, vínculos e configuração da automação."
      icon={<FileSignature className="size-4" />}
      className="mb-3"
    >
      <div className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>Nº contrato</Label>
          <Input
            value={editNumeroContrato}
            onChange={(e) => setEditNumeroContrato(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Início vigência</Label>
          <Input
            type="date"
            value={editData}
            onChange={(e) => {
              const v = e.target.value;
              setEditData(v);
              // Mantém o padrão de 12 meses enquanto o usuário não fixar
              // manualmente uma data fim diferente.
              if (v && (!editDataFim || editDataFim === defaultDataFim)) {
                setEditDataFim(getDataFimContrato(v));
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>Fim vigência</Label>
            {editData && editDataFim !== defaultDataFim && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setEditDataFim(getDataFimContrato(editData))}
              >
                usar 12 meses
              </button>
            )}
          </div>
          <Input
            type="date"
            value={editDataFim}
            min={editData || undefined}
            onChange={(e) => setEditDataFim(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Padrão: 12 meses após o início. Enviado à M2A ao publicar.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Ata</Label>
          <Select value={editAtaId} onValueChange={setEditAtaId}>
            <SelectTrigger className="min-w-0">
              <SelectValue placeholder="Selecione a ata" />
            </SelectTrigger>
            <SelectContent>
              {m2aAtas.map((ata) => (
                <SelectItem key={ata.m2a_ata_id} value={ata.m2a_ata_id}>
                  {ata.numero_ata ?? `Ata ${ata.m2a_ata_id}`}
                  {ata.fornecedor_nome ? ` · ${ata.fornecedor_nome}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Preposto</Label>
          <Input
            value={editPreposto}
            onChange={(e) => setEditPreposto(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Fiscal</Label>
          <Input
            value={editFiscal}
            onChange={(e) => setEditFiscal(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2 lg:col-span-3">
          <Label>Objeto</Label>
          <Textarea
            value={editObjeto}
            onChange={(e) => setEditObjeto(e.target.value)}
            rows={3}
          />
        </div>
        <div className="md:col-span-2 lg:col-span-3 flex justify-end">
          <Button size="sm" onClick={onSalvar} disabled={salvando}>
            {salvando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Salvar alterações
          </Button>
        </div>
      </div>
    </FormSection>
  );
});
