import { AlertTriangle, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface IrpErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function IrpErrorState({ error, onRetry }: IrpErrorStateProps) {
  const message =
    error instanceof Error
      ? error.message
      : "Não foi possível carregar a importação IRP.";

  return (
    <AppShell
      title="Importação IRP"
      subtitle="Carregue a planilha consolidada e gere os arquivos por secretaria"
    >
      <Card className="border-border/60">
        <CardContent className="p-10">
          <EmptyState
            icon={AlertTriangle}
            title="Erro ao carregar IRP"
            description={message}
            action={
              <div className="flex items-center justify-center gap-2">
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
            }
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
