import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnaliseIRP } from "@/lib/irp";
import { findIrpUnidadeCanonicaByRefColuna, getOrgaoMapping } from "@/lib/m2a";
import type {
  IrpImportRow,
  ProcessoM2AForm,
  ResultadoSalvoIRP,
  SecretariaM2A,
  UnidadeIrp,
} from "../lib";

export interface UseIrpImportRowsOptions {
  analise: AnaliseIRP | null;
  resultadoSalvo: ResultadoSalvoIRP | null;
  secretariaById: Map<string, SecretariaM2A>;
  secretariaByNumero: Map<number, SecretariaM2A>;
  unidadeById: Map<string, UnidadeIrp>;
  fileName: string | null;
  savedFileName: string | null;
  processoM2AForm: ProcessoM2AForm;
  setProcessoM2AForm: React.Dispatch<React.SetStateAction<ProcessoM2AForm>>;
}

export interface EnrichedM2AIds {
  orgaoId: string | null;
  uoId: string | null;
}

export interface UseIrpImportRowsResult {
  importableRows: IrpImportRow[];
  selectedIrpImportIds: string[];
  setSelectedIrpImportIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedImportRows: IrpImportRow[];
  rowsMissingM2A: IrpImportRow[];
  allImportRowsSelected: boolean;
  toggleIrpImportSelection: (key: string, checked: boolean) => void;
  toggleAllIrpImportSelection: (checked: boolean) => void;
  enrichRowForM2A: (row: IrpImportRow) => EnrichedM2AIds;
}

