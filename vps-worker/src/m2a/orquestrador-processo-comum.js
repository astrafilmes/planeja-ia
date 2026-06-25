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

// Normaliza string para detectar duplicatas que o M2A bloqueia
// ("Já existe um item com o mesmo produto/serviço e unidade de fornecimento").
function chaveProdutoUnidade(item) {
  const norm = (v) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return `${norm(item?.descricao)}||${norm(item?.unidade)}`;
}

// Agrupa itens com mesmo (produto+unidade) somando quantidades.
// Mantém a ordem da primeira ocorrência e preserva os demais campos do primeiro item.
function dedupItensParaSecretaria(itens, sec) {
  const grupos = new Map(); // chave -> { item, qty, indices:[] }
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const qty = quantidadeDoItem(item, sec);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const k = chaveProdutoUnidade(item);
    const ex = grupos.get(k);
    if (ex) {
      ex.qty += qty;
      ex.indices.push(i + 1);
    } else {
      grupos.set(k, { item, qty, indices: [i + 1] });
    }
  }
  return Array.from(grupos.values());
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
      const qty = quantidadeDoItem(item, sec);
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

  // 7. Vincula TODAS as DFDs (inclusive a da gerenciadora — safety net, caso
  //    o gerar_processo crie a casca sem puxar os itens) ao processo.
  const todasDfds = [dfdGer.dfdId, ...outrasDfds];
  onProgress({
    etapa: "vincular_dfds",
    mensagem: `Vinculando ${todasDfds.length} DFD(s) ao processo…`,
    progresso: 88,
  });
  try {
    await vincularDFDsAoProcesso(processoId, todasDfds);
  } catch (err) {
    const msg = String(err?.message ?? err);
    console.error(`[comum] vincular DFDs: ${msg}`);
    erros.push({ etapa: "vincular_dfds", erro: msg });
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

  // 9. Justificativa Gemini — uma para CADA DFD criada (cada secretaria
  //    precisa ter sua justificativa preenchida no portal).
  let justificativaGerada = false;
  let justificativasOk = 0;
  onProgress({
    etapa: "justificativa",
    mensagem: `Gerando justificativas (${dfdsCriadas.length} DFDs)…`,
    progresso: 96,
  });
  for (let k = 0; k < dfdsCriadas.length; k++) {
    const d = dfdsCriadas[k];
    const rotulo = d.sec.sigla || d.sec.nome || `sec#${d.sec.numero}`;
    try {
      const texto = await gerarJustificativaGemini({
        objeto: payload.objeto,
        eRegistroPreco: false,
        itens: itens.map((i) => String(i.descricao || "")).filter(Boolean),
        secretarias: [rotulo],
      });
      await atualizarJustificativaM2A(d.dfdId, texto);
      justificativasOk++;
      if (d === dfdGer) justificativaGerada = true;
      console.log(`[comum] justificativa OK para DFD ${d.dfdId} (${rotulo})`);
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[comum] justificativa ${rotulo} (DFD ${d.dfdId}): ${msg}`);
      erros.push({ etapa: "justificativa", secretaria: rotulo, erro: msg });
    }
  }
  console.log(
    `[comum] justificativas: ${justificativasOk}/${dfdsCriadas.length} concluídas`,
  );

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
