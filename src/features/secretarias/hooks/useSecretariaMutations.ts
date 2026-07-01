import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import type { M2AServidor } from "@/hooks/useM2ACatalog";
import {
  EMPTY_SELECT_VALUE,
  KEEP_SELECT_VALUE,
  actorPatch,
  isNumericM2AId,
  syncSecretariaCpfs,
  toSecretariaPayload,
  trimOrNull,
  type GroupForm,
  type Sec,
  type SecretariaGroup,
} from "../lib";
import { SECRETARIAS_QUERY_KEY } from "./useSecretariasQuery";

function validateSecretaria(sec: Sec) {
  if (!sec.sigla || !sec.nome || !sec.numero) {
    notify.error("Número, sigla e nome são obrigatórios.");
    return false;
  }

  const invalidFields = [
    !isNumericM2AId(sec.m2a_orgao_id) ? "Unidade Gestora" : null,
    !isNumericM2AId(sec.m2a_dot_orgao_id) ? "Órgão da Dotação" : null,
    !isNumericM2AId(sec.m2a_uo_id) ? "Unidade Orçamentária" : null,
    !isNumericM2AId(sec.m2a_dot_id) ? "Dotação" : null,
    !isNumericM2AId(sec.m2a_fiscal_codigo) ? "Fiscal" : null,
    !isNumericM2AId(sec.m2a_gestor_codigo) ? "Gestor" : null,
  ].filter(Boolean);

  if (invalidFields.length > 0) {
    notify.error("Use apenas IDs numéricos.", {
      description: invalidFields.join(","),
    });
    return false;
  }

  return true;
}

export function useSecretariaMutations(
  fiscais: M2AServidor[],
  gestores: M2AServidor[],
) {
  const qc = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: SECRETARIAS_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["m2a-servidores"] });
  }, [qc]);

  const save = useCallback(
    async (editing: Sec): Promise<boolean> => {
      if (!validateSecretaria(editing)) return false;
      setIsSaving(true);
      try {
        const payload = toSecretariaPayload(editing);
        let secretariaId = editing.id ?? null;

        if (editing.id) {
          const { error } = await supabase
            .from("secretarias")
            .update(payload)
            .eq("id", editing.id);
          if (error) {
            notify.error(error.message);
            return false;
          }
        } else {
          const { data, error } = await supabase
            .from("secretarias")
            .insert(payload)
            .select("id")
            .single();
          if (error) {
            notify.error(error.message);
            return false;
          }
          secretariaId = data?.id ?? null;
        }

        if (secretariaId) {
          try {
            await syncSecretariaCpfs(secretariaId, {
              fiscal: trimOrNull(editing.m2a_fiscal_cpf),
              gestor: trimOrNull(editing.m2a_gestor_cpf),
            });
          } catch (e) {
            notify.error("Secretaria salva, mas CPFs não foram atualizados.", {
              description: (e as Error).message,
            });
          }
        }

        await logAudit({
          action: editing.id ? "update" : "insert",
          entityType: "secretaria",
          entityId: secretariaId,
          payload,
        });

        notify.success("Secretaria salva.");
        invalidate();
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [invalidate],
  );

  const saveGroup = useCallback(
    async (
      groupEditing: SecretariaGroup,
      groupForm: GroupForm,
    ): Promise<boolean> => {
      if (groupForm.unidadeM2AId === EMPTY_SELECT_VALUE) {
        notify.error("Selecione a Unidade Gestora do grupo.");
        return false;
      }
      if (
        groupForm.dotacaoOrgaoM2AId !== KEEP_SELECT_VALUE &&
        groupForm.dotacaoOrgaoM2AId !== EMPTY_SELECT_VALUE &&
        !isNumericM2AId(groupForm.dotacaoOrgaoM2AId)
      ) {
        notify.error("Órgão da Dotação deve ser numérico.");
        return false;
      }

      const fiscal = fiscais.find(
        (item) => item.m2a_id === groupForm.fiscalM2AId,
      );
      const gestor = gestores.find(
        (item) => item.m2a_id === groupForm.gestorM2AId,
      );

      if (
        groupForm.fiscalM2AId !== KEEP_SELECT_VALUE &&
        groupForm.fiscalM2AId !== EMPTY_SELECT_VALUE &&
        !fiscal
      ) {
        notify.error("Fiscal inválido para esta Unidade Gestora.");
        return false;
      }
      if (
        groupForm.gestorM2AId !== KEEP_SELECT_VALUE &&
        groupForm.gestorM2AId !== EMPTY_SELECT_VALUE &&
        !gestor
      ) {
        notify.error("Gestor inválido para esta Unidade Gestora.");
        return false;
      }

      setIsSaving(true);
      try {
        const ids = groupEditing.rows
          .map((row) => row.id)
          .filter(Boolean) as string[];
        const payload: Record<string, unknown> = {
          m2a_orgao_id: groupForm.unidadeM2AId,
          ...(groupForm.dotacaoOrgaoM2AId === KEEP_SELECT_VALUE
            ? {}
            : {
                m2a_dot_orgao_id:
                  groupForm.dotacaoOrgaoM2AId === EMPTY_SELECT_VALUE
                    ? null
                    : groupForm.dotacaoOrgaoM2AId,
              }),
          ...(groupForm.fiscalM2AId === KEEP_SELECT_VALUE
            ? {}
            : actorPatch("m2a_fiscal", fiscal)),
          ...(groupForm.gestorM2AId === KEEP_SELECT_VALUE
            ? {}
            : actorPatch("m2a_gestor", gestor)),
        };

        const { error } = await supabase
          .from("secretarias")
          .update(payload as any)
          .in("id", ids);

        if (error) {
          notify.error(error.message);
          return false;
        }

        if (
          groupForm.fiscalM2AId !== KEEP_SELECT_VALUE ||
          groupForm.gestorM2AId !== KEEP_SELECT_VALUE
        ) {
          try {
            await Promise.all(
              ids.map((id) =>
                syncSecretariaCpfs(id, {
                  ...(groupForm.fiscalM2AId === KEEP_SELECT_VALUE
                    ? {}
                    : { fiscal: fiscal?.cpf ?? null }),
                  ...(groupForm.gestorM2AId === KEEP_SELECT_VALUE
                    ? {}
                    : { gestor: gestor?.cpf ?? null }),
                }),
              ),
            );
          } catch (e) {
            notify.error("Grupo salvo, mas CPFs não foram atualizados.", {
              description: (e as Error).message,
            });
          }
        }

        await logAudit({
          action: "bulk_update",
          entityType: "secretaria_grupo",
          entityId: groupEditing.key,
          payload: { ...payload, registros: ids.length },
        });

        notify.success(
          `${ids.length} dotação(ões) atualizada(s) para ${groupEditing.title}.`,
        );
        invalidate();
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [fiscais, gestores, invalidate],
  );

  const remove = useCallback(
    async (deleting: Sec): Promise<boolean> => {
      if (!deleting.id) return false;
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from("secretarias")
          .delete()
          .eq("id", deleting.id);

        if (error) {
          notify.error(error.message);
          return false;
        }

        await logAudit({
          action: "delete",
          entityType: "secretaria",
          entityId: deleting.id,
          payload: { sigla: deleting.sigla, nome: deleting.nome },
        });

        notify.success("Secretaria excluída.");
        invalidate();
        return true;
      } finally {
        setIsDeleting(false);
      }
    },
    [invalidate],
  );

  return { save, saveGroup, remove, isSaving, isDeleting };
}
