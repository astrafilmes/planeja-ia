// =====================================================================
// Motor do fluxo de PROCESSO COMUM (não-SRP) no portal M2A.
//
// Diferenças vs. processo-srp.js:
//   - Cada secretaria participante recebe sua PRÓPRIA DFD (não vira IRP).
//   - A DFD NÃO é "registro de preço" (sem is_registro_de_preco=on).
//   - Cada DFD recebe sua dotação via solicitacao_despesa_atividade.
//   - O processo administrativo só nasce DEPOIS, via gerar_processo
//     chamado a partir da DFD da gerenciadora.
//   - Outras DFDs são vinculadas via adicionar_solicitacoes.
//   - Itens do processo são reordenados para refletir a ordem da
//     planilha original.
// =====================================================================

import { m2a } from "../m2a-client.js";
import { loadDoc, sleep, normalizeObjetoCaixaAlta } from "./utils.js";

const DFD_INCLUIR_PATH = "/gestao_compras/formalizacao_demanda/incluir/";
const DFD_TABELA_PATH =
  "/gestao_compras/formalizacao_demanda/tabela/?page_size=1000";
const SOLIC_DESPESA_INCLUIR = (dfdId) =>
  `/gestao_compras/solicitacao_despesa_atividade/incluir/${dfdId}/`;
const GERAR_PROCESSO = (dfdId) =>
  `/gestao_compras/formalizacao_demanda/gerar_processo/${dfdId}/`;
const DFD_DETAIL = (dfdId) =>
  `/gestao_compras/formalizacao_demanda/${dfdId}/?`;
const ADICIONAR_SOLICITACOES = (processoId) =>
  `/processo_administrativo/adicionar_solicitacoes/${processoId}/`;
const TABELA_ITENS_PROCESSO = (processoId) =>
  `/processo_administrativo/item/tabela/${processoId}/?page_size=1000`;
const ALTERAR_SEQUENCIAL_ITEM = (itemId) =>
  `/processo_administrativo/item/alterar_sequencial/${itemId}/`;

// ---------------------------------------------------------------------
// Criação de DFD COMUM (sem is_registro_de_preco)
// ---------------------------------------------------------------------
export async function criarDFDComum(payload) {
  const objeto = normalizeObjetoCaixaAlta(payload.objeto);
  if (!objeto) throw new Error("DFD comum: objeto obrigatório");

  const csrf = await m2a.getCsrf(DFD_INCLUIR_PATH, { force: true });

  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("descricao", objeto);
  body.set("fundamentacao", "2");
  // NOTA: NÃO incluímos is_registro_de_preco.
  body.set("data", String(payload.data || ""));
  body.set("ano_orcamento", String(payload.ano_orcamento || ""));
  body.set("orgao_solicitante", String(payload.orgao_solicitante || ""));
  body.set("unidade_orcamentaria", String(payload.unidade_orcamentaria || ""));
  body.set("responsavel_dfd", String(payload.responsavel_dfd || ""));
  body.set(
    "comissao_planejamento",
    String(payload.comissao_planejamento || ""),
  );
  body.set("_salvar", "");

  const res = await m2a.request("POST", DFD_INCLUIR_PATH, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}${DFD_INCLUIR_PATH}`,
    },
  });

  if (res.status >= 400) {
    throw new Error(`DFD comum: portal retornou status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  const erros = $(".errorlist, .alert-danger, .alert-error")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  if (erros.length) {
    throw new Error(`DFD comum rejeitada: ${erros.join(" | ")}`);
  }

  await sleep(2500);
  const dfdId = String(res.finalUrl || "").match(
    /\/gestao_compras\/formalizacao_demanda\/(\d+)\/?/,
  )?.[1];
  console.log(`[criarDFDComum] dfdId=${dfdId || "NAO_IDENTIFICADO"}`);
  if (!dfdId) {
    // fallback: procura na tabela pelo objeto recém criado
    const t = await m2a.get(DFD_TABELA_PATH);
    const $t = loadDoc(t.html);
    const linhas = $t("tr.kt-datatable__row.tr_solicitacao_despesa").toArray();
    for (const el of linhas) {
      const trId = $t(el).attr("id") || "";
      const m = trId.match(/tr_(\d+)/);
      if (m) return { dfdId: m[1] };
    }
    throw new Error("DFD comum criada mas ID não foi localizado.");
  }
  return { dfdId };
}

