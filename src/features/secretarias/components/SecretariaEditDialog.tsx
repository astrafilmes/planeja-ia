import { memo, useMemo } from "react";
import { Layers3 } from "lucide-react";
import {
  filterServidoresByUnidade,
  type M2AServidor,
  type M2AUnidadeGestora,
} from "@/hooks/useM2ACatalog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { EMPTY_SELECT_VALUE, type Sec } from "../lib";
import { ActorSelect } from "./ActorSelect";

export type SecretariaEditDialogProps = {
  open: boolean;
  editing: Sec;
  onChange: (next: Sec) => void;
  unidadesGestoras: M2AUnidadeGestora[];
  fiscais: M2AServidor[];
  gestores: M2AServidor[];
  isSaving: boolean;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
};

type FieldProps = {
  keyName: keyof Sec;
  label: string;
  type?: string;
  placeholder?: string;
  editing: Sec;
  onChange: (next: Sec) => void;
};

const Field = memo(function Field({
  keyName,
  label,
  type = "text",
  placeholder,
  editing,
  onChange,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={((editing as unknown as Record<string, unknown>)[keyName] as
          | string
          | number
          | null
          | undefined) ?? ""}
        onChange={(event) =>
          onChange({
            ...editing,
            [keyName]:
              type === "number"
                ? event.target.value === ""
                  ? null
                  : Number(event.target.value)
                : event.target.value,
          } as Sec)
        }
      />
    </div>
  );
});

function SecretariaEditDialogImpl({
  open,
  editing,
  onChange,
  unidadesGestoras,
  fiscais,
  gestores,
  isSaving,
  onSave,
  onOpenChange,
}: SecretariaEditDialogProps) {
  const rowFiscais = useMemo(
    () => filterServidoresByUnidade(fiscais, editing.m2a_orgao_id),
    [fiscais, editing.m2a_orgao_id],
  );
  const rowGestores = useMemo(
    () => filterServidoresByUnidade(gestores, editing.m2a_orgao_id),
    [gestores, editing.m2a_orgao_id],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing.id ? "Editar" : "Nova"} secretaria/dotação
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-[120px_160px_1fr]">
            <Field
              keyName="numero"
              label="Número *"
              type="number"
              editing={editing}
              onChange={onChange}
            />
            <Field
              keyName="sigla"
              label="Sigla *"
              placeholder="SAU"
              editing={editing}
              onChange={onChange}
            />
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={editing.ativa}
                  onCheckedChange={(checked) =>
                    onChange({ ...editing, ativa: checked === true })
                  }
                />
                Ativa
              </label>
            </div>
          </div>

          <Field
            keyName="nome"
            label="Nome *"
            editing={editing}
            onChange={onChange}
          />

          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 dark:bg-muted/30">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              <Layers3 className="size-3.5" />
              Parâmetros externos
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>Unidade Gestora</Label>
                <Select
                  value={editing.m2a_orgao_id ?? EMPTY_SELECT_VALUE}
                  onValueChange={(value) => {
                    onChange({
                      ...editing,
                      m2a_orgao_id:
                        value === EMPTY_SELECT_VALUE ? null : value,
                      m2a_fiscal_codigo: null,
                      m2a_fiscal_nome: null,
                      m2a_fiscal_cpf: null,
                      m2a_gestor_codigo: null,
                      m2a_gestor_nome: null,
                      m2a_gestor_cpf: null,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UG..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE} className="italic">
                      Nenhuma
                    </SelectItem>
                    {unidadesGestoras.map((unidade) => (
                      <SelectItem
                        key={unidade.id_local}
                        value={unidade.m2a_id}
                      >
                        {unidade.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                keyName="m2a_dot_orgao_id"
                label="Órgão da Dotação"
                editing={editing}
                onChange={onChange}
              />
              <Field
                keyName="m2a_uo_id"
                label="Unid. Orçamentária"
                editing={editing}
                onChange={onChange}
              />
              <Field
                keyName="m2a_dot_id"
                label="Projeto/Atividade"
                editing={editing}
                onChange={onChange}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field
                keyName="m2a_dotacao_default"
                label="Dotação default"
                editing={editing}
                onChange={onChange}
              />
              <Field
                keyName="m2a_ref_coluna"
                label="Ref. coluna na planilha"
                type="number"
                editing={editing}
                onChange={onChange}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ActorSelect
                label="Fiscal padrão"
                value={editing.m2a_fiscal_codigo || EMPTY_SELECT_VALUE}
                servidores={rowFiscais}
                emptyMessage="Nenhum fiscal mapeado para esta Unidade Gestora."
                onChange={(value) => {
                  const fiscal = fiscais.find((item) => item.m2a_id === value);
                  onChange({
                    ...editing,
                    m2a_fiscal_codigo: fiscal?.m2a_id ?? null,
                    m2a_fiscal_nome: fiscal?.nome ?? null,
                    m2a_fiscal_cpf: fiscal?.cpf ?? null,
                  });
                }}
              />
              <ActorSelect
                label="Gestor padrão"
                value={editing.m2a_gestor_codigo || EMPTY_SELECT_VALUE}
                servidores={rowGestores}
                emptyMessage="Nenhum gestor mapeado para esta Unidade Gestora."
                onChange={(value) => {
                  const gestor = gestores.find(
                    (item) => item.m2a_id === value,
                  );
                  onChange({
                    ...editing,
                    m2a_gestor_codigo: gestor?.m2a_id ?? null,
                    m2a_gestor_nome: gestor?.nome ?? null,
                    m2a_gestor_cpf: gestor?.cpf ?? null,
                  });
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const SecretariaEditDialog = memo(SecretariaEditDialogImpl);
