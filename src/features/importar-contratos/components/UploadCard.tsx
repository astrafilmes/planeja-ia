import { memo } from "react";
import { FileSpreadsheet, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractM2AProcessoId } from "@/lib/m2a";
import type { ProcessoMin } from "../lib";

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

export const UploadCard = memo(function UploadCard({
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
    <Card className="border-border/60">
      <CardContent className="flex flex-col gap-4 p-4">
        {/* Segmented toggle */}
        <div
          role="tablist"
          aria-label="Origem do processo"
          className="inline-flex w-full rounded-md border border-border bg-muted/40 p-0.5"
        >
          {[
            { id: "existing" as const, label: "Existente" },
            { id: "new" as const, label: "Novo" },
          ].map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onModeChange(opt.id)}
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {mode === "existing" ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Processo</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              value={existingProcessoId}
              onChange={(e) => onExistingProcessoIdChange(e.target.value)}
            >
              <option value="">Selecionar…</option>
              {processos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero_processo ?? "(sem nº)"} · {p.objeto?.slice(0, 50)}
                </option>
              ))}
            </select>
            {processoSelecionado && !processoSelecionado.m2a_processo_id && (
              <p className="text-[12px] text-destructive">
                Processo sem código M2A. Ajuste em /processos.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Código M2A</Label>
                <Input
                  value={novo.codigoM2A}
                  onChange={(e) => onNovoChange({ codigoM2A: e.target.value })}
                  placeholder="34291"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Nº do processo</Label>
                <Input
                  value={novo.numeroProcesso}
                  onChange={(e) =>
                    onNovoChange({ numeroProcesso: e.target.value })
                  }
                  placeholder="026/2025"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Data base</Label>
              <Input
                type="date"
                value={novo.dataAbertura}
                onChange={(e) => onNovoChange({ dataAbertura: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Objeto</Label>
              <Textarea
                rows={2}
                value={novo.objeto}
                onChange={(e) => onNovoChange({ objeto: e.target.value })}
                placeholder="Aquisição de…"
              />
            </div>
          </div>
        )}

        {/* Arquivo — botão discreto */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Planilha</Label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors hover:border-accent">
            <Paperclip className="size-4 text-muted-foreground" />
            <span className="truncate text-muted-foreground">
              {file ? file.name : "Selecionar arquivo…"}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <Button
          className="w-full"
          disabled={!canSubmit}
          onClick={onSubmit}
          size="sm"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-4" />
          )}
          Analisar
        </Button>
      </CardContent>
    </Card>
  );
});
