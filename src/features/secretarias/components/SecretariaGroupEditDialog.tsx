import { memo, useMemo } from "react";
import {
  filterServidoresByUnidade,
  type M2AServidor,
  type M2AUnidadeGestora,
} from "@/hooks/useM2ACatalog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPTY_SELECT_VALUE,
  KEEP_SELECT_VALUE,
  type GroupForm,
  type SecretariaGroup,
} from "../lib";
import { ActorSelect } from "./ActorSelect";

export type SecretariaGroupEditDialogProps = {
  group: SecretariaGroup | null;
  form: GroupForm;
  onChange: (form: GroupForm) => void;
  unidadesGestoras: M2AUnidadeGestora[];
  fiscais: M2AServidor[];
  gestores: M2AServidor[];
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

function SecretariaGroupEditDialogImpl({
  group,
  form,
  onChange,
  unidadesGestoras,
  fiscais,
  gestores,
  isSaving,
  onSave,
  onCancel,
}: SecretariaGroupEditDialogProps) {
  const unidadeFilter =
    form.unidadeM2AId === EMPTY_SELECT_VALUE ? null : form.unidadeM2AId;

  const groupFiscais = useMemo(
    () => filterServidoresByUnidade(fiscais, unidadeFilter),
    [fiscais, unidadeFilter],
  );
  const groupGestores = useMemo(
    () => filterServidoresByUnidade(gestores, unidadeFilter),
    [gestores, unidadeFilter],
  );

  return (
    <Dialog
      open={!!group}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar grupo de secretarias</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm dark:bg-muted/30">
            <div className="font-medium">{group?.title}</div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              Esta ação atualiza {group?.rows.length ?? 0} dotação(ões) do grupo
              de uma só vez.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>Unidade Gestora</Label>
              <Select
                value={form.unidadeM2AId}
                onValueChange={(value) =>
                  onChange({
                    ...form,
                    unidadeM2AId: value,
                    fiscalM2AId: EMPTY_SELECT_VALUE,
                    gestorM2AId: EMPTY_SELECT_VALUE,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                    Selecione
                  </SelectItem>
                  {unidadesGestoras.map((unidade) => (
                    <SelectItem key={unidade.id_local} value={unidade.m2a_id}>
                      {unidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Órgão da Dotação</Label>
              <Input
                inputMode="numeric"
                placeholder={
                  form.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
                    ? "Manter atual"
                    : "10026"
                }
                value={
                  form.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
                    ? ""
                    : form.dotacaoOrgaoM2AId === EMPTY_SELECT_VALUE
                      ? ""
                      : form.dotacaoOrgaoM2AId
                }
                onChange={(event) => {
                  const value = event.target.value.trim();
                  onChange({
                    ...form,
                    dotacaoOrgaoM2AId: value || EMPTY_SELECT_VALUE,
                  });
                }}
              />
            </div>

            <ActorSelect
              label="Fiscal padrão"
              value={form.fiscalM2AId}
              servidores={groupFiscais}
              allowKeep
              emptyMessage="Nenhum fiscal mapeado para esta Unidade Gestora."
              onChange={(value) => onChange({ ...form, fiscalM2AId: value })}
            />

            <ActorSelect
              label="Gestor padrão"
              value={form.gestorM2AId}
              servidores={groupGestores}
              allowKeep
              emptyMessage="Nenhum gestor mapeado para esta Unidade Gestora."
              onChange={(value) => onChange({ ...form, gestorM2AId: value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Aplicando…" : "Aplicar ao grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const SecretariaGroupEditDialog = memo(SecretariaGroupEditDialogImpl);
