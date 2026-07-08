import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import {
  ITEM_WARN_KEY,
  type ItemActionKind,
  type ItemEditForm,
  type ItemRow,
  itemRowToEditForm,
} from "../lib";

type WarnPending = { kind: ItemActionKind; item: ItemRow } | null;

export function useItemMutations(refetch: () => void) {
  const [warnPending, setWarnPending] = useState<WarnPending>(null);
  const [warnDontShow, setWarnDontShow] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [editForm, setEditForm] = useState<ItemEditForm>({
    numero_item: "",
    descricao: "",
    unidade: "",
    quantidade: "",
    valor_unitario: "",
  });
  const [deletingItem, setDeletingItem] = useState<ItemRow | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const proceedItemAction = useCallback(
    (kind: ItemActionKind, item: ItemRow) => {
      if (kind === "edit") {
        setEditForm(itemRowToEditForm(item));
        setEditingItem(item);
      } else {
        setDeletingItem(item);
      }
    },
    [],
  );

  const requestItemAction = useCallback(
    (kind: ItemActionKind, item: ItemRow) => {
      const skip =
        typeof window !== "undefined" &&
        window.localStorage.getItem(ITEM_WARN_KEY) === "off";
      if (skip) {
        proceedItemAction(kind, item);
        return;
      }
      setWarnDontShow(false);
      setWarnPending({ kind, item });
    },
    [proceedItemAction],
  );

  const confirmWarn = useCallback(() => {
    if (warnDontShow && typeof window !== "undefined") {
      window.localStorage.setItem(ITEM_WARN_KEY, "off");
    }
    if (warnPending) proceedItemAction(warnPending.kind, warnPending.item);
    setWarnPending(null);
  }, [warnDontShow, warnPending, proceedItemAction]);

  const cancelWarn = useCallback(() => setWarnPending(null), []);
  const cancelEdit = useCallback(() => setEditingItem(null), []);
  const cancelDelete = useCallback(() => setDeletingItem(null), []);

  const saveItemEdit = useCallback(async () => {
    if (!editingItem) return;
    setSavingItem(true);
    const qtd = Number(editForm.quantidade.replace(",", ".")) || 0;
    const vu = Number(editForm.valor_unitario.replace(",", ".")) || 0;
    const numeroItemTrim = editForm.numero_item.trim();
    const { error } = await supabase
      .from("contrato_itens")
      .update({
        numero_item: numeroItemTrim || null,
        descricao: editForm.descricao,
        unidade: editForm.unidade || null,
        quantidade: qtd,
        valor_unitario: vu,
        valor_total: qtd * vu,
      })
      .eq("id", editingItem.id);
    setSavingItem(false);
    if (error) return notify.error(error.message);
    notify.success("Item atualizado");
    setEditingItem(null);
    refetch();
  }, [editingItem, editForm, refetch]);

  const deleteItemConfirmed = useCallback(async () => {
    if (!deletingItem) return;
    setSavingItem(true);
    const { error } = await supabase
      .from("contrato_itens")
      .delete()
      .eq("id", deletingItem.id);
    setSavingItem(false);
    if (error) return notify.error(error.message);
    notify.success("Item removido");
    setDeletingItem(null);
    refetch();
  }, [deletingItem, refetch]);

  return {
    // warn dialog
    warnPending,
    warnDontShow,
    setWarnDontShow,
    requestItemAction,
    confirmWarn,
    cancelWarn,
    // edit dialog
    editingItem,
    editForm,
    setEditForm,
    saveItemEdit,
    cancelEdit,
    // delete dialog
    deletingItem,
    deleteItemConfirmed,
    cancelDelete,
    // shared
    savingItem,
  };
}
