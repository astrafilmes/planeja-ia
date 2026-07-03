// =====================================================================
// Orquestrador: cria o Processo SRP no portal M2A SEM importar Excel.
//
// Fluxo:
//   1. Cria DFD da Gerenciadora                    (criarDFD)
//   2. Captura IDs (dfdId, processoId, numero)     (capturarIdsProcesso)
//   3. Atualiza Processo Administrativo            (atualizarProcesso)
//   4. Para cada item:
//        a. Cadastra item temporário (PASSO 1)
//        b. Lê unidade_fornecimento (helper)
//        c. Inclui item na DFD gerenciadora c/ qty da gerenciadora (PASSO 2)
//   5. Dispara geração das intenções               (PASSO 3)
//   6. Lista intenções                              (PASSO 4)
//   7. Para cada intenção (= 1 secretaria participante):
//        7a. disponibilizar + manifestar           (PASSOS 5.1/5.2)
//        7b. lista itens da intenção                (PASSO 6)
//        7c. para cada item: atualizar quantidade   (PASSO 7)
//        7d. finalizar + consolidar                 (PASSOS 8.1/8.2)
// =====================================================================

import {
  criarDFD,
  capturarIdsProcesso,
  atualizarProcesso,
} from "./processo-srp.js";
import { reordenarItensProcesso } from "./processo-comum.js";
import {
  criarItemEAdicionarNaDFD,
  gerarIntencoes,
  listarIntencoes,
  listarItensDFD,
  disponibilizarIntencao,
  manifestarInteresse,
  listarItensIntencao,
  atualizarQuantidadeItem,
  finalizarParaConsolidacao,
  consolidarIntencao,
  obterUnidadeOrcamentariaDaIntencao,
} from "./irp-api.js";
import {
  gerarJustificativaM2A,
  atualizarJustificativaM2A,
  justificativaFallback,
} from "./justificativa-m2a.js";



function chaveSecretaria(sec) {
  if (sec?.chave) return String(sec.chave);
  if (sec?.m2a_uo_id) return `uo:${String(sec.m2a_uo_id).trim()}`;
  if (sec?.ref_coluna !== undefined && sec?.ref_coluna !== null) return `ref:${sec.ref_coluna}`;
  return String(sec?.numero ?? "");
}

function quantidadeDoItem(item, sec, chavesExtras = []) {
  const quantidades = item?.quantidades ?? {};
  const chaves = [chaveSecretaria(sec), ...chavesExtras, String(sec?.numero ?? "")].filter(Boolean);
  for (const chave of chaves) {
    if (Object.prototype.hasOwnProperty.call(quantidades, chave)) {
      const q = Number(quantidades[chave] ?? 0);
      return Number.isFinite(q) ? q : 0;
    }
  }
  return 0;
}

/**
 * @param {object} payload
 *   {
 *     objeto, data, ano_orcamento,
 *     orgao_solicitante, unidade_orcamentaria, unidade_orcamentaria_gerenciadora,
 *     responsavel_dfd, comissao_planejamento, classificacao,
 *     gerenciadora_numero,                  // numero da secretaria gerenciadora
 *     itens: [                              // master list (uma entrada por item)
 *       {
 *         descricao, especificacao, natureza, unidade, valorReferencia,
 *         quantidades: { [numero_secretaria]: number }   // por numero da secretaria
 *       }
 *     ],
 *     secretariasParticipantes: [           // todas (gerenciadora INCLUSIVE)
 *       { numero, sigla, nome, m2a_orgao_id }
 *     ]
 *   }
 */
