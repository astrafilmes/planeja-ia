// Orquestrador equivalente a processarContratoCompleto.
// Emite eventos via callback `onProgress(etapa, mensagem, extra)`.

import { assertNumericId } from "./utils.js";
import {
  buscarIdContratoPorNumero, criarCabecalhoContrato,
  vincularFiscal, vincularGestor, vincularPreposto,
  adicionarItensAoContrato, atualizarQuantidadesItens,
  incluirDotacao, configurarDocumentos,
} from "./contrato.js";
import { saldosPorSecretaria, invalidateSaldoAtaCache } from "./atas-saldos-por-secretaria.js";
import { normSec } from "./norm-sec.js";

function logTable(label, rows, limit = 500) {
  const list = Array.isArray(rows) ? rows : [];
  console.log(`[m2a-orq-contrato] ${label}: ${list.length} registro(s)`);
  if (!list.length) return;
  console.table(list.slice(0, limit));
  if (list.length > limit) {
    console.log(`[m2a-orq-contrato] ${label}: ${list.length - limit} registro(s) omitidos`);
  }
}

function shortText(value, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractProcessoIdFromUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/\/processo_administrativo\/(\d+)\/?/)?.[1] ?? null;
}

export async function processarContratoCompleto(payload, onProgress = () => {}) {
  const { contratoId, m2aProcessoUrl, m2aAtaId, contrato, dadosM2A, itens, dadosDotacao } = payload;
  const numeroContrato = contrato?.numero_contrato || contrato?.numero;

  console.group(`[m2a-orq-contrato] iniciar contrato local=${contratoId} número=${numeroContrato}`);
  console.log("[m2a-orq-contrato] payload recebido:", {
    contratoId,
    numeroContrato,
    m2aProcessoUrl,
    m2aAtaId,
    m2a_contrato_id: contrato?.m2a_contrato_id,
    data: contrato?.data,
    data_fim: contrato?.data_fim,
    unidade_gestora: dadosM2A?.unidade_gestora,
    fiscal_id: dadosM2A?.fiscal_id,
    gestor_id: dadosM2A?.gestor_id,
    preposto_id: dadosM2A?.preposto_id,
    preposto_nome: dadosM2A?.preposto_nome ?? contrato?.preposto,
    dotacao: dadosDotacao ?? dadosM2A?.dotacao ?? null,
    totalItens: (itens ?? dadosM2A?.itens ?? []).length,
  });
  logTable(
    "itens recebidos para envio ao portal",
    (itens ?? dadosM2A?.itens ?? []).map((item, index) => ({
      index,
      numero: item?.numero ?? item?.numero_item,
      ordem_item: item?.ordem_item,
      m2a_item_id: item?.m2a_item_id,
      ata_item_id: item?.ata_item_id ?? item?.m2a_ata_item_id ?? item?.ataItemId,
      quantidade: item?.quantidade,
      descricao: shortText(item?.descricao ?? item?.especificacao, 180),
    })),
  );

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
    } catch (err) {
      // Sinal fraco: erro de rede/HTTP durante a busca. Só ignoramos
      // "not found"; qualquer outra falha vira erro para evitar duplicar
      // contrato caso ele já exista no portal.
      const msg = String(err?.message || err || "");
      if (!/not\s*found|404|nenhum registro/i.test(msg)) {
        console.warn(`[m2a-orq-contrato] busca por número falhou: ${msg}`);
        throw new Error(`Falha ao verificar contrato existente na M2A: ${msg}`);
      }
      // 404/nenhum → segue e cria abaixo
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

  // Revalidação de saldo em tempo real ANTES de escrever quantidades.
  // Fecha a janela de corrida entre "Validar" (front, cache 60s) e "Autorizar".
  // Se algum item exceder o saldo, aborta com erro tipado — o front pode
  // reabrir a validação e o usuário ajusta manualmente.
  const secretariaNome = String(dadosM2A?.secretaria_nome ?? "").trim();
  if (secretariaNome && itensPayload.length > 0) {
    try {
      invalidateSaldoAtaCache(m2aAtaId);
      const saldos = await saldosPorSecretaria(m2aAtaId, {
        forceRefresh: true,
        processoId: extractProcessoIdFromUrl(m2aProcessoUrl),
      });
      const secKey = normSec(secretariaNome);
      const sec = saldos.secretarias.find((s) => s.secretariaKey === secKey);
      if (!sec) {
        console.warn(
          `[m2a-orq-contrato] revalidação: secretaria "${secretariaNome}" (key="${secKey}") não encontrada entre participantes da ata ${m2aAtaId}`,
        );
      } else {
        const excedentes = [];
        for (const it of itensPayload) {
          const numero = String(it.numero ?? it.numero_item ?? "").trim();
          if (!numero) continue;
          const qtdEnviada = Number(String(it.quantidade ?? "0").replace(/\./g, "").replace(",", "."));
          const hit = sec.itens.find((x) => String(x.numero) === numero);
          if (!hit || hit.saldo == null) continue;
          if (qtdEnviada > hit.saldo + 1e-6) {
            excedentes.push({
              numero,
              descricao: hit.descricao,
              qtdEnviada,
              saldo: hit.saldo,
              cota: hit.cota,
              consumido: hit.consumido,
            });
          }
        }
        if (excedentes.length > 0) {
          console.error("[m2a-orq-contrato] SALDO_INSUFICIENTE_RUNTIME", excedentes);
          const err = new Error(
            `Saldo insuficiente em ${excedentes.length} item(s) no momento do envio. ` +
              `Refaça a validação e ajuste as quantidades.`,
          );
          err.code = "SALDO_INSUFICIENTE_RUNTIME";
          err.excedentes = excedentes;
          throw err;
        }
      }
    } catch (err) {
      if (err?.code === "SALDO_INSUFICIENTE_RUNTIME") throw err;
      console.warn(`[m2a-orq-contrato] revalidação de saldo falhou (segue mesmo assim): ${err?.message || err}`);
    }
  }

  progress("atualizar_quantidades", "Módulo 5: Atualizando quantidades dos itens...");
  const qtdResult = await atualizarQuantidadesItens(m2aInternalId, itensPayload);
  coletarAvisos("atualizar_quantidades", qtdResult?.avisos);

  // Ao concluir com sucesso um contrato, invalida o cache da ata para
  // que a próxima validação enxergue o novo consumo.
  invalidateSaldoAtaCache(m2aAtaId);

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

  console.log("[m2a-orq-contrato] concluído", {
    contratoId,
    numeroContrato,
    m2a_contrato_id: m2aInternalId,
    documentos: documentosResult.documentosM2A?.length ?? 0,
    avisos,
  });
  console.groupEnd();
  return { m2a_contrato_id: m2aInternalId, documentosM2A: documentosResult.documentosM2A ?? [], avisos };
}
