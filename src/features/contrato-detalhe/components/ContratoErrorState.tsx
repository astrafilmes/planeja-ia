import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export interface ContratoErrorStateProps {
  error: Error | null;
  onRetry: () => void;
}

export function ContratoErrorState({ error, onRetry }: ContratoErrorStateProps) {
  return (
    <AppShell title="Contrato">
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            {error ? "Erro ao carregar contrato" : "Contrato não encontrado"}
          </p>
          {error && (
            <p className="mx-auto max-w-md break-all font-mono text-[13px] text-muted-foreground">
              {error.message}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="size-4" /> Voltar
            </Button>
            <Button size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
