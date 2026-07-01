import { memo } from "react";
import { FormSection } from "@/components/layout/FormSection";
import { Progress } from "@/components/ui/progress";
import { Send, XCircle } from "lucide-react";
import { ETAPA_LABEL, type M2AProgressEvent } from "@/lib/m2a";

export interface EnvioM2ASectionProps {
  pct: number;
  logs: M2AProgressEvent[];
  ultimoErro: string | null;
  m2aUrl: string | null | undefined;
}

export const EnvioM2ASection = memo(function EnvioM2ASection({
  pct,
  logs,
  ultimoErro,
  m2aUrl,
}: EnvioM2ASectionProps) {
  return (
    <FormSection
      id="envio-extensao"
      title="Envio ao portal M2A"
      description="Acompanhamento da automação no portal."
      icon={<Send className="size-4" />}
      className="mb-3"
      action={
        m2aUrl ? (
          <a
            className="inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] text-primary hover:bg-primary/5"
            target="_blank"
            rel="noreferrer"
            href={m2aUrl}
          >
            Abrir portal
          </a>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        <Progress value={pct} className="h-1.5" />
        {logs.length > 0 && (
          <div className="flex max-h-52 flex-col gap-1 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-[11px] dark:bg-muted/30">
            {logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.sucesso === false || l.etapa === "erro"
                    ? "text-destructive"
                    : ""
                }
              >
                [{ETAPA_LABEL[l.etapa]}] {l.mensagem}
                {l.duracao_ms ? ` (${l.duracao_ms}ms)` : ""}
              </div>
            ))}
          </div>
        )}
        {ultimoErro && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[13px] text-destructive">
            <p className="mb-0.5 flex items-center gap-1 font-medium">
              <XCircle className="size-3" /> Último erro
            </p>
            <p className="break-all font-mono text-[11px]">{ultimoErro}</p>
          </div>
        )}
      </div>
    </FormSection>
  );
});
