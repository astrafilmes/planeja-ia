import { memo, type ReactNode } from "react";
import type { M2AServidor } from "@/hooks/useM2ACatalog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMPTY_SELECT_VALUE, KEEP_SELECT_VALUE } from "../lib";

export type ActorSelectProps = {
  label: string;
  value: string;
  servidores: M2AServidor[];
  emptyMessage: ReactNode;
  onChange: (value: string) => void;
  /** Se true, inclui a opção "Manter atual" (KEEP) usada em bulk-edit. */
  allowKeep?: boolean;
  keepLabel?: string;
  emptyLabel?: string;
};

/**
 * Select controlado de servidor (fiscal/gestor). Totalmente dumb: o pai controla
 * `value` e recebe atualizações via `onChange`. Usa os sentinelas
 * `EMPTY_SELECT_VALUE` / `KEEP_SELECT_VALUE` do lib para preservar o contrato
 * histórico com Radix Select (não aceita string vazia).
 */
function ActorSelectImpl({
  label,
  value,
  servidores,
  emptyMessage,
  onChange,
  allowKeep = false,
  keepLabel = "Manter atual",
  emptyLabel = "Nenhum",
}: ActorSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowKeep && (
            <SelectItem value={KEEP_SELECT_VALUE} className="italic">
              {keepLabel}
            </SelectItem>
          )}
          <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
            {emptyLabel}
          </SelectItem>
          {servidores.map((servidor) => (
            <SelectItem key={servidor.id_local} value={servidor.m2a_id}>
              {servidor.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {servidores.length === 0 && (
        <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

export const ActorSelect = memo(ActorSelectImpl);
