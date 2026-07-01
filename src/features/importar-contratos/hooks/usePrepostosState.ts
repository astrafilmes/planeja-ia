import { useEffect, useMemo, useState } from "react";
import {
  normalizeFornecedorKey,
  type FornecedorPreposto,
  type FornecedorPrepostoTarget,
} from "../lib";

/**
 * Gerencia o estado local `prepostosByFornecedor` (mapa fornecedorKey → nome do preposto).
 * Sincroniza com valores já cadastrados no banco e limpa entradas obsoletas
 * quando o conjunto de fornecedores-alvo muda.
 */
export function usePrepostosState(options: {
  fornecedoresPrepostoTargets: FornecedorPrepostoTarget[];
  fornecedoresPrepostos: FornecedorPreposto[];
}) {
  const { fornecedoresPrepostoTargets, fornecedoresPrepostos } = options;

  const [prepostosByFornecedor, setPrepostosByFornecedor] = useState<
    Record<string, string>
  >({});

  const fornecedorMapFromDb = useMemo(() => {
    return new Map(
      fornecedoresPrepostos.map((item) => [
        normalizeFornecedorKey(item.fornecedor_nome_norm || item.fornecedor_nome),
        item.preposto_nome,
      ]),
    );
  }, [fornecedoresPrepostos]);

  useEffect(() => {
    setPrepostosByFornecedor((current) => {
      const allowed = new Set(
        fornecedoresPrepostoTargets.map((item) => item.key),
      );
      const next: Record<string, string> = {};

      for (const [key, value] of Object.entries(current)) {
        if (allowed.has(key)) next[key] = value;
      }

      for (const item of fornecedoresPrepostoTargets) {
        const existing = next[item.key]?.trim();
        if (existing) continue;
        const saved = fornecedorMapFromDb.get(item.key)?.trim() ?? "";
        next[item.key] = saved;
      }

      return next;
    });
  }, [fornecedorMapFromDb, fornecedoresPrepostoTargets]);

  const fornecedoresSemPreposto = useMemo(
    () =>
      fornecedoresPrepostoTargets.filter(
        (target) => !prepostosByFornecedor[target.key]?.trim(),
      ),
    [fornecedoresPrepostoTargets, prepostosByFornecedor],
  );

  return {
    prepostosByFornecedor,
    setPrepostosByFornecedor,
    fornecedorMapFromDb,
    fornecedoresSemPreposto,
  };
}