// ---------------------------------------------------------------------
// Cadastra dotação (Solicitação de Despesa) numa DFD.
// `despesaProjetoAtividade` é o ID numérico (Django) do projeto/atividade.
// Se não vier preenchido, lança erro para o caller decidir.
// ---------------------------------------------------------------------
export async function cadastrarDotacao({
  dfdId,
  unidadeOrcamentaria,
  despesaProjetoAtividade,
}) {
  if (!dfdId) throw new Error("cadastrarDotacao: dfdId obrigatório");
  if (!unidadeOrcamentaria) {
    throw new Error("cadastrarDotacao: unidadeOrcamentaria obrigatória");
  }
  if (!despesaProjetoAtividade) {
    throw new Error("cadastrarDotacao: despesaProjetoAtividade obrigatória");
  }
  const path = SOLIC_DESPESA_INCLUIR(dfdId);
  const csrf = await m2a.getCsrf(path, { force: true });
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("unidade_orcamentaria", String(unidadeOrcamentaria));
  body.set("despesa_projeto_atividade", String(despesaProjetoAtividade));
  body.set("_salvar", "");
  const res = await m2a.request("POST", path, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}${path}`,
    },
  });
  if (res.status >= 400) {
    throw new Error(`cadastrarDotacao(${dfdId}): status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  const erros = $(".errorlist, .alert-danger, .alert-error, .invalid-feedback")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  // Heurística adicional: se a finalUrl não mudou (continuou em
  // solicitacao_despesa_atividade/incluir) E não há ancora de sucesso, o
  // form não foi aceito — extraímos qualquer mensagem visível.
  const finalUrl = String(res.finalUrl || "");
  const sucessoPorRedirect =
    /formalizacao_demanda\/\d+\/(?:#|$)/.test(finalUrl) ||
    finalUrl.includes("#solicitacao_projeto_atividade");
  if (erros.length) {
    console.error(
      `[cadastrarDotacao] DFD ${dfdId} REJEITADO: ${erros.join(" | ")} (finalUrl=${finalUrl})`,
    );
    throw new Error(`cadastrarDotacao(${dfdId}) rejeitado: ${erros.join(" | ")}`);
  }
  if (!sucessoPorRedirect) {
    // Tenta capturar texto de erro inline (ex.: "Selecione uma opção válida").
    const texto = $("form").text().replace(/\s+/g, " ").trim().slice(0, 300);
    console.warn(
      `[cadastrarDotacao] DFD ${dfdId} sem redirect de sucesso. finalUrl=${finalUrl} payload=despesa_projeto_atividade=${despesaProjetoAtividade} uo=${unidadeOrcamentaria} formText="${texto}"`,
    );
    throw new Error(
      `cadastrarDotacao(${dfdId}): portal não confirmou inclusão (despesa_projeto_atividade=${despesaProjetoAtividade}).`,
    );
  }
  console.log(
    `[cadastrarDotacao] DFD ${dfdId} OK (despesa_projeto_atividade=${despesaProjetoAtividade}, uo=${unidadeOrcamentaria})`,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------
// Dispara geração do Processo Administrativo a partir de uma DFD
// (a DFD da gerenciadora).
// ---------------------------------------------------------------------
export async function gerarProcessoFromDFD(dfdId) {
  if (!dfdId) throw new Error("gerarProcessoFromDFD: dfdId obrigatório");
  const path = GERAR_PROCESSO(dfdId);
  const csrf = await m2a.getCsrf(`/gestao_compras/formalizacao_demanda/${dfdId}/`, {
    force: true,
  });
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  const res = await m2a.request("POST", path, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${m2a.http.defaults.baseURL || ""}/gestao_compras/formalizacao_demanda/${dfdId}/`,
    },
  });
  if (res.status >= 400) {
    throw new Error(`gerarProcessoFromDFD(${dfdId}): status ${res.status}`);
  }
  await sleep(1500);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Lê a página de detalhe da DFD para descobrir o processo administrativo
// recém-criado (ID + número).
// ---------------------------------------------------------------------
export async function descobrirProcessoDaDFD(dfdId) {
  const path = DFD_DETAIL(dfdId);
  const res = await m2a.get(path);
  if (res.status >= 400) {
    throw new Error(`descobrirProcessoDaDFD(${dfdId}): status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  let processoId = null;
  let numero = null;
  $(".kt-widget12__item.m2a-widget12__item a[href*='/processo_administrativo/']").each(
    (_i, el) => {
      if (processoId) return;
      const href = $(el).attr("href") || "";
      const m = href.match(/\/processo_administrativo\/(\d+)/);
      if (m) {
        processoId = m[1];
        numero = $(el).text().replace(/\s+/g, " ").trim();
      }
    },
  );
  if (!processoId) {
    // Fallback: qualquer link de processo_administrativo na página
    $("a[href*='/processo_administrativo/']").each((_i, el) => {
      if (processoId) return;
      const href = $(el).attr("href") || "";
      const m = href.match(/\/processo_administrativo\/(\d+)/);
      if (m) {
        processoId = m[1];
        numero = $(el).text().replace(/\s+/g, " ").trim();
      }
    });
  }
  if (!processoId) {
    throw new Error(
      `descobrirProcessoDaDFD(${dfdId}): processo administrativo não encontrado na página da DFD.`,
    );
  }
  console.log(
    `[descobrirProcessoDaDFD] dfdId=${dfdId} processoId=${processoId} numero="${numero || ""}"`,
  );
  return { processoId, numero: (numero || "").replace(/[^0-9]/g, "") };
}

// ---------------------------------------------------------------------
// Vincula uma lista de DFDs (participantes) ao processo administrativo.
// `dfdIds` deve ser array de IDs numéricos das DFDs a anexar.
// ---------------------------------------------------------------------
export async function vincularDFDsAoProcesso(processoId, dfdIds, onProgress) {
  const ids = (dfdIds || []).map((x) => String(x).trim()).filter(Boolean);
  if (!processoId) throw new Error("vincularDFDsAoProcesso: processoId obrigatório");
  if (!ids.length) {
    console.log(`[vincularDFDsAoProcesso] nenhum DFD para anexar — ignorado.`);
    return { ok: true, vinculadas: 0, falhas: [] };
  }
  const path = ADICIONAR_SOLICITACOES(processoId);
  const referer = `${m2a.http.defaults.baseURL || ""}/processo_administrativo/${processoId}/`;

  // Endpoint do M2A processa de fato 1 DFD por chamada (itens=<id>). Mandar
  // lista CSV retorna 200 mas só persiste o primeiro. Fazemos 1 POST por DFD.
  let vinculadas = 0;
  const falhas = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      if (typeof onProgress === "function") onProgress(i, ids.length, id);
      const csrf = await m2a.getCsrf(`/processo_administrativo/${processoId}/`, {
        force: true,
      });
      const body = new URLSearchParams();
      body.set("csrfmiddlewaretoken", csrf);
      body.set("itens", id);
      const res = await m2a.request("POST", path, {
        body: body.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: referer,
        },
      });
      const bodyTxt = String(res.html || "").slice(0, 300);
      if (res.status >= 400) {
        console.error(
          `[vincularDFDsAoProcesso] DFD ${id} status ${res.status} body="${bodyTxt}"`,
        );
        falhas.push({ dfdId: id, status: res.status, body: bodyTxt });
        continue;
      }
      console.log(
        `[vincularDFDsAoProcesso] DFD ${id} → processo ${processoId} OK (status=${res.status})`,
      );
      vinculadas++;
      await sleep(400);
    } catch (err) {
      const msg = String(err?.message ?? err);
      console.error(`[vincularDFDsAoProcesso] DFD ${id} erro: ${msg}`);
      falhas.push({ dfdId: id, erro: msg });
    }
  }
  return { ok: falhas.length === 0, vinculadas, falhas };
}

// ---------------------------------------------------------------------
// Lê a tabela de itens do processo administrativo e devolve a ordem
// atual: [{ itemId, sequencialAtual, descricao }].
// ---------------------------------------------------------------------
export async function listarItensDoProcesso(processoId) {
  const res = await m2a.get(TABELA_ITENS_PROCESSO(processoId));
  if (res.status >= 400) {
    throw new Error(`listarItensDoProcesso(${processoId}): status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  const out = [];
  $("tr.tr_processo_administrativo_item").each((_i, tr) => {
    const $tr = $(tr);
    const trId = $tr.attr("id") || "";
    const m = trId.match(/tr_(\d+)/);
    if (!m) return;
    const itemId = m[1];
    let sequencialAtual = null;
    const $seqBtn = $tr.find("button[id_item]").first();
    if ($seqBtn.length) {
      const txt = $seqBtn.text().trim();
      const n = parseInt(txt, 10);
      if (Number.isFinite(n)) sequencialAtual = n;
    }
    // 4ª <td> costuma ter a descrição visível; usamos um fallback robusto.
    let descricao = "";
    const $tds = $tr.find("td");
    if ($tds.length >= 4) {
      descricao = $tds.eq(3).text().replace(/\s+/g, " ").trim();
    }
    out.push({ itemId, sequencialAtual, descricao });
  });
  return out;
}

// ---------------------------------------------------------------------
// Reordena os itens do processo. `ordemDesejada` é array de descrições
// na ordem esperada (case-insensitive, normalizada). Itens que casarem
// pela descrição são movidos via alterar_sequencial.
// ---------------------------------------------------------------------
function norm(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export async function reordenarItensProcesso(processoId, descricoesOrdenadas) {
  const atual = await listarItensDoProcesso(processoId);
  if (!atual.length) return { ok: true, reordenados: 0 };
  const desejada = (descricoesOrdenadas || []).map(norm).filter(Boolean);
  if (!desejada.length) return { ok: true, reordenados: 0 };

  // Para cada item desejado, na ordem, garantir que esteja na posição N+1.
  // Como o portal renumera ao mover, iteramos sempre relendo a tabela.
  let reordenados = 0;
  for (let i = 0; i < desejada.length; i++) {
    const seqAlvo = i + 1;
    const tabela = await listarItensDoProcesso(processoId);
    // Procura o item alvo pela descrição normalizada
    const alvo = tabela.find(
      (it) =>
        norm(it.descricao) === desejada[i] ||
        norm(it.descricao).startsWith(desejada[i].slice(0, 40)),
    );
    if (!alvo) {
      console.warn(
        `[reordenarItensProcesso] item esperado na pos ${seqAlvo} não encontrado: "${desejada[i].slice(0, 60)}"`,
      );
      continue;
    }
    if (alvo.sequencialAtual === seqAlvo) continue;
    const path = ALTERAR_SEQUENCIAL_ITEM(alvo.itemId);
    const csrf = await m2a.getCsrf(`/processo_administrativo/${processoId}/`);
    const body = new URLSearchParams();
    body.set("novo_sequencial", String(seqAlvo));
    body.set("csrfmiddlewaretoken", csrf);
    const res = await m2a.request("POST", path, {
      body: body.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
        Referer: `${m2a.http.defaults.baseURL || ""}/processo_administrativo/${processoId}/`,
      },
    });
    if (res.status >= 400) {
      console.warn(
        `[reordenarItensProcesso] item ${alvo.itemId} → pos ${seqAlvo}: status ${res.status}`,
      );
      continue;
    }
    reordenados++;
    await sleep(120);
  }
  return { ok: true, reordenados };
}
