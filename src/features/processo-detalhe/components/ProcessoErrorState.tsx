import { AlertTriangle, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface ProcessoErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function ProcessoErrorState({ error, onRetry }: ProcessoErrorStateProps) {
  return (
    <AppShell title="Processo">
      <Card>
        <CardContent className="p-10">
          <EmptyState
            icon={AlertTriangle}
            title={error ? "Erro ao carregar processo" : "Processo não encontrado"}
            description={
              error
                ? (error as Error).message
                : "O registro pode ter sido removido ou arquivado."
            }
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
