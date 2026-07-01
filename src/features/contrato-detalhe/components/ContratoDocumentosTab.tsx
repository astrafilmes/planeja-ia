import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentosEditor } from "@/components/contratos/DocumentosEditor";
import type { ContratoRow, DocumentoRow } from "../lib";

export interface ContratoDocumentosTabProps {
  contratoId: string;
  contrato: ContratoRow;
  documentos: DocumentoRow[];
  onChange: () => void;
}

export const ContratoDocumentosTab = memo(function ContratoDocumentosTab({
  contratoId,
  contrato,
  documentos,
  onChange,
}: ContratoDocumentosTabProps) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <DocumentosEditor
          contratoId={contratoId}
          contratoNumero={contrato.numero_contrato}
          m2aContratoId={contrato.m2a_contrato_id ?? null}
          documentos={documentos as never}
          documentosM2A={contrato.m2a_documentos_gerados}
          onChange={onChange}
        />
      </CardContent>
    </Card>
  );
});
