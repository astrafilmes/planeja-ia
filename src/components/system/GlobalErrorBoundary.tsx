import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface GlobalErrorBoundaryProps {
  children: ReactNode;
  /**
   * Fallback opcional. Quando omitido, renderiza o fallback padrão minimalista
   * alinhado ao Design System da Fase 2.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface GlobalErrorBoundaryState {
  error: Error | null;
}

/**
 * Fronteira de erro global de renderização React.
 *
 * Captura exceções lançadas em qualquer descendente durante render, lifecycle
 * ou construtores de componentes filhos. Não intercepta:
 *   - Erros assíncronos (Promises, setTimeout) → tratados no Pilar 2 (QueryCache).
 *   - Erros em event handlers → devem chamar `notify.error` diretamente.
 *   - Erros em SSR (não usamos SSR nesta base).
 *
 * Deve envolver os providers críticos na raiz da aplicação para garantir que
 * uma falha em qualquer camada (auth, query, contexto M2A, roteamento) exiba
 * um fallback amigável em vez de tela em branco.
 */
export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  state: GlobalErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Telemetria estruturada — facilita agregação em ferramentas de observabilidade.
    console.error("[GlobalErrorBoundary] Uncaught render error", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    });

    // TODO(observability): plugar aqui integração futura com Sentry/Datadog/LogRocket.
    // Exemplo:
    //   Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
    //   datadogRum.addError(error, { componentStack: errorInfo.componentStack });
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/");
    }
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (fallback) return fallback(error, this.handleReset);

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-lg border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle
                className="size-6 text-destructive"
                aria-hidden="true"
              />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-foreground">
                Algo inesperado aconteceu
              </h1>
              <p className="text-sm text-muted-foreground">
                A aplicação encontrou um erro de renderização. Nossa equipe já
                foi notificada e você pode tentar novamente abaixo.
              </p>
            </div>

            {import.meta.env.DEV && (
              <pre className="max-h-40 w-full overflow-auto rounded-md border border-border/60 bg-muted/40 p-3 text-left font-mono text-[11px] leading-relaxed text-muted-foreground">
                {error.name}: {error.message}
              </pre>
            )}

            <div className="flex w-full flex-col-reverse items-center gap-2 pt-2 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto"
              >
                <Home className="size-4" aria-hidden="true" />
                Voltar ao início
              </Button>
              <Button
                size="sm"
                onClick={this.handleReload}
                className="w-full sm:w-auto"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Recarregar aplicação
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
