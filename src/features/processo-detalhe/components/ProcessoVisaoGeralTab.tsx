import { Info, Settings2 } from "lucide-react";
import { FormSection } from "@/components/layout/FormSection";
import { SectionNav } from "@/components/layout/StickyActionBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRL, type Processo } from "../lib";

export interface ProcessoVisaoGeralTabProps {
  form: Partial<Processo>;
  processo: Processo;
  contratosCount: number;
  totalValor: number;
  sections: { id: string; label: string }[];
  activeSection: string;
  onChange: <K extends keyof Processo>(k: K, v: Processo[K]) => void;
}

export function ProcessoVisaoGeralTab({
  form,
  processo,
  contratosCount,
  totalValor,
  sections,
  activeSection,
  onChange,
}: ProcessoVisaoGeralTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <FormSection
        id="dados-administrativos"
        title="Dados administrativos"
        description="Identificação, modalidade e vínculo com o portal."
        icon={<Settings2 className="size-4" />}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Número do processo</Label>
            <Input
              className="font-mono"
              value={form.numero_processo ?? ""}
              onChange={(e) => onChange("numero_processo", e.target.value)}
              placeholder="015/2025-PE"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Modalidade</Label>
            <Input
              value={form.modalidade ?? ""}
              onChange={(e) => onChange("modalidade", e.target.value)}
              placeholder="Pregão Eletrônico"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Homologação do processo</Label>
            <Input
              type="date"
              value={form.data_abertura ?? ""}
              onChange={(e) => onChange("data_abertura", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>URL do processo no portal</Label>
            <Input
              value={form.m2a_url ?? ""}
              onChange={(e) => onChange("m2a_url", e.target.value)}
              placeholder="http://.../processo_administrativo/36002/"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              className="resize-none"
              value={form.observacoes ?? ""}
              onChange={(e) => onChange("observacoes", e.target.value)}
            />
          </div>
        </div>
      </FormSection>

      <div className="flex flex-col gap-4">
        <SectionNav
          sections={sections}
          activeId={activeSection}
          className="!block w-full lg:!block"
        />
        <FormSection
          id="metadados"
          title="Metadados"
          description="Sincronização e totais."
          icon={<Info className="size-4" />}
        >
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Última sincronização
              </p>
              <p className="text-xs">
                {processo.m2a_sync_at
                  ? new Date(processo.m2a_sync_at).toLocaleString("pt-BR")
                  : "Não sincronizado"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contratos
              </p>
              <p className="font-medium">{contratosCount}</p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Valor total
              </p>
              <p className="font-medium">{BRL.format(totalValor)}</p>
            </div>
          </div>
        </FormSection>
      </div>
    </div>
  );
}
