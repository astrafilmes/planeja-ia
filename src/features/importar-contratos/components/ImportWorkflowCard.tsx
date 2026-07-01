import { memo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { extractM2AProcessoId } from "@/lib/m2a";
import type { ProcessoMin } from "../lib";
import { DragDropFileZone } from "./DragDropFileZone";

export type ImportMode = "existing" | "new";

export type NovoProcessoState = {
  codigoM2A: string;
  numeroProcesso: string;
  objeto: string;
  dataAbertura: string;
};

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  processos: ProcessoMin[];
  existingProcessoId: string;
  onExistingProcessoIdChange: (id: string) => void;
  novo: NovoProcessoState;
  onNovoChange: (patch: Partial<NovoProcessoState>) => void;
  busy: boolean;
  onSubmit: () => void;
};

export const ImportWorkflowCard = memo(function ImportWorkflowCard({
  file,
  onFileChange,
  mode,
  onModeChange,
  processos,
  existingProcessoId,
  onExistingProcessoIdChange,
  novo,
  onNovoChange,
  busy,
  onSubmit,
}: Props) {
  const processoSelecionado = processos.find(
    (p) => p.id === existingProcessoId,
  );
  const existingReady =
    !!processoSelecionado && !!processoSelecionado.m2a_processo_id;

  const novoCodigoOk =
    !!extractM2AProcessoId(novo.codigoM2A) ||
    /^\d+$/.test(novo.codigoM2A.trim());
  const novoReady =
    novoCodigoOk &&
    !!novo.numeroProcesso.trim() &&
    !!novo.objeto.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(novo.dataAbertura);

  const canSubmit =
    !!file && !busy && (mode === "existing" ? existingReady : novoReady);

  return (
    <Card variant="elevated" className="mx-auto w-full max-w-2xl">
      <CardContent className="flex flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">
            Nova importação
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Vincule a planilha ao processo correspondente.
          </p>
        </header>

        <Tabs
          value={mode}
          onValueChange={(v) => onModeChange(v as ImportMode)}
        >
          <TabsList>
            <TabsTrigger value="existing">Processo existente</TabsTrigger>
            <TabsTrigger value="new">Novo processo</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="mt-5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Processo
              </Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                value={existingProcessoId}
                onChange={(e) => onExistingProcessoIdChange(e.target.value)}
              >
                <option value="">Selecionar…</option>
                {processos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.numero_processo ?? "(sem nº)"} ·{" "}
                    {p.objeto?.slice(0, 60)}
                  </option>
                ))}
              </select>
              {processoSelecionado &&
                !processoSelecionado.m2a_processo_id && (
                  <p className="text-[12px] text-destructive">
                    Processo sem código M2A.
                  </p>
                )}
            </div>
          </TabsContent>

          <TabsContent value="new" className="mt-5">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Código M2A
                  </Label>
                  <Input
                    value={novo.codigoM2A}
                    onChange={(e) =>
                      onNovoChange({ codigoM2A: e.target.value })
                    }
                    placeholder="Ex: 34291"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Nº do processo
                  </Label>
                  <Input
                    value={novo.numeroProcesso}
                    onChange={(e) =>
                      onNovoChange({ numeroProcesso: e.target.value })
                    }
                    placeholder="Ex: 026/2025"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Data base
                </Label>
                <Input
                  type="date"
                  value={novo.dataAbertura}
                  onChange={(e) =>
                    onNovoChange({ dataAbertura: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Objeto
                </Label>
                <Textarea
                  rows={2}
                  value={novo.objeto}
                  onChange={(e) => onNovoChange({ objeto: e.target.value })}
                  placeholder="Aquisição de…"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Planilha
          </Label>
          <DragDropFileZone
            file={file}
            onFileChange={onFileChange}
            disabled={busy}
          />
        </div>

        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button disabled={!canSubmit} onClick={onSubmit} size="sm">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Analisar e importar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
