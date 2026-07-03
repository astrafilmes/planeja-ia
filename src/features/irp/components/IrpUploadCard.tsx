import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export interface IrpUploadCardProps {
  file: File | null;
  busy: boolean;
  progress: number;
  onFileChange: (file: File | null) => void;
  onAnalisar: () => void;
  eRegistroPreco: boolean;
  onERegistroPrecoChange: (v: boolean) => void;
}

export function IrpUploadCard({
  file,
  busy,
  progress,
  onFileChange,
  onAnalisar,
  eRegistroPreco,
  onERegistroPrecoChange,
}: IrpUploadCardProps) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4 text-primary" />
          Nova importação
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="irp-file-input">Arquivo .xlsx</Label>
          <Input
            id="irp-file-input"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          <p className="text-[11px] text-muted-foreground">
            .xls legados requerem backend Python — use .xlsx aqui.
          </p>
        </div>

        {file && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-[13px] dark:bg-muted/30">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-3.5 text-primary" />
              <span className="truncate font-medium">{file.name}</span>
            </div>
            <div className="mt-0.5 text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </div>
          </div>
        )}

        {/* Toggle SRP × comum — visível logo abaixo do arquivo, antes da análise. */}
        <div className="flex flex-col gap-1.5">
          <Label>Modalidade</Label>
          <div
            role="tablist"
            aria-label="Modalidade do processo"
            className="grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={eRegistroPreco}
              onClick={() => onERegistroPrecoChange(true)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                eRegistroPreco
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Registro de preços
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!eRegistroPreco}
              onClick={() => onERegistroPrecoChange(false)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                !eRegistroPreco
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Processo comum
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {eRegistroPreco
              ? "Vai gerar um processo SRP (ata + registro de preços)."
              : "Vai gerar um processo comum — uma DFD por coluna da planilha, mesmo que compartilhem a UO."}
          </p>
        </div>

        <Button
          type="button"
          onClick={onAnalisar}
          disabled={!file || busy}
          className="w-full"
        >
          {busy
            ? "Processando..."
            : `Analisar planilha (${eRegistroPreco ? "SRP" : "comum"})`}
        </Button>

        {progress > 0 && <Progress value={progress} />}
      </CardContent>
    </Card>
  );
}
