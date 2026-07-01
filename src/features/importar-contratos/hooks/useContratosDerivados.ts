import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { agruparContratos, type ContratoPreliminar } from "@/lib/contratoImport";
import {
  hasM2AActors,
  resolveFornecedorKey,
  resolveFornecedorNome,
  resolveSecretariaForContrato,
  type FornecedorPrepostoTarget,
  type SecretariaM2A,
} from "../lib";

type JobDetail = {
  job: any;
  itens: any[];
  dotacoes: any[];
};

/**
 * Deriva todas as coleções memoizadas usadas na UI a partir do jobDetail bruto
 * e do cadastro de secretarias. Sincroniza `contratosDesmarcados` quando o
 * dataset muda (troca de job ou edição que apaga chaves).
 */
export function useContratosDerivados(options: {
  jobDetail: JobDetail | undefined;
  secretariasM2A: SecretariaM2A[];
  contratosDesmarcados: Set<string>;
  setContratosDesmarcados: Dispatch<SetStateAction<Set<string>>>;
}) {
  const {
    jobDetail,
    secretariasM2A,
    contratosDesmarcados,
    setContratosDesmarcados,
  } = options;

  const contratosPreliminares: ContratoPreliminar[] = useMemo(() => {
    if (!jobDetail) return [];
    return agruparContratos(
      jobDetail.itens as any,
      jobDetail.dotacoes as any,
    );
  }, [jobDetail]);

  // Limpa chaves desmarcadas que não existem mais (após edição)
  useEffect(() => {
    setContratosDesmarcados((current) => {
      if (current.size === 0) return current;
      const validKeys = new Set(contratosPreliminares.map((c) => c.key));
      const next = new Set<string>();
      for (const key of current) if (validKeys.has(key)) next.add(key);
      return next.size === current.size ? current : next;
    });
  }, [contratosPreliminares, setContratosDesmarcados]);

  const contratosSelecionados = useMemo(
    () =>
      contratosPreliminares.filter((c) => !contratosDesmarcados.has(c.key)),
    [contratosPreliminares, contratosDesmarcados],
  );

  const fornecedoresPrepostoTargets = useMemo<FornecedorPrepostoTarget[]>(() => {
    const map = new Map<string, FornecedorPrepostoTarget>();
    for (const contrato of contratosSelecionados) {
      const key = resolveFornecedorKey(contrato);
      const fornecedorNome = resolveFornecedorNome(contrato);
      const current = map.get(key);
      if (current) {
        current.contratos += 1;
      } else {
        map.set(key, { key, fornecedorNome, contratos: 1 });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.fornecedorNome.localeCompare(b.fornecedorNome, "pt-BR", {
        numeric: true,
      }),
    );
  }, [contratosSelecionados]);

  const contratosComSecretaria = useMemo(
    () =>
      contratosSelecionados.map((contrato) => ({
        contrato,
        secretaria: resolveSecretariaForContrato(contrato, secretariasM2A),
      })),
    [contratosSelecionados, secretariasM2A],
  );

  const contratosSemCadastroM2A = useMemo(
    () =>
      contratosComSecretaria.filter(
        ({ secretaria }) => !hasM2AActors(secretaria),
      ),
    [contratosComSecretaria],
  );

  const contratosSemAtaM2A = useMemo(
    () => contratosSelecionados.filter((contrato) => !contrato.m2aAtaId),
    [contratosSelecionados],
  );

  const totalValor = useMemo(
    () => contratosSelecionados.reduce((s, c) => s + c.totalValor, 0),
    [contratosSelecionados],
  );

  const totalItens = useMemo(
    () => contratosSelecionados.reduce((s, c) => s + c.totalItens, 0),
    [contratosSelecionados],
  );

  const fornecedoresUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const c of contratosSelecionados) set.add(resolveFornecedorNome(c));
    return [...set];
  }, [contratosSelecionados]);

  const itensSemValor = useMemo(
    () =>
      (jobDetail?.itens ?? []).filter(
        (i: any) => !i.excluido && (!i.valor_unitario || i.valor_unitario <= 0),
      ).length,
    [jobDetail],
  );

  const isAutorizado = jobDetail?.job?.status === "autorizado";

  return {
    contratosPreliminares,
    contratosSelecionados,
    fornecedoresPrepostoTargets,
    contratosComSecretaria,
    contratosSemCadastroM2A,
    contratosSemAtaM2A,
    totalValor,
    totalItens,
    fornecedoresUnicos,
    itensSemValor,
    isAutorizado,
  };
}
