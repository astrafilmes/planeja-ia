import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, ChevronDown, Clock, Loader2, RefreshCw, Send, XCircle } from "lucide-react";
import { ContractReportGenerator } from "@/components/contratos/ContractReportGenerator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

export interface ContratoHeaderActionsProps {
  contratoId: string;
  enviando: boolean;
  connected: boolean;
  statusM2A: string;
  hasM2AContrato: boolean;
  sincronizando: boolean;
  onSincronizar: () => void;
  onEnviar: () => void;
  onStatusChanged?: () => void;
}

const STATUS_OPTIONS: Array<{
  value: "sucesso" | "erro" | "processando" | "pendente";
  label: string;
  Icon: typeof CheckCircle2;
}> = [
  { value: "sucesso", label: "Marcar como Enviado (sucesso)", Icon: CheckCircle2 },
  { value: "pendente", label: "Marcar como Pendente", Icon: Clock },
  { value: "processando", label: "Marcar como Processando", Icon: Loader2 },
  { value: "erro", label: "Marcar como Erro", Icon: XCircle },
];

/**
 * Ações do cabeçalho do contrato (renderizadas via <AppShell actions={...}/>).
 */
export const ContratoHeaderActions = memo(function ContratoHeaderActions({
  contratoId,
  enviando,
  connected,
  statusM2A,
  hasM2AContrato,
  sincronizando,
  onSincronizar,
  onEnviar,
  onStatusChanged,
}: ContratoHeaderActionsProps) {
  const [salvandoStatus, setSalvandoStatus] = useState(false);

  const alterarStatus = async (novo: "sucesso" | "erro" | "processando" | "pendente") => {
    if (novo === statusM2A) return;
    setSalvandoStatus(true);
    try {
      const patch: {
        status_envio_m2a: string;
        enviado_m2a_em?: string;
        ultimo_erro_m2a?: string | null;
      } = {
        status_envio_m2a: novo,
      };
      if (novo === "sucesso") {
        patch.enviado_m2a_em = new Date().toISOString();
        patch.ultimo_erro_m2a = null;
      } else if (novo === "pendente") {
        patch.ultimo_erro_m2a = null;
      }
      const { error } = await supabase
        .from("contratos")
        .update(patch)
        .eq("id", contratoId);
      if (error) throw error;
      notify.success(`Status alterado para "${novo}".`);
      onStatusChanged?.();
    } catch (e) {
      notify.error("Falha ao alterar status", {
        description: (e as Error).message,
      });
    } finally {
      setSalvandoStatus(false);
    }
  };

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={salvandoStatus}>
            {salvandoStatus ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Status <ChevronDown className="size-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            Alterar status manualmente
            <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
              Atual: {statusM2A}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuItem
              key={value}
              disabled={value === statusM2A}
              onSelect={() => void alterarStatus(value)}
            >
              <Icon className="size-3.5" /> {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
