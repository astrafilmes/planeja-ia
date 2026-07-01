import { memo } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * Formulário unificado: seleciona/cria o processo administrativo já no upload
 * da planilha e libera a submissão apenas quando a identidade do processo
 * estiver completa (existente com m2a_processo_id, ou novo com todos os campos).
 */
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

  const novoCodigoOk = !!extractM2AProcessoId(novo.codigoM2A) || /^\d+$/.test(novo.codigoM2A.trim());
  const novoReady =
    novoCodigoOk &&
    !!novo.numeroProcesso.trim() &&
    !!novo.objeto.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(novo.dataAbertura);

  const canSubmit =
    !!file && !busy && (mode === "existing" ? existingReady : novoReady);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4" /> Nova importação
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Toggle de modo */}
        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "existing"}
            onClick={() => onModeChange("existing")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "existing"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Processo existente
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "new"}
            onClick={() => onModeChange("new")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "new"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Novo processo
          </button>
        </div>

        {/* Modo A — Processo existente */}
        {mode === "existing" && (
          <div className="flex flex-col gap-1.5">
            <Label>Selecionar processo</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              value={existingProcessoId}
              onChange={(e) => onExistingProcessoIdChange(e.target.value)}
            >
              <option value="">— Selecione —</option>
              {processos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero_processo ?? "(sem nº)"} · {p.objeto?.slice(0, 50)}
                  {p.m2a_processo_id ? ` · #${p.m2a_processo_id}` : ""}
                </option>
              ))}
            </select>
            {processoSelecionado && !processoSelecionado.m2a_processo_id && (
              <p className="text-[13px] text-destructive">
                Este processo não tem código M2A cadastrado. Edite-o em
                /processos antes de importar.
              </p>
            )}
            {existingReady && (
              <p className="text-[12px] text-muted-foreground">
                Nº, objeto e código M2A serão reaproveitados. A sincronização
                será incremental — só reprocessa se houver ata nova.
              </p>
            )}
          </div>
        )}

        {/* Modo B — Novo processo */}
        {mode === "new" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Código do processo M2A *</Label>
              <Input
                value={novo.codigoM2A}
                onChange={(e) => onNovoChange({ codigoM2A: e.target.value })}
                placeholder="Ex.: 34291"
              />
              <p className="text-[12px] text-muted-foreground">
                Pode colar apenas o número ou a URL completa do portal.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Nº do processo *</Label>
                <Input
                  value={novo.numeroProcesso}
                  onChange={(e) =>
                    onNovoChange({ numeroProcesso: e.target.value })
                  }
                  placeholder="026/2025"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Data base *</Label>
                <Input
                  type="date"
                  value={novo.dataAbertura}
                  onChange={(e) =>
                    onNovoChange({ dataAbertura: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Objeto *</Label>
              <Textarea
                rows={2}
                value={novo.objeto}
                onChange={(e) => onNovoChange({ objeto: e.target.value })}
                placeholder="Ex.: Aquisição de material de expediente..."
              />
            </div>
          </>
        )}

        {/* Arquivo */}
        <div className="flex flex-col gap-1.5">
          <Label>Planilha (.xlsx)</Label>
          <Input
            type="file"
            accept=".xlsx"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div className="mt-1.5 truncate text-[13px] text-muted-foreground">
              {file.name}
            </div>
          )}
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
          )}{" "}
          Analisar e importar
        </Button>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          A planilha vai para uma área de revisão. Nada é enviado ao sistema de
          contratos até você clicar em <strong>Autorizar geração</strong>.
        </p>
      </CardContent>
    </Card>
  );
});
