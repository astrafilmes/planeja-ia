import { memo, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AtoresEditor,
  type DefaultServidor,
} from "@/components/contratos/AtoresEditor";
import type { AtorRow, ContratoRow, SecretariaWithCpf } from "../lib";

export interface ContratoAtoresTabProps {
  contratoId: string;
  atores: AtorRow[];
  contrato: ContratoRow;
  secretaria: SecretariaWithCpf | null;
  locked: boolean;
  onChange: () => void;
}

export const ContratoAtoresTab = memo(function ContratoAtoresTab({
  contratoId,
  atores,
  contrato,
  secretaria,
  locked,
  onChange,
}: ContratoAtoresTabProps) {
  const defaults = useMemo<DefaultServidor[]>(
    () => [
      {
        tipo: "fiscal",
        nome: secretaria?.m2a_fiscal_nome ?? contrato.fiscal,
        cpf: secretaria?.m2a_fiscal_cpf ?? null,
        origem: secretaria?.m2a_fiscal_nome
          ? `Secretaria ${contrato.secretaria_sigla}`
          : "Contrato",
      },
      {
        tipo: "gestor",
        nome: secretaria?.m2a_gestor_nome ?? null,
        cpf: secretaria?.m2a_gestor_cpf ?? null,
        origem: `Secretaria ${contrato.secretaria_sigla}`,
      },
      {
        tipo: "preposto",
        nome: contrato.preposto,
        cpf: null,
        origem: "Definido no contrato",
      },
    ],
    [contrato, secretaria],
  );

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <AtoresEditor
          contratoId={contratoId}
          atores={atores as never}
          onChange={onChange}
          locked={locked}
          defaults={defaults}
        />
      </CardContent>
    </Card>
  );
});
