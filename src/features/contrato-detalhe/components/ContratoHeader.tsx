import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { ContractReportGenerator } from "@/components/contratos/ContractReportGenerator";

export interface ContratoHeaderActionsProps {
  contratoId: string;
  enviando: boolean;
  connected: boolean;
  onEnviar: () => void;
}

/**
 * Ações do cabeçalho do contrato (renderizadas via <AppShell actions={...}/>).
 */
export const ContratoHeaderActions = memo(function ContratoHeaderActions({
  contratoId,
  enviando,
  connected,
  onEnviar,
}: ContratoHeaderActionsProps) {
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => window.history.back()}
      >
        <ArrowLeft className="size-4" /> Voltar
      </Button>
      <ContractReportGenerator contractIds={[contratoId]} />
      <Button size="sm" onClick={onEnviar} disabled={enviando || !connected}>
        {enviando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {enviando ? "Enviando..." : "Enviar ao portal"}
      </Button>
    </>
  );
});
