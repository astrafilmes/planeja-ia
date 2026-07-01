import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export interface IrpHeaderProps {
  children: ReactNode;
}

/**
 * Casca padronizada da rota IRP. Mantém o mesmo título/subtítulo do
 * layout original e apenas encapsula o AppShell — nenhum estado próprio.
 */
export function IrpHeader({ children }: IrpHeaderProps) {
  return (
    <AppShell
      title="Importação IRP"
      subtitle="Carregue a planilha consolidada e gere os arquivos por secretaria"
    >
      {children}
    </AppShell>
  );
}
