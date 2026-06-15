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

// Lê todos os inputs/selects/textareas do form de edição e devolve um
// objeto name->value preservando os valores atuais (que o M2A já gravou
// ao criar a DFD). Isso garante que campos obrigatórios que NÃO estamos
// sobrescrevendo (natureza_objeto, local_disputa, justificativa,
// tratamento ME/EPP, etc.) sejam ecoados de volta, evitando que o save
// silencioso "limpe" o registro e gere "pendências no cadastro".
function extrairCamposFormAtual($, formSelector = "form") {
  const out = {};
  const $form = $(formSelector).first().length
    ? $(formSelector).first()
    : $("form").first();

  // Inputs
  $form.find("input").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    const type = ($el.attr("type") || "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "file" || type === "image") return;
    if (type === "checkbox" || type === "radio") {
      if ($el.is("[checked]") || $el.prop("checked")) {
        out[name] = $el.attr("value") ?? "on";
      } else if (!(name in out)) {
        // garante que o name exista mesmo se desmarcado? não — não enviar
      }
      return;
    }
    const val = $el.attr("value");
    out[name] = val ?? "";
  });

  // Selects (pega <option selected> ou o primeiro com value não vazio)
  $form.find("select").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    const $sel = $el.find("option[selected]").first();
    if ($sel.length) {
      out[name] = $sel.attr("value") ?? $sel.text().trim();
    } else {
      // se não tem selected explícito, mantém o que estiver em out (vazio)
      if (!(name in out)) out[name] = "";
    }
  });

  // Textareas
  $form.find("textarea").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    out[name] = $el.text();
  });

  return out;
}

