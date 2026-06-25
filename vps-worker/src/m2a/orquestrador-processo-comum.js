// =====================================================================
// Orquestrador do fluxo de Processo Comum (não-SRP).
//
// Para cada secretaria participante:
//   1. cria 1 DFD comum
//   2. inclui os itens da secretaria nessa DFD (mesma API de SRP)
//   3. cadastra a dotação (solicitacao_despesa_atividade), se houver
//
// Depois (DFD da gerenciadora):
//   4. POST gerar_processo
//   5. Descobre processoId + número via página da DFD
//   6. POST atualizar processo administrativo (modalidade, comissão, etc.)
//   7. POST adicionar_solicitacoes (vincula as demais DFDs)
//   8. Reordena itens do processo conforme ordem da planilha
//   9. Justificativa Gemini → atualizar_justificativa
// =====================================================================

import {
  criarDFDComum,
  cadastrarDotacao,
  gerarProcessoFromDFD,
  descobrirProcessoDaDFD,
  vincularDFDsAoProcesso,
  reordenarItensProcesso,
} from "./processo-comum.js";
import { capturarIdsProcesso, atualizarProcesso } from "./processo-srp.js";
import { criarItemEAdicionarNaDFD } from "./irp-api.js";
import {
  gerarJustificativaGemini,
  atualizarJustificativaM2A,
} from "./justificativa-gemini.js";

function chaveSecretaria(sec) {
  if (sec?.chave) return String(sec.chave);
  if (sec?.m2a_uo_id) return `uo:${String(sec.m2a_uo_id).trim()}`;
  if (sec?.ref_coluna !== undefined && sec?.ref_coluna !== null)
    return `ref:${sec.ref_coluna}`;
  return String(sec?.numero ?? "");
}

function quantidadeDoItem(item, sec) {
  // No fluxo COMUM cada secretaria tem ITENS PRÓPRIOS — não fazemos fallback
  // para a chave da gerenciadora (isso fazia o item da gerenciadora vazar para
  // todas as outras DFDs).
  const quantidades = item?.quantidades ?? {};
  const chaves = [chaveSecretaria(sec), String(sec?.numero ?? "")].filter(Boolean);
  for (const chave of chaves) {
    if (Object.prototype.hasOwnProperty.call(quantidades, chave)) {
      const q = Number(quantidades[chave] ?? 0);
      return Number.isFinite(q) ? q : 0;
    }
  }
  return 0;
}

