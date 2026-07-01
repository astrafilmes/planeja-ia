import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { compactNumber, type M2AAtaRow, type M2AItemRow } from "../lib";

/**
 * Mutations de itens da importação: valor, exclusão lógica, reatribuição de ata,
 * ativar/ignorar dotação. Preserva 100% da lógica original (incluindo logs).
 */
export function useItemMutations(options: {
  activeJobId: string | null;
  m2aAtas: M2AAtaRow[];
  m2aItens: M2AItemRow[];
}) {
  const { activeJobId, m2aAtas, m2aItens } = options;
  const qc = useQueryClient();

  const atualizarItem = useCallback(
    async (
      id: string,
      patch: {
        valor_unitario?: number;
        excluido?: boolean;
        descricao?: string;
        unidade?: string;
        m2a_ata_id?: string | null;
        m2a_item_id?: string | null;
        m2a_ata_numero?: string | null;
        m2a_fornecedor_nome?: string | null;
        m2a_fornecedor_cnpj?: string | null;
        numero_item?: string | null;
        m2a_match_status?: string;
        m2a_match_score?: number;
      },
    ) => {
      console.log(`Atualizando item ${id}...`, patch);
      const { error } = await supabase
        .from("contrato_import_itens")
        .update(patch)
        .eq("id", id);
      if (error) {
        console.error("Erro ao atualizar item:", error);
        return notify.error(error.message);
      }
      qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
    },
    [activeJobId, qc],
  );

  const atualizarAtaItem = useCallback(
    async (item: any, ataId: string) => {
      if (ataId === "__none__") {
        await atualizarItem(item.id, {
          m2a_ata_id: null,
          m2a_item_id: null,
          m2a_ata_numero: null,
          m2a_fornecedor_nome: null,
          m2a_fornecedor_cnpj: null,
          m2a_match_status: "manual_sem_ata",
          m2a_match_score: 0,
        });
        return;
      }

      const ata = m2aAtas.find((row) => row.m2a_ata_id === ataId);
      const numeroAlvo =
        compactNumber(item.numero_item) || compactNumber(item.ordem_item);
      const m2aItem = m2aItens.find(
        (row) =>
          row.m2a_ata_id === ataId &&
          compactNumber(row.numero_item) === numeroAlvo,
      );

      if (!m2aItem) {
        console.warn(
          "[Importacao] Ata selecionada sem item M2A correspondente ao numero da planilha.",
          {
            itemId: item.id,
            ataId,
            numeroPlanilha: item.numero_item,
            ordemPlanilha: item.ordem_item,
            descricao: item.descricao,
          },
        );
      }

      await atualizarItem(item.id, {
        m2a_ata_id: ataId,
        m2a_item_id: (m2aItem as any)?.m2a_item_id ?? null,
        m2a_ata_numero: (ata as any)?.numero_ata ?? null,
        m2a_fornecedor_nome: (ata as any)?.fornecedor_nome ?? null,
        m2a_fornecedor_cnpj: (ata as any)?.fornecedor_cnpj ?? null,
        numero_item: (m2aItem as any)?.numero_item ?? item.numero_item ?? null,
        m2a_match_status: m2aItem ? "manual" : "manual_sem_item",
        m2a_match_score: m2aItem ? 100 : 70,
      });
    },
    [atualizarItem, m2aAtas, m2aItens],
  );

  const alternarDotacao = useCallback(
    async (id: string, ignorar: boolean) => {
      console.log(
        `Alternando status da dotação ${id} para ignorado=${ignorar}`,
      );
      const { error } = await supabase
        .from("contrato_import_dotacoes")
        .update({ ignorado: ignorar })
        .eq("id", id);
      if (error) {
        console.error("Erro ao alternar dotação:", error);
        return notify.error(error.message);
      }
      qc.invalidateQueries({ queryKey: ["cij-detail", activeJobId] });
    },
    [activeJobId, qc],
  );

  return { atualizarItem, atualizarAtaItem, alternarDotacao };
}