export async function orquestrarCriacaoProcesso(payload, onProgress = () => {}) {
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (!itens.length) throw new Error("Nenhum item informado em payload.itens");
  const gerenciadoraNumero = Number(payload.gerenciadora_numero);
  if (!gerenciadoraNumero) {
    throw new Error("gerenciadora_numero obrigatório (numero da secretaria gerenciadora).");
  }
  const gerenciadoraChave = String(payload.gerenciadora_chave || "").trim();
  const todasSecretarias = Array.isArray(payload.secretariasParticipantes)
    ? payload.secretariasParticipantes
    : [];
  const participantes = todasSecretarias.filter(
    (s) => gerenciadoraChave ? chaveSecretaria(s) !== gerenciadoraChave : Number(s.numero) !== gerenciadoraNumero,
  );
  const secretariaGerenciadora = todasSecretarias.find((s) => chaveSecretaria(s) === gerenciadoraChave) ||
    todasSecretarias.find((s) => Number(s.numero) === gerenciadoraNumero) ||
    { numero: gerenciadoraNumero, chave: gerenciadoraChave };

  // 1. DFD
  onProgress({ etapa: "criar_dfd", mensagem: "Criando DFD da Gerenciadora…", progresso: 4 });
  const { dfdId: dfdCriadaId } = await criarDFD({
    objeto: payload.objeto,
    data: payload.data,
    ano_orcamento: payload.ano_orcamento,
    orgao_solicitante: payload.orgao_solicitante,
    unidade_orcamentaria: payload.unidade_orcamentaria,
    responsavel_dfd: payload.responsavel_dfd,
    comissao_planejamento: payload.comissao_planejamento,
  });

  // 2. capturar IDs
  onProgress({
    etapa: "buscar_ids",
    mensagem: "Localizando IDs da DFD e do processo…",
    progresso: 10,
  });
  const { dfdId, processoId, numero: numeroPortal } = await capturarIdsProcesso({
    objeto: payload.objeto,
    dfdId: dfdCriadaId,
  });

  // 3. atualizar Processo Adm
  onProgress({
    etapa: "atualizar_processo",
    mensagem: `Atualizando processo ${processoId}…`,
    progresso: 18,
    payload: { dfdId, processoId, numero: numeroPortal },
  });
  await atualizarProcesso(processoId, {
    numero: numeroPortal || payload.numero,
    objeto: payload.objeto,
    data_processo: payload.data,
    classificacao: payload.classificacao,
    unidade_orcamentaria_gerenciadora:
      payload.unidade_orcamentaria_gerenciadora || payload.unidade_orcamentaria,
  });

  // 4. Inserir itens na DFD gerenciadora
  const erros = [];
  const itensCriados = []; // { input, itemPadronizadoId }
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const qtyGer = quantidadeDoItem(item, secretariaGerenciadora, [gerenciadoraChave]);
    onProgress({
      etapa: "incluir_itens",
      mensagem: `Cadastrando item ${i + 1}/${itens.length}: ${String(item.descricao || "").slice(0, 60)}…`,
      progresso: 20 + (i / Math.max(itens.length, 1)) * 25,
      payload: { itemAtual: i + 1, totalItens: itens.length },
    });
    try {
      const r = await criarItemEAdicionarNaDFD({
        dfdGerenciadoraId: dfdId,
        descricao: item.descricao,
        especificacao: item.especificacao,
        natureza: item.natureza,
        unidade: item.unidade,
        quantidadeGerenciadora: qtyGer,
      });
      itensCriados.push({ input: item, ...r });
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[irp] falha item #${i + 1}: ${msg}`);
      erros.push({ etapa: "incluir_itens", item: i + 1, erro: msg });
    }
  }
  if (!itensCriados.length) {
    throw new Error(
      `Nenhum item conseguiu ser cadastrado. Erros: ${JSON.stringify(erros).slice(0, 500)}`,
    );
  }
  const itensConfirmadosDFD = await listarItensDFD(dfdId);
  if (itensConfirmadosDFD.length < itensCriados.length) {
    throw new Error(
      `Itens não foram vinculados à DFD ${dfdId}: portal mostra ${itensConfirmadosDFD.length}, esperado ${itensCriados.length}. Abortando antes de gerar IRP.`,
    );
  }

  // 5. Gerar intenções
  onProgress({
    etapa: "gerar_intencoes",
    mensagem: "Gerando intenções para as participantes…",
    progresso: 48,
  });
  await gerarIntencoes(dfdId);

  // 6. Listar intenções
  onProgress({
    etapa: "listar_intencoes",
    mensagem: "Listando intenções geradas…",
    progresso: 52,
  });
  const intencoes = await listarIntencoes(dfdId);

  // 7. Para cada intenção: GET na página de edição → extrai
  //    unidade_orcamentaria (ID numérico canônico do Django) → procura a
  //    secretaria participante cujo m2a_uo_id bate. Sem dicionário, sem
  //    fuzzy match. Se não bater nenhuma → ignora; se bater mas a soma de
  //    quantidades for 0 → ignora.
  const participantesPorUoId = new Map();
  const participantesPorOrgaoUoId = new Map();
  for (const sec of participantes) {
    const uo = String(sec.m2a_uo_id || "").trim();
    if (!uo) continue;
    const orgao = String(sec.m2a_orgao_id || sec.m2a_dot_orgao_id || "").trim();
    if (orgao) participantesPorOrgaoUoId.set(`${orgao}:${uo}`, sec);
    if (!participantesPorUoId.has(uo)) participantesPorUoId.set(uo, sec);
  }

  let ignoradasSemMatch = 0;
  let ignoradasSemQuantidade = 0;
  const orfas = [];
  for (let k = 0; k < intencoes.length; k++) {
    const intencao = intencoes[k];

    // 7a. Extrai os IDs canônicos do formulário de edição da IRP.
    let unidadeId = null;
    let orgaoId = null;
    try {
      const ids = await obterUnidadeOrcamentariaDaIntencao(intencao.intencaoId);
      unidadeId = ids.unidadeId;
      orgaoId = ids.orgaoId;
    } catch (err) {
      console.warn(
        `[irp] intenção ${intencao.intencaoId}: falha ao ler UO do formulário → ignorada (${err?.message ?? err}).`,
      );
      orfas.push(intencao.intencaoId);
      continue;
    }

    // 7b. Match direto por orgao+unidade; fallback por unidade para manter compatibilidade.
    const secretaria = unidadeId
      ? (orgaoId ? participantesPorOrgaoUoId.get(`${orgaoId}:${unidadeId}`) : null) ||
        participantesPorUoId.get(String(unidadeId))
      : null;
    if (!secretaria) {
      ignoradasSemMatch++;
      orfas.push(intencao.intencaoId);
      console.log(
        `[irp] intenção ${intencao.intencaoId} (orgao=${orgaoId || "?"} unidade=${unidadeId || "?"}): nenhuma secretaria participante com esse orgao+uo → ignorada.`,
      );
      continue;
    }

    // 7c. Soma quantidades da secretaria.
    const somaQty = itensCriados.reduce((acc, { input }) => {
      const q = quantidadeDoItem(input, secretaria, unidadeId ? [`uo:${unidadeId}`] : []);
      return acc + (Number.isFinite(q) && q > 0 ? q : 0);
    }, 0);
    if (somaQty <= 0) {
      ignoradasSemQuantidade++;
      console.log(
        `[irp] intenção ${intencao.intencaoId} (${secretaria.sigla || secretaria.nome}): todas as quantidades = 0 → ignorada.`,
      );
      continue;
    }

    const rotulo = secretaria.sigla || secretaria.nome;
    const baseProg = 55 + (k / Math.max(intencoes.length, 1)) * 42;
    onProgress({
      etapa: "intencoes",
      mensagem: `Processando ${rotulo} (${k + 1}/${intencoes.length})…`,
      progresso: baseProg,
      payload: { itemAtual: k + 1, totalItens: intencoes.length, sigla: rotulo },
    });
    try {
      await disponibilizarIntencao(intencao.intencaoId);
      await manifestarInteresse(intencao.intencaoId, payload.data);

      const itensIntencao = await listarItensIntencao(intencao.intencaoId);
      if (!itensIntencao.length) {
        throw new Error(
          `intenção ${intencao.intencaoId} não recebeu itens da DFD ${dfdId}; não vou finalizar uma IRP vazia.`,
        );
      }
      if (itensIntencao.length !== itensCriados.length) {
        console.warn(
          `[irp] intencao ${intencao.intencaoId}: ${itensIntencao.length} itens; esperado ${itensCriados.length} (vou alinhar por ordem)`,
        );
      }
      const N = Math.min(itensIntencao.length, itensCriados.length);
      for (let j = 0; j < N; j++) {
        const itemIntencao = itensIntencao[j];
        const original = itensCriados[j].input;
        const qty = quantidadeDoItem(original, secretaria, unidadeId ? [`uo:${unidadeId}`] : []);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        await atualizarQuantidadeItem({
          itemIntencaoId: itemIntencao.itemIntencaoId,
          intencaoId: intencao.intencaoId,
          quantidade: qty,
        });
      }
      await finalizarParaConsolidacao(intencao.intencaoId, payload.data);
      await consolidarIntencao(intencao.intencaoId, payload.data_consolidacao || payload.data);
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[irp] falha na intenção ${intencao.intencaoId} (${rotulo}): ${msg}`);
      erros.push({
        etapa: "intencao",
        intencaoId: intencao.intencaoId,
        secretaria: rotulo,
        erro: msg,
      });
    }
  }
  if (ignoradasSemMatch || ignoradasSemQuantidade) {
    console.log(
      `[irp] resumo: ${ignoradasSemMatch} sem secretaria pareada (orgao+uo), ${ignoradasSemQuantidade} sem quantidade — ignoradas silenciosamente.`,
    );
  }

  // 8. Justificativa da Demanda — MIA! (sem Gemini). Best-effort, ao final.
  let justificativaGerada = false;
  try {
    onProgress({
      etapa: "justificativa",
      mensagem: "Gerando justificativa da demanda via MIA!…",
      progresso: 98,
    });
    let htmlJustificativa = null;
    try {
      htmlJustificativa = await gerarJustificativaM2A(dfdId, { timeoutMs: 90_000 });
    } catch (errMia) {
      console.warn(
        `[justificativa] MIA! falhou (${errMia?.message || errMia}) — usando fallback local.`,
      );
      htmlJustificativa = justificativaFallback(payload.objeto, true);
    }
    await atualizarJustificativaM2A(dfdId, htmlJustificativa);
    justificativaGerada = true;


  } catch (err) {
    const msg = String(err?.message ?? err);
    console.error(`[justificativa] falhou: ${msg}`);
    erros.push({ etapa: "justificativa", erro: msg });
  }

  onProgress({
    etapa: "concluido",
    mensagem: erros.length
      ? `Concluído com ${erros.length} erro(s).`
      : "Processo SRP + IRPs criados via API com sucesso.",
    progresso: 100,
    payload: {
      processoId,
      dfdId,
      erros,
      totalItens: itens.length,
      totalIntencoes: intencoes.length,
      intencoesOrfas: orfas.length,
      justificativaGerada,
    },
  });

  return {
    processoId,
    dfdId,
    erros,
    totalItens: itens.length,
    totalIntencoes: intencoes.length,
    intencoesOrfas: orfas.length,
    justificativaGerada,
  };
}

