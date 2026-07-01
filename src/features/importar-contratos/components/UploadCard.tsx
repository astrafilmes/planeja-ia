import { memo } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractM2AProcessoId } from "@/lib/m2a";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  m2aProcessoUrl: string;
  onM2aProcessoUrlChange: (url: string) => void;
  busy: boolean;
  onSubmit: () => void;
};

/**
 * Formulário lateral de nova importação: seleção de planilha + link do processo M2A.
 * Botão fica desabilitado enquanto arquivo ou URL não são válidos.
 */
export const UploadCard = memo(function UploadCard({
  file,
  onFileChange,
  m2aProcessoUrl,
  onM2aProcessoUrlChange,
  busy,
  onSubmit,
}: Props) {
  const canSubmit = !!file && !busy && !!extractM2AProcessoId(m2aProcessoUrl);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-4" /> Nova importação
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
        <div className="flex flex-col gap-1.5">
          <Label>Link do processo no portal *</Label>
          <Input
            value={m2aProcessoUrl}
            onChange={(event) => onM2aProcessoUrlChange(event.target.value)}
            placeholder="http://precodereferencia.m2atecnologia.com.br/processo_administrativo/34291/"
          />
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Ao importar, o sistema varre todas as atas, itens e contratos
            existentes desse processo para separar os contratos pela ata
            correta.
          </p>
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
