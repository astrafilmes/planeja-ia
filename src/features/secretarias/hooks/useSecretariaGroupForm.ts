import { useCallback, useState } from "react";
import {
  EMPTY_SELECT_VALUE,
  KEEP_SELECT_VALUE,
  type GroupForm,
  type SecretariaGroup,
} from "../lib";

const INITIAL_FORM: GroupForm = {
  unidadeM2AId: EMPTY_SELECT_VALUE,
  dotacaoOrgaoM2AId: KEEP_SELECT_VALUE,
  fiscalM2AId: EMPTY_SELECT_VALUE,
  gestorM2AId: EMPTY_SELECT_VALUE,
};

export function useSecretariaGroupForm() {
  const [groupEditing, setGroupEditing] = useState<SecretariaGroup | null>(
    null,
  );
  const [groupForm, setGroupForm] = useState<GroupForm>(INITIAL_FORM);

  const openGroupEdit = useCallback((group: SecretariaGroup) => {
    const dotacaoOrgaoIds = new Set(
      group.rows.map((row) => row.m2a_dot_orgao_id ?? EMPTY_SELECT_VALUE),
    );
    setGroupEditing(group);
    setGroupForm({
      unidadeM2AId: group.unidadeM2AId ?? EMPTY_SELECT_VALUE,
      dotacaoOrgaoM2AId:
        dotacaoOrgaoIds.size === 1
          ? [...dotacaoOrgaoIds][0]
          : KEEP_SELECT_VALUE,
      fiscalM2AId:
        group.fiscaisCount === 1
          ? (group.principal.m2a_fiscal_codigo ?? EMPTY_SELECT_VALUE)
          : KEEP_SELECT_VALUE,
      gestorM2AId:
        group.gestoresCount === 1
          ? (group.principal.m2a_gestor_codigo ?? EMPTY_SELECT_VALUE)
          : KEEP_SELECT_VALUE,
    });
  }, []);

  const close = useCallback(() => setGroupEditing(null), []);

  return {
    groupEditing,
    setGroupEditing,
    groupForm,
    setGroupForm,
    openGroupEdit,
    close,
  };
}
