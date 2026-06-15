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
  casarIntencoesComSecretarias,
} from "./irp-api.js";

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
  const todasSecretarias = Array.isArray(payload.secretariasParticipantes)
    ? payload.secretariasParticipantes
    : [];
  const participantes = todasSecretarias.filter(
    (s) => Number(s.numero) !== gerenciadoraNumero,
  );

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
    const qtyGer = Number(item?.quantidades?.[gerenciadoraNumero] ?? 0);
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

  // 7. Casa intenção → secretaria participante
  const { matches, orfas } = casarIntencoesComSecretarias(intencoes, participantes);
  if (orfas.length) {
    console.warn(
      `[irp] ${orfas.length} intenção(ões) sem correspondência com secretarias participantes: ${orfas.map((o) => o.intencaoId).join(",")}`,
    );
  }

  // 8. Para cada intenção pareada: disponibilizar + manifestar + setar qty + finalizar + consolidar
  for (let k = 0; k < matches.length; k++) {
    const { intencao, secretaria } = matches[k];
    const baseProg = 55 + (k / Math.max(matches.length, 1)) * 42;
    onProgress({
      etapa: "intencoes",
      mensagem: `Processando ${secretaria.sigla || secretaria.nome} (${k + 1}/${matches.length})…`,
      progresso: baseProg,
      payload: { itemAtual: k + 1, totalItens: matches.length, sigla: secretaria.sigla },
    });
    try {
      await disponibilizarIntencao(intencao.intencaoId);
      await manifestarInteresse(intencao.intencaoId, payload.data);

      // lista itens dessa intenção e bate com ordem dos itens criados
      const itensIntencao = await listarItensIntencao(intencao.intencaoId);
      if (itensIntencao.length !== itensCriados.length) {
        console.warn(
          `[irp] intencao ${intencao.intencaoId}: ${itensIntencao.length} itens; esperado ${itensCriados.length} (vou alinhar por ordem)`,
        );
      }
      if (!itensIntencao.length) {
        throw new Error(
          `intenção ${intencao.intencaoId} não recebeu itens da DFD ${dfdId}; não vou finalizar uma IRP vazia.`,
        );
      }
      const N = Math.min(itensIntencao.length, itensCriados.length);
      for (let j = 0; j < N; j++) {
        const itemIntencao = itensIntencao[j];
        const original = itensCriados[j].input;
        const qty = Number(original?.quantidades?.[secretaria.numero] ?? 0);
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
      console.error(
        `[irp] falha na intenção ${intencao.intencaoId} (${secretaria.sigla}): ${msg}`,
      );
      erros.push({
        etapa: "intencao",
        intencaoId: intencao.intencaoId,
        secretaria: secretaria.sigla,
        erro: msg,
      });
    }
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
      totalIntencoes: matches.length,
      intencoesOrfas: orfas.length,
    },
  });

  return {
    processoId,
    dfdId,
    erros,
    totalItens: itens.length,
    totalIntencoes: matches.length,
    intencoesOrfas: orfas.length,
  };
}
