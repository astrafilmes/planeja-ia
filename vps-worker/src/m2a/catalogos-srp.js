// =====================================================================
// Catálogos auxiliares para criação de Processo SRP no M2A:
// - Unidades Orçamentárias (filhas dos órgãos)  -> scrape do form DFD/incluir
// - Agentes de planejamento por UO              -> GET /responsavel/responsavel_list
// =====================================================================

import { m2a } from "../m2a-client.js";
import { loadDoc } from "./utils.js";

const DFD_INCLUIR_PATH = "/gestao_compras/formalizacao_demanda/incluir/";
const RESP_LIST_PATH = "/responsavel/responsavel_list/";

/**
 * Scrape do formulário DFD para extrair ÓRGÃOS e UOs renderizados pelo M2A.
 * Cada <option> de UO ideialmente carrega um data-* indicando o órgão pai;
 * se não houver, retornamos orgao_m2a_id=null e o operador relaciona depois.
 */
export async function listarOrgaosEUnidadesOrcamentarias() {
  const res = await m2a.get(DFD_INCLUIR_PATH);
  if (res.status >= 400) {
    throw new Error(`DFD/incluir: status ${res.status}`);
  }
  const $ = loadDoc(res.html);

  const orgaos = $('select[name="orgao_solicitante"] option')
    .toArray()
    .map((el) => ({
      m2a_id: ($(el).attr("value") || "").trim(),
      nome: ($(el).text() || "").trim(),
    }))
    .filter((o) => o.m2a_id && o.nome);

  const uoSel = $('select[name="unidade_orcamentaria"] option');
  const unidades = uoSel
    .toArray()
    .map((el) => {
      const $el = $(el);
      // tenta capturar relação com órgão pai via data-*
      const dataAttrs = el.attribs || {};
      let orgao = null;
      for (const k of Object.keys(dataAttrs)) {
        if (/orgao/i.test(k)) {
          orgao = String(dataAttrs[k]).trim();
          break;
        }
      }
      return {
        m2a_id: ($el.attr("value") || "").trim(),
        nome: ($el.text() || "").trim(),
        orgao_m2a_id: orgao,
      };
    })
    .filter((u) => u.m2a_id && u.nome);

  return { orgaos, unidades };
}

/**
 * Agentes de planejamento (funcao=7 por padrão) para uma UO específica.
 * Endpoint: /responsavel/responsavel_list/?data_referencia=YYYY-MM-DD&funcao=7&unidade_orcamentaria=<pk>
 * Retorna array de { m2a_id, nome }.
 */
export async function listarAgentesPlanejamento({
  unidadePk,
  dataReferencia,
  funcao = 7,
}) {
  if (!unidadePk) throw new Error("unidadePk obrigatório");
  if (!dataReferencia) throw new Error("dataReferencia (YYYY-MM-DD) obrigatório");
  const qs = new URLSearchParams({
    data_referencia: String(dataReferencia),
    funcao: String(funcao),
    unidade_orcamentaria: String(unidadePk),
  });
  const path = `${RESP_LIST_PATH}?${qs.toString()}`;
  const res = await m2a.get(path, {
    headers: {
      Accept: "application/json,text/html,*/*",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (res.status >= 400) {
    throw new Error(`responsavel_list: status ${res.status}`);
  }

  const text = res.html || "";
  // Tenta JSON primeiro (Django ajax costuma devolver JSON)
  let agentes = [];
  try {
    const data = JSON.parse(text);
    // possíveis formatos: {results:[{id,text}]} / {data:[...]} / [...]
    const list =
      Array.isArray(data) ? data
      : Array.isArray(data?.results) ? data.results
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.objects) ? data.objects
      : [];
    agentes = list
      .map((it) => {
        const id =
          it.id ?? it.pk ?? it.value ?? it.servidor_id ?? it.responsavel_id;
        const nome =
          it.text ?? it.nome ?? it.name ?? it.label ?? it.descricao;
        return id != null && nome ? { m2a_id: String(id), nome: String(nome).trim() } : null;
      })
      .filter(Boolean);
  } catch {
    // Caiu HTML: tenta extrair <option>s
    const $ = loadDoc(text);
    agentes = $("option")
      .toArray()
      .map((el) => ({
        m2a_id: ($(el).attr("value") || "").trim(),
        nome: ($(el).text() || "").trim(),
      }))
      .filter((a) => a.m2a_id && a.nome);
  }

  return agentes;
}
