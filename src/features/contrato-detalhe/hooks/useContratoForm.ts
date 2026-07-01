import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { isNumericM2AId } from "@/lib/m2a";
import type { ContratoFull } from "../lib";

export function useContratoForm(
  id: string,
  contrato: ContratoFull | null | undefined,
) {
  const qc = useQueryClient();

  const [editNumeroContrato, setEditNumeroContrato] = useState("");
  const [editAtaId, setEditAtaId] = useState("");
  const [editData, setEditData] = useState("");
  const [editObjeto, setEditObjeto] = useState("");
  const [editPreposto, setEditPreposto] = useState("");
  const [editFiscal, setEditFiscal] = useState("");
  const [salvandoM2AConfig, setSalvandoM2AConfig] = useState(false);

  useEffect(() => {
    if (!contrato?.contrato) return;
    const cc = contrato.contrato;
    setEditNumeroContrato(cc.numero_contrato ?? "");
    setEditAtaId(cc.m2a_ata_id ?? "");
    setEditData(cc.data ? String(cc.data).slice(0, 10) : "");
    setEditObjeto(cc.objeto ?? "");
    setEditPreposto(cc.preposto ?? "");
    setEditFiscal(cc.fiscal ?? "");
  }, [contrato?.contrato]);

  const handleSalvarContratoM2AConfig = useCallback(async () => {
    if (!contrato) return;
    const numero = editNumeroContrato.trim();
    if (!numero) {
      notify.error("Informe o número do contrato.");
      return;
    }
    if (editAtaId && !isNumericM2AId(editAtaId)) {
      notify.error("Selecione uma ata válida.");
      return;
    }
    const ataSelecionada = editAtaId
      ? contrato.m2aAtas.find((ata) => ata.m2a_ata_id === editAtaId)
      : null;
    setSalvandoM2AConfig(true);
    const { error } = await supabase
      .from("contratos")
      .update({
        numero_contrato: numero,
        m2a_ata_id: editAtaId || undefined,
        m2a_ata_numero: ataSelecionada?.numero_ata ?? undefined,
        fornecedor_nome: ataSelecionada?.fornecedor_nome ?? undefined,
        data: editData ? editData : undefined,
        objeto: editObjeto.trim() || undefined,
        preposto: editPreposto.trim() || undefined,
        fiscal: editFiscal.trim() || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSalvandoM2AConfig(false);
    if (error) {
      notify.error(error.message);
      return;
    }
    notify.success("Contrato atualizado para envio.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["contrato-full", id] }),
      qc.invalidateQueries({ queryKey: ["processo-detail"] }),
    ]);
  }, [
    contrato,
    editNumeroContrato,
    editAtaId,
    editData,
    editObjeto,
    editPreposto,
    editFiscal,
    id,
    qc,
  ]);

  return {
    editNumeroContrato,
    setEditNumeroContrato,
    editAtaId,
    setEditAtaId,
    editData,
    setEditData,
    editObjeto,
    setEditObjeto,
    editPreposto,
    setEditPreposto,
    editFiscal,
    setEditFiscal,
    salvandoM2AConfig,
    handleSalvarContratoM2AConfig,
  };
}