export async function orquestrarCriacaoProcessoComum(
  payload,
  onProgress = () => {},
) {
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (!itens.length) throw new Error("Nenhum item informado em payload.itens");
  const todasSecretarias = Array.isArray(payload.secretariasParticipantes)
    ? payload.secretariasParticipantes
    : [];
  if (!todasSecretarias.length) {
    throw new Error("Nenhuma secretaria participante informada.");
  }
  const gerenciadoraChave = String(payload.gerenciadora_chave || "").trim();
  const gerenciadoraNumero = Number(payload.gerenciadora_numero || 0);
  const secretariaGerenciadora =
    todasSecretarias.find((s) => chaveSecretaria(s) === gerenciadoraChave) ||
    todasSecretarias.find((s) => Number(s.numero) === gerenciadoraNumero) ||
    todasSecretarias[0];

  // Ordena: gerenciadora primeiro, demais depois.
  const ordenadas = [
    secretariaGerenciadora,
    ...todasSecretarias.filter(
      (s) => chaveSecretaria(s) !== chaveSecretaria(secretariaGerenciadora),
    ),
  ];

  const erros = [];
  const dfdsCriadas = []; // [{ sec, dfdId, itensInseridos: [{descricao, qty}] }]

  // 1. Loop de criação de DFDs por secretaria
  for (let i = 0; i < ordenadas.length; i++) {
    const sec = ordenadas[i];
    const rotulo = sec.sigla || sec.nome || `sec#${sec.numero}`;
    const baseProg = 2 + (i / ordenadas.length) * 60;
    onProgress({
      etapa: "criar_dfd_secretaria",
      mensagem: `Criando DFD de ${rotulo} (${i + 1}/${ordenadas.length})…`,
      progresso: baseProg,
      payload: { secretaria: rotulo, atual: i + 1, total: ordenadas.length },
    });

    const orgaoSec = String(
      sec.m2a_dot_orgao_id || sec.m2a_orgao_id || payload.orgao_solicitante || "",
    ).trim();
    const uoSec = String(sec.m2a_uo_id || payload.unidade_orcamentaria || "").trim();
    if (!orgaoSec || !uoSec) {
      const msg = `Secretaria ${rotulo} sem orgao/unidade orçamentária M2A.`;
      console.warn(`[comum] ${msg}`);
      erros.push({ etapa: "criar_dfd_secretaria", secretaria: rotulo, erro: msg });
      continue;
    }

    let dfdId = null;
    try {
      const r = await criarDFDComum({
        objeto: payload.objeto,
        data: payload.data,
        ano_orcamento: payload.ano_orcamento,
        orgao_solicitante: orgaoSec,
        unidade_orcamentaria: uoSec,
        responsavel_dfd:
          sec.responsavel_dfd || payload.responsavel_dfd,
        comissao_planejamento:
          sec.comissao_planejamento || payload.comissao_planejamento,
      });
      dfdId = r.dfdId;
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[comum] DFD ${rotulo} falhou: ${msg}`);
      erros.push({ etapa: "criar_dfd_secretaria", secretaria: rotulo, erro: msg });
      continue;
    }

    // 2. Itens da secretaria
    const itensInseridos = [];
    for (let j = 0; j < itens.length; j++) {
      const item = itens[j];
      const qty = quantidadeDoItem(item, sec, [gerenciadoraChave]);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      onProgress({
        etapa: "incluir_itens",
        mensagem: `${rotulo}: item ${j + 1}/${itens.length} (${String(item.descricao || "").slice(0, 50)})`,
        progresso: baseProg + (j / itens.length) * (60 / ordenadas.length) * 0.6,
        payload: { secretaria: rotulo, atual: j + 1, total: itens.length },
      });
      try {
        await criarItemEAdicionarNaDFD({
          dfdGerenciadoraId: dfdId,
          descricao: item.descricao,
          especificacao: item.especificacao,
          natureza: item.natureza,
          unidade: item.unidade,
          quantidadeGerenciadora: qty,
        });
        itensInseridos.push({ descricao: String(item.descricao || ""), qty });
      } catch (err) {
        const msg = String(err?.message ?? err);
        console.error(`[comum] ${rotulo} item #${j + 1}: ${msg}`);
        erros.push({
          etapa: "incluir_itens",
          secretaria: rotulo,
          item: j + 1,
          erro: msg,
        });
      }
    }

    // 3. Dotação (best-effort)
    // Aceita tanto o ID Django numérico cadastrado na secretaria (m2a_dot_id —
    // padrão usado pelo fluxo de contratos) quanto aliases legados.
    const despesaProjeto =
      sec.m2a_dot_id ||
      sec.m2a_despesa_projeto_id ||
      sec.despesa_projeto_atividade ||
      null;
    if (despesaProjeto) {
      onProgress({
        etapa: "cadastrar_dotacao",
        mensagem: `${rotulo}: cadastrando dotação…`,
        progresso: baseProg + (60 / ordenadas.length) * 0.85,
      });
      try {
        await cadastrarDotacao({
          dfdId,
          unidadeOrcamentaria: uoSec,
          despesaProjetoAtividade: despesaProjeto,
        });
      } catch (err) {
        const msg = String(err?.message ?? err);
        console.error(`[comum] dotação ${rotulo}: ${msg}`);
        erros.push({ etapa: "cadastrar_dotacao", secretaria: rotulo, erro: msg });
      }
    } else {
      console.log(
        `[comum] ${rotulo}: sem m2a_dot_id na secretaria — dotação pulada.`,
      );
    }

    dfdsCriadas.push({ sec, dfdId, itensInseridos });
  }

  const dfdGer = dfdsCriadas.find(
    (d) => chaveSecretaria(d.sec) === chaveSecretaria(secretariaGerenciadora),
  );
  if (!dfdGer) {
    throw new Error(
      "DFD da gerenciadora não foi criada — abortando geração do processo.",
    );
  }
  const outrasDfds = dfdsCriadas
    .filter((d) => d !== dfdGer)
    .map((d) => d.dfdId);

  // 4. Gerar processo a partir da DFD da gerenciadora
  onProgress({
    etapa: "gerar_processo",
    mensagem: "Gerando processo administrativo a partir da DFD gerenciadora…",
    progresso: 68,
  });
  await gerarProcessoFromDFD(dfdGer.dfdId);

  // 5. Descobre processoId/numero
  onProgress({
    etapa: "descobrir_processo",
    mensagem: "Descobrindo número do processo gerado…",
    progresso: 74,
  });
  let processoId = null;
  let numeroProcesso = null;
  try {
    const d = await descobrirProcessoDaDFD(dfdGer.dfdId);
    processoId = d.processoId;
    numeroProcesso = d.numero;
  } catch (err) {
    // fallback: tabela de DFDs (mesma lógica do SRP)
    console.warn(`[comum] fallback capturarIdsProcesso: ${err?.message ?? err}`);
    const c = await capturarIdsProcesso({
      objeto: payload.objeto,
      dfdId: dfdGer.dfdId,
    });
    processoId = c.processoId;
    numeroProcesso = c.numero;
  }

  // 6. Atualiza processo administrativo (reaproveita SRP — flags do
  // registro de preço viram inertes quando a DFD não é SRP).
  onProgress({
    etapa: "atualizar_processo",
    mensagem: `Atualizando processo ${processoId}…`,
    progresso: 80,
    payload: { processoId, dfdId: dfdGer.dfdId, numero: numeroProcesso },
  });
  await atualizarProcesso(processoId, {
    numero: numeroProcesso || payload.numero,
    objeto: payload.objeto,
    data_processo: payload.data,
    classificacao: payload.classificacao,
    unidade_orcamentaria_gerenciadora:
      payload.unidade_orcamentaria_gerenciadora || payload.unidade_orcamentaria,
  });

  // 7. Vincula demais DFDs ao processo
  if (outrasDfds.length) {
    onProgress({
      etapa: "vincular_dfds",
      mensagem: `Vinculando ${outrasDfds.length} DFD(s) ao processo…`,
      progresso: 88,
    });
    try {
      await vincularDFDsAoProcesso(processoId, outrasDfds);
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[comum] vincular DFDs: ${msg}`);
      erros.push({ etapa: "vincular_dfds", erro: msg });
    }
  }

  // 8. Reordena itens conforme ordem da planilha (master list)
  onProgress({
    etapa: "reordenar_itens",
    mensagem: "Reordenando itens do processo…",
    progresso: 93,
  });
  try {
    const descricoes = itens.map((i) => String(i.descricao || ""));
    const r = await reordenarItensProcesso(processoId, descricoes);
    console.log(`[comum] reordenados=${r.reordenados}`);
  } catch (err) {
    const msg = String(err?.message ?? err);
    console.error(`[comum] reordenar itens: ${msg}`);
    erros.push({ etapa: "reordenar_itens", erro: msg });
  }

  // 9. Justificativa Gemini
  let justificativaGerada = false;
  try {
    onProgress({
      etapa: "justificativa",
      mensagem: "Gerando justificativa via IA…",
      progresso: 97,
    });
    const texto = await gerarJustificativaGemini({
      objeto: payload.objeto,
      eRegistroPreco: false,
      itens: itens.map((i) => String(i.descricao || "")).filter(Boolean),
      secretarias: ordenadas.map((s) => s.sigla || s.nome).filter(Boolean),
    });
    await atualizarJustificativaM2A(dfdGer.dfdId, texto);
    justificativaGerada = true;
  } catch (err) {
    const msg = String(err?.message ?? err);
    console.error(`[comum] justificativa: ${msg}`);
    erros.push({ etapa: "justificativa", erro: msg });
  }

  onProgress({
    etapa: "concluido",
    mensagem: erros.length
      ? `Processo comum criado com ${erros.length} aviso(s).`
      : "Processo comum criado com sucesso.",
    progresso: 100,
    payload: {
      processoId,
      dfdId: dfdGer.dfdId,
      dfdsParticipantes: outrasDfds,
      erros,
      totalDfds: dfdsCriadas.length,
      totalItens: itens.length,
      justificativaGerada,
    },
  });

  return {
    processoId,
    dfdId: dfdGer.dfdId,
    dfdsParticipantes: outrasDfds,
    totalDfds: dfdsCriadas.length,
    totalItens: itens.length,
    justificativaGerada,
    erros,
  };
}
