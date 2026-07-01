import { useCallback, useMemo, useState } from "react";
import type { M2AServidor, M2AUnidadeGestora } from "@/hooks/useM2ACatalog";
import {
  groupRows,
  normalizeText,
  type EnrichedSec,
  type SecretariaGroup,
  type StatusFilter,
} from "../lib";

export function useSecretariasFilters(
  enrichedRows: EnrichedSec[],
  unidadesGestoras: M2AUnidadeGestora[],
  fiscais: M2AServidor[],
  gestores: M2AServidor[],
) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filteredRows = useMemo(() => {
    const q = normalizeText(search);
    return enrichedRows
      .filter((row) => {
        if (statusFilter === "ativa" && !row.ativa) return false;
        if (statusFilter === "inativa" && row.ativa) return false;
        if (!q) return true;

        const searchable = [
          row.numero,
          row.sigla,
          row.nome,
          row.m2a_dotacao_default,
          row.m2a_orgao_id,
          row.m2a_dot_orgao_id,
          row.m2a_uo_id,
          row.m2a_dot_id,
          row.fiscal?.nome ?? row.m2a_fiscal_nome,
          row.gestor?.nome ?? row.m2a_gestor_nome,
          row.unidade?.nome,
        ].join("");

        return normalizeText(searchable).includes(q);
      })
      .sort(
        (a, b) =>
          a.numero - b.numero ||
          a.sigla.localeCompare(b.sigla, "pt-BR", { numeric: true }) ||
          a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
      );
  }, [enrichedRows, search, statusFilter]);

  const secretariaGroups: SecretariaGroup[] = useMemo(
    () => groupRows(filteredRows, unidadesGestoras),
    [filteredRows, unidadesGestoras],
  );

  const duplicateServidorNames = useMemo(() => {
    const byName = new Map<string, M2AServidor[]>();
    for (const servidor of [...fiscais, ...gestores]) {
      const key = `${servidor.cargo}:${normalizeText(servidor.nome)}`;
      byName.set(key, [...(byName.get(key) ?? []), servidor]);
    }
    return [...byName.values()]
      .filter((items) => items.length > 1)
      .sort((a, b) => a[0].nome.localeCompare(b[0].nome, "pt-BR"));
  }, [fiscais, gestores]);

  const toggleGroup = useCallback((key: string, openValue: boolean) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (openValue) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(secretariaGroups.map((group) => group.key)));
  }, [secretariaGroups]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    expandedGroups,
    toggleGroup,
    expandAll,
    collapseAll,
    filteredRows,
    secretariaGroups,
    duplicateServidorNames,
  };
}