export function useIrpImportRows({
  analise,
  resultadoSalvo,
  secretariaById,
  secretariaByNumero,
  unidadeById,
  fileName,
  savedFileName,
  processoM2AForm,
  setProcessoM2AForm,
}: UseIrpImportRowsOptions): UseIrpImportRowsResult {
  const [selectedIrpImportIds, setSelectedIrpImportIds] = useState<string[]>(
    [],
  );

  const resolveSecretariaM2A = useCallback(
    (unidade?: Partial<UnidadeIrp> | null, numero?: number | null) => {
      if (unidade?.secretaria_id) {
        const byId = secretariaById.get(unidade.secretaria_id);
        if (byId) return byId;
      }
      const numeroUnidade = Number(unidade?.numero ?? numero ?? 0);
      return secretariaByNumero.get(numeroUnidade) ?? null;
    },
    [secretariaById, secretariaByNumero],
  );

  const importableRows = useMemo<IrpImportRow[]>(() => {
    if (analise) {
      return analise.resultados
        .filter((r) => r.itens.length > 0)
        .map((r) => {
          const unidade = r.unidade as UnidadeIrp;
          const secretaria = resolveSecretariaM2A(unidade, unidade.numero);
          const importOrgaoPk = secretaria?.m2a_dot_orgao_id ?? null;
          return {
            key: `analise:${unidade.id}`,
            nome: unidade.nome,
            numero: unidade.numero,
            itens: r.itens.length,
            valor: r.somaValor,
            cabecalhoColuna: r.cabecalhoColuna,
            orgaoPk: secretaria?.m2a_orgao_id ?? null,
            importOrgaoPk,
            unidadePk: secretaria?.m2a_uo_id ?? null,
            filename: null,
            resultado: r,
            secretaria,
          };
        });
    }

    if (resultadoSalvo) {
      return resultadoSalvo.secretarias
        .filter((r) => r.itens_validos > 0 && r.arquivo)
        .map((r) => {
          const unidade = r.unidade_id ? unidadeById.get(r.unidade_id) : null;
          const secretaria = resolveSecretariaM2A(unidade, r.numero);
          const importOrgaoPk = secretaria?.m2a_dot_orgao_id ?? null;
          return {
            key: `salvo:${r.id}`,
            nome: r.nome,
            numero: r.numero,
            itens: r.itens_validos,
            valor: Number(r.soma_valor),
            cabecalhoColuna: r.cabecalho_coluna,
            orgaoPk: secretaria?.m2a_orgao_id ?? null,
            importOrgaoPk,
            unidadePk: secretaria?.m2a_uo_id ?? null,
            filename: r.arquivo?.original_name ?? r.output_filename ?? null,
            arquivo: r.arquivo ?? null,
            secretaria,
          };
        });
    }

    return [];
  }, [analise, resultadoSalvo, resolveSecretariaM2A, unidadeById]);

  const enrichRowForM2A = useCallback((row: IrpImportRow): EnrichedM2AIds => {
    const canonica = findIrpUnidadeCanonicaByRefColuna(
      row.resultado?.unidade.ref_coluna ?? null,
    );
    return {
      orgaoId:
        canonica?.orgaoId ??
        row.secretaria?.m2a_dot_orgao_id ??
        row.secretaria?.m2a_orgao_id ??
        null,
      uoId: canonica?.uoId ?? row.secretaria?.m2a_uo_id ?? null,
    };
  }, []);

  const importableKeys = useMemo(
    () => importableRows.map((row) => row.key).join("|"),
    [importableRows],
  );

  // Reconciliação: mantém apenas seleções ainda válidas; se ficou vazio, seleciona tudo.
  useEffect(() => {
    const keys = importableKeys ? importableKeys.split("|") : [];
    setSelectedIrpImportIds((current) => {
      const selected = current.filter((key) => keys.includes(key));
      return selected.length ? selected : keys;
    });
  }, [importableKeys]);

  const selectedImportRows = useMemo(
    () =>
      importableRows.filter((row) => selectedIrpImportIds.includes(row.key)),
    [importableRows, selectedIrpImportIds],
  );

  const rowsMissingM2A = useMemo(
    () =>
      selectedImportRows.filter((row) => {
        const ids = enrichRowForM2A(row);
        return !ids.orgaoId || !ids.uoId;
      }),
    [enrichRowForM2A, selectedImportRows],
  );

  const allImportRowsSelected =
    importableRows.length > 0 &&
    importableRows.every((row) => selectedIrpImportIds.includes(row.key));

  const toggleIrpImportSelection = useCallback(
    (key: string, checked: boolean) => {
      setSelectedIrpImportIds((current) =>
        checked
          ? Array.from(new Set([...current, key]))
          : current.filter((item) => item !== key),
      );
    },
    [],
  );

  const toggleAllIrpImportSelection = useCallback(
    (checked: boolean) => {
      setSelectedIrpImportIds(
        checked ? importableRows.map((row) => row.key) : [],
      );
    },
    [importableRows],
  );

  // Auto-preenche `objeto` com base no filename se ainda vazio.
  useEffect(() => {
    const filename = fileName ?? savedFileName ?? "";
    if (!filename) return;
    setProcessoM2AForm((current) => {
      if (current.objeto.trim()) return current;
      return {
        ...current,
        objeto: `Registro de precos para ${filename.replace(/\.[^.]+$/, "")}`,
      };
    });
  }, [fileName, savedFileName, setProcessoM2AForm]);

  // Auto-preenche órgão/unidade com base na primeira linha válida.
  useEffect(() => {
    const first = selectedImportRows.find((row) => {
      const ids = enrichRowForM2A(row);
      return ids.orgaoId && ids.uoId;
    });
    if (!first) return;
    const ids = enrichRowForM2A(first);
    setProcessoM2AForm((current) => ({
      ...current,
      orgao_solicitante: current.orgao_solicitante || ids.orgaoId || "",
      unidade_orcamentaria: current.unidade_orcamentaria || ids.uoId || "",
      unidade_orcamentaria_gerenciadora:
        current.unidade_orcamentaria_gerenciadora || ids.uoId || "",
    }));
  }, [enrichRowForM2A, selectedImportRows, setProcessoM2AForm]);

  // Suprime lint sobre form não usado diretamente (mantido para futuras regras).
  void processoM2AForm;

  return {
    importableRows,
    selectedIrpImportIds,
    setSelectedIrpImportIds,
    selectedImportRows,
    rowsMissingM2A,
    allImportRowsSelected,
    toggleIrpImportSelection,
    toggleAllIrpImportSelection,
    enrichRowForM2A,
  };
}
