// =====================================================================
// Motor de criação de Processo Administrativo SRP no portal M2A.
// Porta o pipeline de 5 fases da extensão (automation_engine.js) para o
// VPS worker em Node. Todas as fases são chamáveis isoladamente; o
// orquestrador (orquestrador-processo-srp.js) encadeia tudo e reporta
// progresso ao chamador via callback.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { loadDoc, sleep } from "./utils.js";
import { adicionarDiaUtil, normalizeObjetoCaixaAlta } from "./utils.js";

const DFD_INCLUIR_PATH = "/gestao_compras/formalizacao_demanda/incluir/";
const DFD_TABELA_PATH =
  "/gestao_compras/formalizacao_demanda/tabela/?page_size=1000";

// ---------------------------------------------------------------------
// FASE 2 — Criação da DFD (Formalização de Demanda)
// ---------------------------------------------------------------------
export async function criarDFD(payload) {
  const objeto = normalizeObjetoCaixaAlta(payload.objeto);
  if (!objeto) throw new Error("DFD: objeto obrigatório");

  const csrf = await m2a.getCsrf(DFD_INCLUIR_PATH, { force: true });

  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("descricao", objeto);
  body.set("fundamentacao", "2");
  body.set("is_registro_de_preco", "on");
  body.set("data", String(payload.data || ""));
  body.set("ano_orcamento", String(payload.ano_orcamento || ""));
  body.set("orgao_solicitante", String(payload.orgao_solicitante || ""));
  body.set(
    "unidade_orcamentaria",
    String(payload.unidade_orcamentaria || ""),
  );
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
    throw new Error(`DFD: portal retornou status ${res.status}`);
  }

  // o portal pode renderizar a mesma página com erros — detectamos
  const $ = loadDoc(res.html);
  const erros = $(".errorlist, .alert-danger, .alert-error")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  if (erros.length) {
    throw new Error(`DFD rejeitada: ${erros.join(" | ")}`);
  }

  // Aguarda 3s para o portal indexar a DFD na tabela
  await sleep(3000);
  return { objetoNormalizado: objeto };
}

// ---------------------------------------------------------------------
// FASE 3 — Scraping do ID da DFD e do Processo Administrativo
// ---------------------------------------------------------------------
export async function capturarIdsProcesso({ objeto }) {
  const objetoNorm = normalizeObjetoCaixaAlta(objeto);
  const res = await m2a.get(DFD_TABELA_PATH);
  if (res.status >= 400) {
    throw new Error(
      `Tabela de DFD: portal retornou status ${res.status}`,
    );
  }

  const $ = loadDoc(res.html);
  const linhas = $("tr.kt-datatable__row.tr_solicitacao_despesa").toArray();
  if (!linhas.length) {
    throw new Error("Nenhuma DFD encontrada na tabela do portal.");
  }

  // Busca por objeto (mais seguro). Se não bater, usa a primeira (mais recente).
  let chosen = null;
  if (objetoNorm) {
    chosen = linhas.find((el) => {
      const text = $(el).text().toUpperCase();
      return text.includes(objetoNorm.slice(0, 60));
    });
  }
  chosen = chosen ?? linhas[0];

  const trId = $(chosen).attr("id") || "";
  const matchDfd = trId.match(/tr_(\d+)/);
  if (!matchDfd) {
    throw new Error(
      `Não foi possível extrair o ID da DFD do atributo id="${trId}".`,
    );
  }
  const dfdId = matchDfd[1];

  // Href do botão de sucesso → /processo_administrativo/{id}/
  const hrefs = $(chosen)
    .find("a")
    .map((_, el) => $(el).attr("href") || "")
    .get();
  let processoId = null;
  for (const href of hrefs) {
    const m = href.match(/\/processo_administrativo\/(\d+)/);
    if (m) {
      processoId = m[1];
      break;
    }
  }
  if (!processoId) {
    throw new Error(
      `DFD ${dfdId} encontrada mas sem link para processo_administrativo na linha.`,
    );
  }
  return { dfdId, processoId };
}

// ---------------------------------------------------------------------
// FASE 4 — Atualizar Processo Administrativo (vigência, comissões, etc.)
// ---------------------------------------------------------------------
// IMPORTANTE: o portal só aceita o save quando chamado com ?detail=true
// e quando TODOS os campos obrigatórios do form de edição vão no POST
// (modalidade, modo_disputa, fundamentacao_legal, classificacao,
// criterio_julgamento, valor_aceitavel). Sem isso o portal devolve 200
// mas silenciosamente ignora as alterações.
const PROCESSO_ATUALIZAR_TPL = (id) =>
  `/processo_administrativo/atualizar/${id}/?detail=true`;

