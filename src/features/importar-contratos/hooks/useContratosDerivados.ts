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

function traceText(value: unknown, max = 140) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function traceTable(label: string, rows: unknown[], limit = 500) {
  const list = Array.isArray(rows) ? rows : [];
  console.log(`${label}: ${list.length} registro(s)`);
  if (!list.length) return;
  console.table(list.slice(0, limit));
  if (list.length > limit) {
    console.log(`${label}: ${list.length - limit} registro(s) omitidos`);
  }
}

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

  useEffect(() => {
    if (!jobDetail) return;
    console.groupCollapsed(
      `[m2a-preview] contratos derivados do job ${jobDetail.job?.id ?? ""}`,
    );
    console.log("Job:", {
      id: jobDetail.job?.id,
      status: jobDetail.job?.status,
      totalItensJob: jobDetail.itens?.length ?? 0,
      totalDotacoesJob: jobDetail.dotacoes?.length ?? 0,
      contratosPreliminares: contratosPreliminares.length,
    });
    traceTable(
      "[m2a-preview] contratos previstos",
      contratosPreliminares.map((contrato) => ({
        key: contrato.key,
        ata: contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "SEM_ATA",
        m2aAtaId: contrato.m2aAtaId,
        secretaria: contrato.secretariaSigla,
        dotacao: contrato.dotacao,
        fornecedor: traceText(resolveFornecedorNome(contrato), 70),
        itens: contrato.itens.length,
        totalValor: contrato.totalValor,
      })),
    );
    traceTable(
      "[m2a-preview] distribuição item→contrato",
      contratosPreliminares.flatMap((contrato) =>
        contrato.itens.map((item) => ({
          contratoKey: contrato.key,
          ata: contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "SEM_ATA",
          secretaria: contrato.secretariaSigla,
          dotacao: contrato.dotacao,
          itemId: item.itemId,
          m2aItemId: item.m2aItemId,
          ordemItem: item.ordemItem,
          numeroItem: item.numeroItem,
          lote: item.lote,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          subtotal: item.subtotal,
          descricao: traceText(item.descricao, 160),
        })),
      ),
    );
    console.groupEnd();
  }, [jobDetail, contratosPreliminares]);

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

  // Validação de erros que impedem a geração: numeração duplicada dentro do
  // mesmo contrato, itens sem nº e itens sem descrição. Ajuda o usuário a
  // corrigir a planilha antes de gerar contratos.
  const validacaoContratos = useMemo(() => {
    const duplicados: Array<{
      contratoKey: string;
      contratoLabel: string;
      numero: string;
      ocorrencias: number;
    }> = [];
    const semNumero: Array<{ contratoKey: string; contratoLabel: string; qtd: number }> = [];
    const semDescricao: Array<{ contratoKey: string; contratoLabel: string; qtd: number }> = [];

    for (const contrato of contratosSelecionados) {
      const label = `${contrato.secretariaSigla ?? "?"} · ${
        contrato.m2aAtaNumero ?? contrato.m2aAtaId ?? "sem ata"
      } · ${resolveFornecedorNome(contrato)}`;
      const counts = new Map<string, number>();
      let vazios = 0;
      let semDesc = 0;
      for (const item of contrato.itens) {
        const num = String(item.numeroItem ?? "").trim();
        if (!num) vazios += 1;
        else counts.set(num, (counts.get(num) ?? 0) + 1);
        if (!String(item.descricao ?? "").trim()) semDesc += 1;
      }
      for (const [numero, ocorrencias] of counts) {
        if (ocorrencias > 1) {
          duplicados.push({
            contratoKey: contrato.key,
            contratoLabel: label,
            numero,
            ocorrencias,
          });
        }
      }
      if (vazios > 0)
        semNumero.push({ contratoKey: contrato.key, contratoLabel: label, qtd: vazios });
      if (semDesc > 0)
        semDescricao.push({ contratoKey: contrato.key, contratoLabel: label, qtd: semDesc });
    }

    return {
      duplicados,
      semNumero,
      semDescricao,
      hasErros:
        duplicados.length > 0 || semNumero.length > 0 || semDescricao.length > 0,
    };
  }, [contratosSelecionados]);

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
    validacaoContratos,
    isAutorizado,
  };
}