export async function atualizarProcesso(processoId, payload) {
  const path = PROCESSO_ATUALIZAR_TPL(processoId);

  // 1) Carrega a página do form para ler o CSRF E todos os campos atuais
  const pageRes = await m2a.get(path);
  if (pageRes.status >= 400) {
    throw new Error(`Atualizar processo: GET ${path} status ${pageRes.status}`);
  }
  const $page = loadDoc(pageRes.html);
  const csrf =
    $page('input[name="csrfmiddlewaretoken"]').first().attr("value") ||
    (await m2a.getCsrf(path, { force: true }));

  const camposAtuais = extrairCamposFormAtual($page);
  console.log(
    `[atualizarProcesso] camposAtuais (${Object.keys(camposAtuais).length}): ${JSON.stringify(camposAtuais)}`,
  );

  const numeroLimpo = String(payload.numero ?? "")
    .replace(/[^0-9/]/g, "")
    .trim();

  // 2) Valida classificacao
  let classificacao = String(payload.classificacao || camposAtuais.classificacao || "").trim();
  try {
    const r = await m2a.get(
      "/processo_administrativo/classificacao/?modalidade=7&fundamentacao_legal=66",
      { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } },
    );
    const json = JSON.parse(r.html || "{}");
    const validos = (json.results || []).map((x) => String(x.id));
    if (validos.length && !validos.includes(classificacao)) {
      const fallback = validos.includes("3") ? "3" : validos[0];
      console.warn(
        `[m2a] classificacao "${classificacao}" inválida (válidas: ${validos.join(",")}). usando "${fallback}".`,
      );
      classificacao = fallback;
    }
  } catch (err) {
    console.warn(`[m2a] falha ao validar classificacao: ${err.message}.`);
    if (!classificacao) classificacao = "3";
  }

  // 3) Monta body partindo dos campos atuais + overrides
  const overrides = {
    csrfmiddlewaretoken: csrf,
    modalidade: "7",
    modo_disputa: "1",
    fundamentacao_legal: "66",
    classificacao,
    criterio_julgamento: "1",
    valor_aceitavel: "1",
    criterio_apuracao: "1",
    comissao_licitacao: "3909",
    periodo_vigencia: "2",
    valor_periodo_vigencia: "12",
    permitir_adesao_registro_preco: "on",
    regime_execucao: "1",
    valor_intervalo_lance: "0,1000",
    prazo_habilitacao_obrigatoria: "on",
    _salvar: "true",
  };
  if (numeroLimpo) overrides.numero = numeroLimpo;
  if (payload.objeto) overrides.objeto = normalizeObjetoCaixaAlta(payload.objeto);
  if (payload.data_processo) overrides.data_processo = payload.data_processo;
  if (payload.unidade_orcamentaria_gerenciadora)
    overrides.unidade_orcamentaria_gerenciadora = String(
      payload.unidade_orcamentaria_gerenciadora,
    );

  const merged = { ...camposAtuais, ...overrides };

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null) continue;
    body.append(k, String(v));
  }

  // Log payload (sem csrf)
  const payloadDebug = {};
  for (const [k, v] of body.entries()) {
    if (k === "csrfmiddlewaretoken") continue;
    payloadDebug[k] = v;
  }
  console.log(
    `[atualizarProcesso] POST ${path} payload(${Object.keys(payloadDebug).length} campos)=${JSON.stringify(payloadDebug)}`,
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
  // Detecta erros: errorlist (Django), alert-danger, has-error, help-block,
  // e qualquer texto de "pendência"
  const erros = $(
    ".errorlist li, .alert-danger, .alert-error, .has-error .help-block, .invalid-feedback, .field-error",
  )
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  // Detecta campos com erro: <div class="form-group has-error"> com <label>
  const camposComErro = $(".has-error, .form-group.has-error")
    .map((_, el) => {
      const lbl = $(el).find("label").first().text().replace(/\s+/g, " ").trim();
      const msg = $(el).find(".help-block, .invalid-feedback, .errorlist").text().replace(/\s+/g, " ").trim();
      return lbl || msg ? `${lbl}${msg ? `: ${msg}` : ""}` : "";
    })
    .get()
    .filter(Boolean);
  const msgsSucesso = $(".alert-success, .alert-info, .messages li")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  console.log(
    `[atualizarProcesso] resp bytes=${res.html.length} finalUrl=${res.finalUrl} erros=${JSON.stringify(erros)} camposComErro=${JSON.stringify(camposComErro)} sucesso=${JSON.stringify(msgsSucesso)}`,
  );
  if (erros.length || camposComErro.length) {
    throw new Error(
      `Atualizar processo rejeitado: ${[...erros, ...camposComErro].join(" | ")}`,
    );
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
  // O endpoint de importacao_planilha responde apenas ao POST (o GET
  // retorna ~159 bytes sem CSRF). Buscamos o token na página do processo,
  // que renderiza o form completo com csrfmiddlewaretoken.
  const csrf = await m2a.getCsrf(
    `/processo_administrativo/atualizar/${processoId}/?detail=true`,
    { force: true },
  );

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

  console.log(
    `[importarPlanilha] POST ${path} csrf=${csrf ? `len=${csrf.length}` : "AUSENTE"} orgao_pk=${orgaoPk} unidade_orcamentaria_pk=${unidadeOrcamentariaPk} data_aviso=${dataAviso} data_consolidacao=${dataConsolidacao} data_manifestacao=${dataManifestacao} file=${arquivoFilename} bytes=${arquivoBytes.length} mime=${arquivoMime}`,
  );

  const res = await m2a.postMultipart(path, fd, {
    headers: {
      Referer: `${m2a.http.defaults.baseURL || ""}${path}`,
    },
  });

  const bodyPreview = String(res.html || "").slice(0, 1200).replace(/\s+/g, " ");
  console.log(
    `[importarPlanilha] resp status=${res.status} bytes=${(res.html || "").length} ct=${res.contentType || "-"} finalUrl=${res.finalUrl} bodyPreview="${bodyPreview}"`,
  );

  if (res.status >= 400) {
    throw new Error(
      `Importação ${arquivoFilename}: status ${res.status}`,
    );
  }

  // Tenta parsear como JSON (o portal devolve JSON pequeno em caso de erro)
  let jsonResp = null;
  try {
    jsonResp = JSON.parse(res.html);
  } catch {
    /* não é JSON */
  }
  if (jsonResp) {
    console.log(
      `[importarPlanilha] resp JSON: ${JSON.stringify(jsonResp).slice(0, 800)}`,
    );
    const ok =
      jsonResp.ok === true ||
      jsonResp.success === true ||
      jsonResp.status === "ok" ||
      jsonResp.status === "success";
    const msg =
      jsonResp.error ||
      jsonResp.erro ||
      jsonResp.message ||
      jsonResp.msg ||
      jsonResp.detail ||
      "";
    if (!ok) {
      throw new Error(
        `Importação ${arquivoFilename} rejeitada pelo portal: ${msg || JSON.stringify(jsonResp)}`,
      );
    }
  } else {
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
  }
  return { ok: true, dataConsolidacao, dataManifestacao };
}