export async function atualizarProcesso(processoId, payload) {
  const path = PROCESSO_ATUALIZAR_TPL(processoId);
  const csrf = await m2a.getCsrf(path, { force: true });

  const numeroLimpo = String(payload.numero ?? "")
    .replace(/[^0-9/]/g, "")
    .trim();

  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  // Fixos conforme spec (form completo de edição)
  body.set("modalidade", "7");
  body.set("modo_disputa", "1");
  body.set("fundamentacao_legal", "66");
  body.set("classificacao", String(payload.classificacao || "3"));
  body.set("criterio_julgamento", "1");
  body.set("processo_administrativo_pre_qualificacao", "");
  body.set("valor_aceitavel", "1");
  body.set("criterio_apuracao", "1");
  body.set("comissao_licitacao", "3909");
  body.set("periodo_vigencia", "2");
  body.set("valor_periodo_vigencia", "12");
  body.set("permitir_adesao_registro_preco", "on");
  body.set("regime_execucao", "1");
  body.set("valor_intervalo_lance", "0,1000");
  body.set("prazo_habilitacao_obrigatoria", "on");
  body.set("_salvar", "true");
  // Dinâmicos
  if (numeroLimpo) body.set("numero", numeroLimpo);
  if (payload.objeto)
    body.set("objeto", normalizeObjetoCaixaAlta(payload.objeto));
  if (payload.data_processo) body.set("data_processo", payload.data_processo);
  if (payload.unidade_orcamentaria_gerenciadora)
    body.set(
      "unidade_orcamentaria_gerenciadora",
      String(payload.unidade_orcamentaria_gerenciadora),
    );

  const res = await m2a.request("POST", path, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}${path}`,
    },
  });

  if (res.status >= 400) {
    throw new Error(`Atualizar processo: status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  const erros = $(".errorlist, .alert-danger, .alert-error")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  if (erros.length) {
    throw new Error(`Atualizar processo rejeitado: ${erros.join(" | ")}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// FASE 5 — Importar planilha de itens (multipart)
// ---------------------------------------------------------------------
const IMPORTACAO_TPL = (id) =>
  `/processo_administrativo/importacao_planilha/${id}/`;

export async function importarPlanilha({
  processoId,
  dataAviso,
  orgaoPk,
  unidadeOrcamentariaPk,
  arquivoBytes, // Buffer
  arquivoFilename, // string
  arquivoMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}) {
  if (!Buffer.isBuffer(arquivoBytes)) {
    throw new Error("importarPlanilha: arquivoBytes deve ser Buffer.");
  }
  if (!arquivoFilename) {
    throw new Error("importarPlanilha: arquivoFilename obrigatório.");
  }
  const dataConsolidacao = adicionarDiaUtil(dataAviso);
  const dataManifestacao = dataConsolidacao;

  const path = IMPORTACAO_TPL(processoId);
  const csrf = await m2a.getCsrf(path, { force: true });

  const fd = new FormData();
  fd.append("csrfmiddlewaretoken", csrf);
  fd.append("orgao_pk", String(orgaoPk));
  fd.append("unidade_orcamentaria_pk", String(unidadeOrcamentariaPk));
  fd.append("data_aviso", String(dataAviso));
  fd.append("data_consolidacao", dataConsolidacao);
  fd.append("data_manifestacao", dataManifestacao);
  fd.append("valores_pesquisa_importacao", "false");
  fd.append("FileUpload", arquivoBytes, {
    filename: arquivoFilename,
    contentType: arquivoMime,
  });

  const res = await m2a.postMultipart(path, fd, {
    headers: {
      Referer: `${m2a.http.defaults.baseURL || ""}${path}`,
    },
  });

  if (res.status >= 400) {
    throw new Error(
      `Importação ${arquivoFilename}: status ${res.status}`,
    );
  }
  const $ = loadDoc(res.html);
  const erros = $(".errorlist, .alert-danger, .alert-error")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  if (erros.length) {
    throw new Error(
      `Importação ${arquivoFilename} rejeitada: ${erros.join(" | ")}`,
    );
  }
  return { ok: true, dataConsolidacao, dataManifestacao };
}
