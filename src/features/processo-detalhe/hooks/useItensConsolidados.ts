import { useMemo } from "react";
import {
  compareStrictItemOrder,
  type ContratoRow,
  type ItemConsolidado,
  type ProcessoAtaItem,
} from "../lib";

export function useItensConsolidados(
  contratos: ContratoRow[],
  ataItens: ProcessoAtaItem[],
  itemSearch: string,
): ItemConsolidado[] {
  return useMemo(() => {
    const consumedByKey = new Map<
      string,
      {
        quantidade: number;
        descricao?: string;
        unidade?: string | null;
        valor_unitario?: number;
      }
    >();

    for (const contrato of contratos) {
      for (const item of contrato.itens) {
        const key = item.m2a_item_id || item.numero || item.descricao || "";
        if (!key) continue;
        const current = consumedByKey.get(key) ?? { quantidade: 0 };
        current.quantidade += Number(item.quantidade_numero ?? 0);
        current.descricao ||= item.descricao;
        current.unidade ||= item.unidade;
        current.valor_unitario ||= item.valor_unitario;
        consumedByKey.set(key, current);
      }
    }

    const consumedItems = Array.from(consumedByKey.entries()).map(
      ([codigo, item]): ItemConsolidado => ({
        codigo,
        descricao: item.descricao ?? "Item sem descrição",
        unidade: item.unidade ?? null,
        quantidadeTotal: item.quantidade,
        quantidadeConsumida: item.quantidade,
        saldo: 0,
        valorDisponivel: 0,
        valorUnitario: item.valor_unitario ?? 0,
        valorUnitarioContratado: item.valor_unitario ?? 0,
        valorConsumido: item.quantidade * Number(item.valor_unitario ?? 0),
      }),
    );

    const usarSnapshotPortal =
      ataItens.length > 0 &&
      (consumedByKey.size === 0 ||
        ataItens.length >= consumedByKey.size * 0.8);
    const base = usarSnapshotPortal
      ? ataItens.map((item) => {
          const consumed = consumedByKey.get(item.m2a_item_id);
          const quantidadeConsumida = consumed?.quantidade ?? 0;
          const valorUnitario = Number(item.valor_unitario ?? 0);
          const valorUnitarioContratado =
            Number(consumed?.valor_unitario ?? 0) || valorUnitario;
          return {
            codigo: item.codigo,
            descricao: item.descricao,
            unidade: item.unidade,
            quantidadeTotal: null as number | null,
            quantidadeConsumida,
            saldo: null as number | null,
            valorDisponivel: null as number | null,
            valorUnitario,
            valorUnitarioContratado,
            valorConsumido: quantidadeConsumida * valorUnitarioContratado,
          };
        })
      : consumedItems;

    const sortedBase = [...base].sort((a, b) =>
      compareStrictItemOrder(a, b, (item) => item.codigo),
    );
    const q = itemSearch.trim().toLowerCase();
    if (!q) return sortedBase;
    return sortedBase.filter((item) =>
      [item.codigo, item.descricao, item.unidade]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contratos, ataItens, itemSearch]);
}
