import { memo, useMemo } from "react";
import { WorkflowGuide } from "@/components/layout/WorkflowGuide";
import { FileSignature, FileText, FileUp, Send } from "lucide-react";
import type { ContratoFull } from "../lib";

export interface ContratoWorkflowGuideProps {
  contrato: ContratoFull;
  statusM2A: string;
}

export const ContratoWorkflowGuide = memo(function ContratoWorkflowGuide({
  contrato,
  statusM2A,
}: ContratoWorkflowGuideProps) {
  const enviado = statusM2A === "sucesso" || statusM2A === "enviado";

  const steps = useMemo(
    () => [
      {
        label: "Importar",
        description: "Origem ou cadastro",
        to: "/importar-contratos",
        icon: FileUp,
        state: (contrato.contrato.import_job_id ? "done" : "idle") as
          | "done"
          | "idle",
      },
      {
        label: "Processos",
        description: contrato.processo?.numero_processo ?? "Sem vínculo",
        to: "/processos",
        icon: FileText,
        state: (contrato.processo ? "done" : "idle") as "done" | "idle",
      },
      {
        label: "Contrato",
        description: "Revisar dados",
        to: "/contratos",
        icon: FileSignature,
        state: "active" as const,
      },
      {
        label: "Enviar",
        description: enviado ? "Documentos prontos" : "Enviar ao M2A",
        to: "/contratos",
        icon: Send,
        state: (enviado ? "done" : "idle") as "done" | "idle",
      },
    ],
    [contrato.contrato.import_job_id, contrato.processo, enviado],
  );

  return <WorkflowGuide steps={steps} />;
});
