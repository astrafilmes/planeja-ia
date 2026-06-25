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
import { gerarJustificativaM2A } from "./justificativa-m2a.js";


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

function ensureNotAborted(signal) {
  if (signal?.aborted) {
    const e = new Error("Operação cancelada pelo usuário.");
    e.code = "ABORTED";
    throw e;
  }
}

export async function orquestrarCriacaoProcessoComum(
  payload,
  onProgress = () => {},
  signal,
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
    ensureNotAborted(signal);
    const sec = ordenadas[i];
    const rotulo = sec.sigla || sec.nome || `sec#${sec.numero}`;
    const baseProg = 2 + (i / ordenadas.length) * 60;
    // Pré-calcula grupos para mostrar quantos itens a secretaria vai receber
    const gruposPreview = dedupItensParaSecretaria(itens, sec);
    onProgress({
      etapa: "criar_dfd_secretaria",
      mensagem: `Criando DFD de ${rotulo} (${i + 1}/${ordenadas.length}) — ${gruposPreview.length} item(ns)`,
      progresso: baseProg,
      payload: {
        secretaria: rotulo,
        atual: i + 1,
        total: ordenadas.length,
        itensPlanejados: gruposPreview.length,
      },
    });

    // IMPORTANTE: o "orgao_solicitante" da DFD é a Unidade Gestora (m2a_orgao_id),
    // NÃO o Órgão da Dotação (m2a_dot_orgao_id). Inverter quebra quando a secretaria
    // usa dotação de outro órgão (ex.: SMA com dotação sob Cultura).
    const orgaoSec = String(
      sec.m2a_orgao_id || sec.m2a_dot_orgao_id || payload.orgao_solicitante || "",
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
      onProgress({
        etapa: "dfd_criada",
        mensagem: `DFD ${dfdId} criada para ${rotulo}`,
        progresso: baseProg + 1,
        payload: { secretaria: rotulo, dfdId },
      });
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[comum] DFD ${rotulo} falhou: ${msg}`);
      erros.push({ etapa: "criar_dfd_secretaria", secretaria: rotulo, erro: msg });
      continue;
    }

    // 2. Itens da secretaria — dedupe por (produto+unidade)
    const grupos = gruposPreview;
    // LOG: lista exatamente o que vai ser inserido nesta DFD para diagnóstico
    console.log(
      `[comum] DFD ${dfdId} (${rotulo}) — ${grupos.length} item(ns) a inserir:` +
        grupos
          .map(
            (g) =>
              `\n  · IRP#${g.indices.join("/")} qty=${g.qty} "${String(g.item.descricao || "").slice(0, 80)}"`,
          )
          .join(""),
    );
    const itensInseridos = [];
    for (let j = 0; j < grupos.length; j++) {
      ensureNotAborted(signal);
      const { item, qty, indices } = grupos[j];
      onProgress({
        etapa: "incluir_itens",
        mensagem: `${rotulo} (DFD ${dfdId}): item ${j + 1}/${grupos.length} — ${String(item.descricao || "").slice(0, 60)}`,
        progresso: baseProg + (j / grupos.length) * (60 / ordenadas.length) * 0.6,
        payload: {
          secretaria: rotulo,
          dfdId,
          atual: j + 1,
          total: grupos.length,
          descricao: item.descricao,
          qty,
        },
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
        itensInseridos.push({
          descricao: String(item.descricao || ""),
          qty,
          origens: indices,
        });
      } catch (err) {
        const msg = String(err?.message ?? err);
        const origemTxt = indices.length > 1 ? ` (origens IRP #${indices.join(",")})` : ` (origem IRP #${indices[0]})`;
        console.error(`[comum] ${rotulo} item ${j + 1}/${grupos.length}${origemTxt}: ${msg}`);
        erros.push({
          etapa: "incluir_itens",
          secretaria: rotulo,
          item: j + 1,
          origens_irp: indices,
          erro: msg,
        });
      }
    }


    // 3. Dotação (best-effort)
    const despesaProjeto =
      sec.m2a_dot_id ||
      sec.m2a_despesa_projeto_id ||
      sec.despesa_projeto_atividade ||
      null;
    if (despesaProjeto) {
      ensureNotAborted(signal);
      onProgress({
        etapa: "cadastrar_dotacao",
        mensagem: `${rotulo} (DFD ${dfdId}): cadastrando dotação…`,
        progresso: baseProg + (60 / ordenadas.length) * 0.85,
        payload: { secretaria: rotulo, dfdId },
      });
      try {
        await cadastrarDotacao({
          dfdId,
          unidadeOrcamentaria: uoSec,
          despesaProjetoAtividade: despesaProjeto,
          despesaProjetoNumero:
            sec.m2a_dot_numero || sec.m2a_despesa_projeto_numero || null,
          despesaProjetoDescricao:
            sec.m2a_dot_descricao || sec.m2a_despesa_projeto_descricao || null,
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
  ensureNotAborted(signal);
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

  // 7. Vincula TODAS as DFDs ao processo — 1 POST por DFD (CSV não funciona
  //    no portal: persiste só a primeira).
  ensureNotAborted(signal);
  const todasDfds = [dfdGer.dfdId, ...outrasDfds];
  onProgress({
    etapa: "vincular_dfds",
    mensagem: `Vinculando ${todasDfds.length} DFD(s) ao processo ${processoId}…`,
    progresso: 88,
    payload: { total: todasDfds.length, dfdIds: todasDfds },
  });
  try {
    const r = await vincularDFDsAoProcesso(processoId, todasDfds, (i, total, dfdId) => {
      onProgress({
        etapa: "vincular_dfd",
        mensagem: `Vinculando DFD ${dfdId} (${i + 1}/${total})…`,
        progresso: 88 + ((i + 1) / total) * 3,
        payload: { dfdId, atual: i + 1, total },
      });
    });
    if (r.falhas?.length) {
      erros.push({
        etapa: "vincular_dfds",
        erro: `Falhas em ${r.falhas.length}/${todasDfds.length} DFD(s)`,
        detalhes: r.falhas,
      });
    }
    console.log(
      `[comum] vinculadas=${r.vinculadas}/${todasDfds.length} falhas=${r.falhas?.length || 0}`,
    );
  } catch (err) {
    const msg = String(err?.message ?? err);
    console.error(`[comum] vincular DFDs: ${msg}`);
    erros.push({ etapa: "vincular_dfds", erro: msg });
  }

  // 8. Reordena itens conforme ordem da planilha (master list)
  ensureNotAborted(signal);
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

  // 9. Justificativa — GERA UMA ÚNICA justificativa GENÉRICA (sem citar
  //    secretaria específica) e reaproveita em TODAS as DFDs. Evita gastar
  //    minutos esperando a IA nativa do M2A para cada DFD individualmente.
  //
  //    Estratégia:
  //      a) Tenta a IA nativa do M2A na primeira DFD com janela curta de
  //         polling (~30s). Se vier, ótimo — usa o texto retornado.
  //      b) Se falhar/exceder tempo, gera via Gemini com prompt GENÉRICO
  //         (sem `secretarias`, sem nomes próprios), que cai para o
  //         fallback textual caso a chave não exista.
  //      c) Faz POST em /atualizar_justificativa/ para cada DFD em paralelo.
  let justificativaGerada = false;
  let justificativasOk = 0;
  let htmlJustificativaGenerica = null;

  onProgress({
    etapa: "justificativa",
    mensagem: `Gerando justificativa genérica (única para todas as DFDs)…`,
    progresso: 95,
    payload: { total: dfdsCriadas.length },
  });

  // (a) tenta IA nativa M2A na primeira DFD, com polling curto
  try {
    htmlJustificativaGenerica = await gerarJustificativaM2A(dfdsCriadas[0].dfdId, {
      tentativas: 1,
      pollMaxMs: 30_000,
      pollMs: 5_000,
      timeoutMs: 60_000,
      signal,
    });
    console.log(
      `[comum] justificativa GENÉRICA obtida via IA nativa M2A (${htmlJustificativaGenerica.length} chars)`,
    );
  } catch (errMia) {
    console.warn(
      `[comum] IA nativa M2A não retornou a tempo: ${errMia?.message || errMia} — gerando via Gemini (genérica).`,
    );
  }

  // (b) fallback Gemini — SEM citar secretarias específicas
  if (!htmlJustificativaGenerica) {
    try {
      htmlJustificativaGenerica = await gerarJustificativaGemini({
        objeto: payload.objeto,
        eRegistroPreco: false,
        itens: itens.map((i) => String(i.descricao || "")).filter(Boolean),
        secretarias: [], // <- genérico, sem nomes
      });
      console.log(
        `[comum] justificativa GENÉRICA obtida via Gemini (${htmlJustificativaGenerica.length} chars)`,
      );
    } catch (errGem) {
      console.error(
        `[comum] falha total ao gerar justificativa genérica: ${errGem?.message || errGem}`,
      );
      erros.push({ etapa: "justificativa", erro: String(errGem?.message || errGem) });
    }
  }

  // (c) aplica a mesma justificativa em TODAS as DFDs (em paralelo, com limite leve)
  if (htmlJustificativaGenerica) {
    const tarefas = dfdsCriadas.map((d, k) => async () => {
      ensureNotAborted(signal);
      const rotulo = d.sec.sigla || d.sec.nome || `sec#${d.sec.numero}`;
      onProgress({
        etapa: "justificativa",
        mensagem: `Aplicando justificativa ${k + 1}/${dfdsCriadas.length} — DFD ${d.dfdId} (${rotulo})`,
        progresso: 96 + ((k + 1) / dfdsCriadas.length) * 3,
        payload: { dfdId: d.dfdId, secretaria: rotulo, atual: k + 1, total: dfdsCriadas.length },
      });
      try {
        await atualizarJustificativaM2A(d.dfdId, htmlJustificativaGenerica);
        justificativasOk++;
        if (d === dfdGer) justificativaGerada = true;
        console.log(`[comum] justificativa aplicada em DFD ${d.dfdId} (${rotulo})`);
      } catch (err) {
        const msg = String(err?.message ?? err);
        console.error(`[comum] aplicar justificativa ${rotulo} (DFD ${d.dfdId}): ${msg}`);
        erros.push({ etapa: "justificativa", secretaria: rotulo, erro: msg });
      }
    });
    // executa em série leve (2 por vez) para não martelar o M2A
    const LIMITE = 2;
    for (let i = 0; i < tarefas.length; i += LIMITE) {
      await Promise.all(tarefas.slice(i, i + LIMITE).map((fn) => fn()));
    }
  }
  console.log(
    `[comum] justificativas: ${justificativasOk}/${dfdsCriadas.length} aplicadas (texto único)`,
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
