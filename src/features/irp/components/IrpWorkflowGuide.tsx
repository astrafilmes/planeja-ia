import { FileSignature, FileText, Send, Upload } from "lucide-react";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";

/**
 * Stepper fixo do fluxo IRP → Processos → Contratos → Envio.
 * Componente puramente apresentacional; não recebe props.
 */
export function IrpWorkflowGuide() {
  return (
    <WorkflowGuide
      title="Fluxo da importação"
      subtitle="Consolide a IRP, gere o processo-mãe no M2A e siga para contratos."
      steps={[
        {
          label: "Importar",
          description: "Planilha consolidada IRP",
          to: "/irp",
          icon: Upload,
          state: "active",
        },
        {
          label: "Processos",
          description: "Snapshot e geração",
          to: "/processos",
          icon: FileText,
        },
        {
          label: "Contratos",
          description: "Gerar em lote",
          to: "/contratos",
          icon: FileSignature,
        },
        {
          label: "Enviar",
          description: "Portal e documentos",
          to: "/contratos",
          icon: Send,
        },
      ]}
    />
  );
}
