// Orquestrador equivalente a processarContratoCompleto.
// Emite eventos via callback `onProgress(etapa, mensagem, extra)`.

import { assertNumericId } from "./utils.js";
import {
  buscarIdContratoPorNumero, criarCabecalhoContrato,
  vincularFiscal, vincularGestor, vincularPreposto,
  adicionarItensAoContrato, atualizarQuantidadesItens,
  incluirDotacao, configurarDocumentos,
} from "./contrato.js";

export async function processarContratoCompleto(payload, onProgress = () => {}) {
  const { contratoId, m2aProcessoUrl, m2aAtaId, contrato, dadosM2A, itens, dadosDotacao } = payload;
  const numeroContrato = contrato?.numero_contrato || contrato?.numero;

  const progress = (etapa, mensagem, extra = {}) =>
    onProgress({ contratoId, etapa, mensagem, ...extra });

  assertNumericId("m2aAtaId", String(m2aAtaId));
  assertNumericId("dadosM2A.unidade_gestora", String(dadosM2A.unidade_gestora));
  assertNumericId("dadosM2A.fiscal_id", String(dadosM2A.fiscal_id));
  assertNumericId("dadosM2A.gestor_id", String(dadosM2A.gestor_id));
  assertNumericId("dadosM2A.preposto_id", dadosM2A.preposto_id, false);

  let m2aInternalId = contrato.m2a_contrato_id || null;

  progress("recuperar_id", "Verificando se o contrato já existe na M2A...");
  if (!m2aInternalId) {
    try {
      m2aInternalId = await buscarIdContratoPorNumero(m2aAtaId, numeroContrato, m2aProcessoUrl);
    } catch {
      // será criado abaixo
    }
  }

  if (!m2aInternalId) {
    progress("criar_contrato", "Módulo 1: Criando cabeçalho...");
    const created = await criarCabecalhoContrato(m2aAtaId, {
      numero: numeroContrato,
      objeto: contrato.objeto,
      data: contrato.data,
      data_fim: contrato.data_fim,
      unidade_gestora: dadosM2A.unidade_gestora,
    });
    if (!created.ok) throw new Error("Falha ao criar cabeçalho do contrato.");
    m2aInternalId =
      created.contratoId ||
      (await buscarIdContratoPorNumero(m2aAtaId, numeroContrato, m2aProcessoUrl, { deepSearch: true }));
  }
  if (!m2aInternalId) throw new Error("Não foi possível obter o ID interno do contrato.");

  progress("vincular_atores", "Módulo 3: Vinculando Fiscal, Gestor e Preposto...");

  if (dadosM2A.fiscal_id) await vincularFiscal(m2aInternalId, dadosM2A.fiscal_id, contrato.data);
  if (dadosM2A.gestor_id) await vincularGestor(m2aInternalId, dadosM2A.gestor_id, contrato.data);

  const nomePreposto = String(dadosM2A.preposto_nome ?? contrato.preposto ?? "").trim();
  if (!dadosM2A.preposto_id && !nomePreposto) {
    throw new Error("Preposto não informado no payload.");
  }
  if (dadosM2A.preposto_id || nomePreposto) {
    await vincularPreposto(m2aInternalId, nomePreposto, contrato.data, dadosM2A.preposto_id);
  }

  const itensPayload = itens ?? dadosM2A.itens ?? [];
  const avisos = [];
  const coletarAvisos = (etapa, lista) => {
    for (const msg of lista ?? []) {
      avisos.push({ etapa, mensagem: msg });
      progress(etapa, `Aviso: ${msg}`, { aviso: true });
    }
  };

  progress("incluir_itens", "Módulo 4: Adicionando itens da Ata ao contrato...");
  const addResult = await adicionarItensAoContrato(m2aInternalId, itensPayload);
  coletarAvisos("incluir_itens", addResult?.avisos);

  progress("atualizar_quantidades", "Módulo 5: Atualizando quantidades dos itens...");
  const qtdResult = await atualizarQuantidadesItens(m2aInternalId, itensPayload);
  coletarAvisos("atualizar_quantidades", qtdResult?.avisos);

  const dotacaoPayload = dadosDotacao ?? dadosM2A.dotacao ?? null;
  progress("incluir_dotacoes", "Módulo 6: Incluindo dotação orçamentária...");
  await incluirDotacao(m2aInternalId, dotacaoPayload);

  progress("enviar_documentos", "Módulo 7: Configurando documentos da entidade...");
  const documentosResult = await configurarDocumentos(m2aInternalId, contrato.data);

  const mensagemFinal = avisos.length
    ? `Contrato integrado com ${avisos.length} aviso(s) — verifique itens pulados.`
    : "Contrato integrado com itens, dotação, atores e documentos!";

  progress("concluido", mensagemFinal, {
    sucesso: true,
    status: "concluido",
    m2a_contrato_id: m2aInternalId,
    documentosM2A: documentosResult.documentosM2A ?? [],
    avisos,
  });

  return { m2a_contrato_id: m2aInternalId, documentosM2A: documentosResult.documentosM2A ?? [], avisos };
}
