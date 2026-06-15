// =====================================================================
// Orquestrador: amarra as 5 fases de criação de Processo SRP no M2A e
// reporta progresso (etapa + mensagem + %) via callback `onProgress`.
// =====================================================================

import {
  criarDFD,
  capturarIdsProcesso,
  atualizarProcesso,
  importarPlanilha,
} from "./processo-srp.js";

/**
 * @param {object} payload
 *   {
 *     objeto, data, ano_orcamento,
 *     orgao_solicitante, unidade_orcamentaria, unidade_orcamentaria_gerenciadora,
 *     responsavel_dfd, comissao_planejamento, classificacao,
 *     numero?,
 *     listaImportacoes: [
 *       { orgao_pk, unidade_orcamentaria_pk, arquivo_xlsx: { bytesBase64, filename, mimeType?, nome? } }
 *     ]
 *   }
 * @param {(evt: { etapa, mensagem, progresso?, payload? }) => void} onProgress
 */
export async function orquestrarCriacaoProcesso(payload, onProgress = () => {}) {
  const lista = Array.isArray(payload.listaImportacoes)
    ? payload.listaImportacoes
    : [];
  const totalPlanilhas = lista.length;

  onProgress({ etapa: "criar_dfd", mensagem: "Criando DFD…", progresso: 5 });
  await criarDFD({
    objeto: payload.objeto,
    data: payload.data,
    ano_orcamento: payload.ano_orcamento,
    orgao_solicitante: payload.orgao_solicitante,
    unidade_orcamentaria: payload.unidade_orcamentaria,
    responsavel_dfd: payload.responsavel_dfd,
    comissao_planejamento: payload.comissao_planejamento,
  });

  onProgress({
    etapa: "buscar_ids",
    mensagem: "Localizando IDs da DFD e do processo…",
    progresso: 25,
  });
  const { dfdId, processoId } = await capturarIdsProcesso({
    objeto: payload.objeto,
  });

  onProgress({
    etapa: "atualizar_processo",
    mensagem: `Atualizando processo ${processoId}…`,
    progresso: 45,
    payload: { dfdId, processoId },
  });
  await atualizarProcesso(processoId, {
    numero: payload.numero,
    objeto: payload.objeto,
    data_processo: payload.data,
    unidade_orcamentaria_gerenciadora:
      payload.unidade_orcamentaria_gerenciadora || payload.unidade_orcamentaria,
  });

  // Fase 5 — Importação SEQUENCIAL de planilhas
  const erros = [];
  for (let i = 0; i < totalPlanilhas; i++) {
    const item = lista[i];
    const orgao = item?.orgao_pk;
    const uo = item?.unidade_orcamentaria_pk;
    const arq = item?.arquivo_xlsx || {};
    const nome = item?.nome || arq.filename || `Planilha ${i + 1}`;

    onProgress({
      etapa: "importar_planilhas",
      mensagem: `Importando ${nome} (${i + 1}/${totalPlanilhas})…`,
      progresso: 55 + (i / Math.max(totalPlanilhas, 1)) * 40,
      payload: { itemAtual: i + 1, totalItens: totalPlanilhas, nome },
    });

    try {
      const bytes = Buffer.from(String(arq.bytesBase64 || ""), "base64");
      if (!bytes.length) {
        throw new Error("arquivo_xlsx.bytesBase64 vazio");
      }
      await importarPlanilha({
        processoId,
        dataAviso: payload.data,
        orgaoPk: orgao,
        unidadeOrcamentariaPk: uo,
        arquivoBytes: bytes,
        arquivoFilename: arq.filename || `${nome}.xlsx`,
        arquivoMime: arq.mimeType,
      });
    } catch (err) {
      erros.push({ index: i, nome, erro: String(err?.message ?? err) });
      onProgress({
        etapa: "importar_planilhas_erro",
        mensagem: `Falha em ${nome}: ${err?.message ?? err}`,
        payload: { itemAtual: i + 1, totalItens: totalPlanilhas, nome },
      });
      // segue para próximas
    }
  }

  onProgress({
    etapa: "concluido",
    mensagem: erros.length
      ? `Concluído com ${erros.length} erro(s) em ${totalPlanilhas} planilhas.`
      : "Processo SRP criado com sucesso.",
    progresso: 100,
    payload: { processoId, dfdId, erros, totalPlanilhas },
  });

  return { processoId, dfdId, erros, totalPlanilhas };
}
