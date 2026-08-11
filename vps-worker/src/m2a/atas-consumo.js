// Consumo por (secretaria, item) — soma das quantidades contratadas em
// contratos existentes de uma ata.
//
// Estratégia:
//   1. Listar todos os contratos vinculados à ata:
//        GET /contratos/tabela/?ata_registro_preco={ataId}&page_size=1000
//      (fallback tenta ?ata= e ?ata_id=). A resposta traz linhas
//      <tr class="tr_contrato" id="tr_{contratoId}"> com o nome da secretaria
//      (unidade gestora) em uma das colunas.
//
//   2. Para cada contrato, listar seus itens:
//        GET /contratos/itens/tabela/{contratoId}/?page_size=1000
//      Cada linha traz:
//        - descrição no formato "68 - TOLDO 3M..." → numero do item
//        - <input class="mask_quantidade" value="10,0"> → quantidade contratada
//        - <div class="m2a-badge">/ 20,00</div>  → cota total da secretaria (informativo)
//
//   3. Ignora contratos cancelados/rescindidos.
//
//   4. Agrega por (secretariaNome normalizado, numero do item) → soma.

import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";
import { normSec } from "./norm-sec.js";
import { coerceHtmlPayload } from "./utils.js";

function toNumberBR(txt) {
  if (txt == null) return null;
  const raw = String(txt).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseNumeroFromSpan(txt) {
  const m = String(txt ?? "").trim().match(/^(\d+)\s*-/);
  return m ? m[1] : null;
}

function normalizeId(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/\d+/);
  return m ? m[0] : "";
}

async function tentarListarContratos(ataId) {
  // Endpoint oficial usado pela tela da ata:
  //   GET /ata_registro_precos/tabela_contratos/{ataId}?page_size=1000
  // Fallbacks antigos mantidos por segurança.
  const candidates = [
    `/ata_registro_precos/tabela_contratos/${ataId}?page_size=1000`,
    `/contratos/tabela/?ata_registro_preco=${ataId}&page_size=1000`,
    `/contratos/tabela/?ata=${ataId}&page_size=1000`,
  ];
  let lastErr = null;
  for (const path of candidates) {
    try {
      const res = await m2a.get(path, {
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
      });
      if (res.status !== 200) continue;
      const html = coerceHtmlPayload(res.html);
      const $ = cheerio.load(html);
      const rows = $("tr.tr_contrato, tr.kt-datatable__row.tr_contrato");
      if (rows.length > 0 || /nenhum registro encontrado/i.test(html)) {
        return { $, rows, path };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return { $: null, rows: null, path: null };
}

function limparNomeSecretaria(txt) {
  // Ex.: "05 - SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA (2025)"
  //   → "SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA"
  let s = String(txt ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^\d+\s*-\s*/, "");
  s = s.replace(/\s*\(\s*\d{4}\s*\)\s*$/, "");
  return s.trim();
}

/**
 * Lista os contratos de uma ata (id, número, secretaria, status).
 * Colunas (após checkbox): número, processo, contratante (secretaria),
 * fornecedor, início vig., fim vig., valor, situação, origem.
 */
export async function listarContratosDaAta(ataId, { processoId = null } = {}) {
  const { $, rows, path } = await tentarListarContratos(ataId);
  if (!$ || !rows) return { path: null, contratos: [] };
  const out = [];
  const expectedProcessoId = normalizeId(processoId);
  let descartadosOutroProcesso = 0;
  let descartadosSemProcesso = 0;
  rows.each((_, el) => {
    const $tr = $(el);
    const idAttr = $tr.attr("id") || "";
    const mId = idAttr.match(/tr_(\d+)/);
    const contratoId = mId ? Number(mId[1]) : null;
    if (!contratoId) return;

    const cells = $tr.find("td, th").toArray().map((c) =>
      $(c).text().replace(/\s+/g, " ").trim(),
    );

    const processoHref =
      $tr.find('a[href*="/processo_administrativo/"]').first().attr("href") || "";
    const processoIdLinha = normalizeId(
      processoHref.match(/\/processo_administrativo\/(\d+)\/?/)?.[1],
    );
    const processoNumero =
      $tr.find('a[href*="/processo_administrativo/"]').first().text().replace(/\s+/g, " ").trim() ||
      cells.find((t) => /\d+\s*\/\s*\d{4}/.test(t)) ||
      "";

    if (expectedProcessoId) {
      if (!processoIdLinha) {
        descartadosSemProcesso += 1;
        return;
      }
      if (processoIdLinha !== expectedProcessoId) {
        descartadosOutroProcesso += 1;
        return;
      }
    }

    // Número contrato: primeira célula com padrão "NNN/AAAA..."
    const numero = cells.find((t) => /^\d{1,6}\/\d{4}/.test(t)) || "";

    // Secretaria (contratante): célula que começa com "NN - " ou contém
    // termos institucionais conhecidos (SECRETARIA/PREFEITURA/FUNDO/etc).
    let contratanteRaw = "";
    for (const t of cells) {
      if (!t) continue;
      if (
        /^\d+\s*-\s*/.test(t) ||
        /\b(SECRETARIA|PREFEITURA|FUNDO|C[ÂA]MARA|GABINETE|CONTROLADORIA|PROCURADORIA|AUTARQUIA)\b/i.test(t)
      ) {
        contratanteRaw = t;
        break;
      }
    }
    const secretariaNome = limparNomeSecretaria(contratanteRaw);

    const badgeTxt = $tr
      .find(".kt-badge, .badge")
      .map((_, b) => $(b).text().trim())
      .get()
      .join(" ");
    const cancelado = /cancel|rescind|anulad|encerrad|extint|rascunho|suspens|paralisad|revogad|invalidad/i.test(badgeTxt);

    out.push({
      contratoId,
      numero,
      secretariaNome,
      contratanteRaw,
      processoId: processoIdLinha || null,
      processoNumero,
      cancelado,
      situacao: badgeTxt.trim(),
    });
  });
  if (expectedProcessoId && (descartadosOutroProcesso || descartadosSemProcesso)) {
    console.warn(
      `[m2a-consumo] ata ${ataId}: contratos filtrados por processo ${expectedProcessoId} ` +
        `(outro processo=${descartadosOutroProcesso}, sem processo=${descartadosSemProcesso})`,
    );
  }
  return { path, contratos: out };
}

/**
 * Lista os itens de UM contrato: quantidade contratada por item.
 * @returns {Promise<Array<{ contratoItemId:number, numero:string|null, descricao:string, quantidadeContratada:number|null, cotaSecretaria:number|null }>>}
 */
const MAX_ITEM_RETRIES = 4;

async function fetchItensContratoOnce(contratoId) {
  const path = `/contratos/itens/tabela/${contratoId}/?page_size=1000`;
  try {
    const res = await m2a.get(path, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
    });
    return { status: res.status, html: res.html, error: null };
  } catch (err) {
    // axios lança pra status >= 500 (validateStatus: s < 500)
    const status = err?.response?.status ?? 0;
    return { status, html: "", error: err };
  }
}

export async function listarItensContrato(contratoId) {
  let lastErr = null;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ITEM_RETRIES; attempt++) {
    const { status, html, error } = await fetchItensContratoOnce(contratoId);
    lastStatus = status;
    lastErr = error;
    // Retry apenas em 5xx ou erro de rede. 4xx = definitivo.
    if (status === 200) {
      const parsed = coerceHtmlPayload(html);
      const $ = cheerio.load(parsed);
      const rows = $("tr.tr_contrato_item, tr.kt-datatable__row.tr_contrato_item");
      const out = [];
      rows.each((_, el) => {
        const $tr = $(el);
        const idAttr = $tr.attr("id") || "";
        const mId = idAttr.match(/tr_(\d+)/);
        const contratoItemId = mId ? Number(mId[1]) : null;
        const descSpan = $tr.find("td").eq(1).find("span").first().text();
        const numero = parseNumeroFromSpan(descSpan);
        const descricao = descSpan.replace(/\s+/g, " ").trim();
        const inputVal = $tr.find("input.mask_quantidade").attr("value") || "";
        const quantidadeContratada = toNumberBR(inputVal);
        const badgeTxt = $tr.find(".m2a-badge, .badge-success").first().text();
        const badgeMatch = String(badgeTxt).match(/([\d.,]+)/);
        const cotaSecretaria = badgeMatch ? toNumberBR(badgeMatch[1]) : null;
        out.push({
          contratoItemId,
          numero,
          descricao,
          quantidadeContratada,
          cotaSecretaria,
        });
      });
      return out;
    }
    const transient = !status || status >= 500;
    if (!transient) {
      throw new Error(`Falha ao carregar itens do contrato ${contratoId}: HTTP ${status}`);
    }
    if (attempt < MAX_ITEM_RETRIES) {
      const wait = 500 * Math.pow(2, attempt - 1); // 500, 1000, 2000, 4000
      console.warn(`[m2a-consumo] contrato ${contratoId} HTTP ${status} — retry ${attempt}/${MAX_ITEM_RETRIES - 1} em ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(
    `Falha ao carregar itens do contrato ${contratoId} após ${MAX_ITEM_RETRIES} tentativas (último status=${lastStatus}${lastErr ? `, msg=${lastErr.message}` : ""})`,
  );
}

/**
 * Lista os documentos de UM contrato.
 * @returns {Promise<Array<{ id:string, nome:string }>>}
 */
export async function listarDocumentosContrato(contratoId) {
  const path = `/contratos/documentos/tabela/${contratoId}/?page_size=1000`;
  try {
    console.log(`[m2a-documentos] listando docs do contrato ${contratoId}...`);
    const res = await m2a.get(path, {
      headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json,text/html,*/*" },
    });
    const parsed = coerceHtmlPayload(res.html);
    const $ = cheerio.load(parsed);
    const out = [];

    // O HTML fornecido pelo usuário mostra que os documentos podem estar em:
    // 1. <input class="checkbox-documento" value="ID" onclick="clickSelecionarDocumento...('ID')">
    // 2. <button id_item="ID" documento="NOME" onclick="visualizadorPdfClick...('ID', 'NOME', ...)">
    // 3. <button id_item="ID" action_button="Autorizar" url="/contratos/documentos/autorizar/ID/">
    // 4. <td class="text-left"><span>NOME</span></td>

    // Estratégia: iterar sobre as linhas e tentar extrair ID e Nome de forma robusta
    const rows = $("tr");
    console.log(`[m2a-documentos] contrato ${contratoId}: ${rows.length} linhas encontradas na tabela`);
    
    rows.each((i, el) => {
      const $tr = $(el);
      
      // 1. Tentar capturar o ID
      let id = "";
      
      // Prioridade 1: botões com id_item ou id_documento
      id = $tr.find('button[id_item], button[id_documento], a[id_item], input[id_item]').first().attr('id_item') || 
           $tr.find('button[id_item], button[id_documento]').first().attr('id_documento');

      // Prioridade 2: checkbox value
      if (!id) {
        id = $tr.find('input.checkbox-documento, input.checkBoxcontrato_documento').val();
      }

      // Prioridade 3: Regex em atributos onclick
      if (!id) {
        const onClick = $tr.find('[onclick]').attr('onclick') || "";
        // Padrão '2790468' ou (2790468, 1) ou autorizar/2790468/
        const m = onClick.match(/'(\d+)'/) || 
                  onClick.match(/\((\d+)/) || 
                  $tr.find('[url*="/autorizar/"]').attr('url')?.match(/\/autorizar\/(\d+)\//);
        if (m) id = m[1];
      }
      
      // 2. Tentar capturar o Nome
      let nome = "";
      
      // Prioridade 1: span dentro de text-left (onde costuma estar o nome principal)
      nome = $tr.find('td.text-left span').first().text().trim();
      
      // Prioridade 2: atributo 'documento' em botões
      if (!nome) {
        nome = $tr.find('button[documento]').attr('documento');
      }

      // Prioridade 3: Fallback para qualquer span na linha que não seja apenas número
      if (!nome) {
        $tr.find('span').each((_, span) => {
          const t = $(span).text().trim();
          if (t && !/^\d+$/.test(t) && t.length > 2) {
            nome = t;
            return false;
          }
        });
      }
      
      if (id && nome && /^\d+$/.test(id)) {
        console.log(`[m2a-documentos] contrato ${contratoId}: doc encontrado -> id=${id} nome="${nome}"`);
        // Evita duplicados por ID
        if (!out.some(d => d.id === id)) {
          out.push({ id, nome });
        }
      }
    });

    // Se ainda assim for zero, tenta um seletor global agressivo para qualquer coisa que pareça ID de documento
    if (out.length === 0) {
      console.log(`[m2a-documentos] contrato ${contratoId}: tentando busca agressiva global...`);
      $('[onclick*="Documento"], [onclick*="visualizadorPdf"], [url*="/autorizar/"]').each((_, el) => {
        const $el = $(el);
        const onClick = $el.attr('onclick') || "";
        const url = $el.attr('url') || "";
        const m = onClick.match(/'(\d+)'/) || onClick.match(/\((\d+)/) || url.match(/\/autorizar\/(\d+)\//);
        
        if (m && m[1]) {
          const id = m[1];
          const $row = $el.closest('tr');
          const nome = $row.find('td.text-left span').first().text().trim() || 
                       $el.attr('documento') ||
                       $row.find('span').filter((_, s) => $(s).text().trim().length > 2).first().text().trim();
          
          if (id && nome && !out.some(d => d.id === id)) {
            out.push({ id, nome });
          }
        }
      });
    }

    console.log(`[m2a-documentos] contrato ${contratoId}: total docs detectados = ${out.length}`);
    return out;
  } catch (err) {
    console.error(`[m2a-documentos] contrato ${contratoId} falhou ao listar documentos: ${err.message}`);
    return [];
  }
}

/**
 * Consumo agregado por (secretariaKey, numeroItem):
 *   { [normSec(secretariaNome)]: { [numeroItem]: quantidadeTotalConsumida } }
 * Também retorna a lista bruta para debug.
 */
export async function consumoDaAta(ataId, { processoId = null } = {}) {
  const { contratos, path } = await listarContratosDaAta(ataId, { processoId });
  const detalhado = [];
  const agregado = {};
  const avisos = [];
  for (const c of contratos) {
    if (c.cancelado) continue;
    if (!c.contratoId) continue;
    if (!c.secretariaNome) {
      avisos.push({
        tipo: "contrato_sem_secretaria",
        mensagem: `Contrato ${c.numero || c.contratoId} da ata ${ataId} sem secretaria identificada na tabela de contratos; consumo não agregado por secretaria.`,
        contratoId: c.contratoId,
        numeroContrato: c.numero,
        processoId: c.processoId,
        processoNumero: c.processoNumero,
      });
      console.warn(
        `[m2a-consumo] ata ${ataId}: contrato ${c.contratoId} sem secretaria identificada`,
      );
      continue;
    }
    let itens = [];
    try {
      itens = await listarItensContrato(c.contratoId);
    } catch (err) {
      console.warn(`[m2a-consumo] contrato ${c.contratoId}: ${err.message}`);
      continue;
    }
    const secKey = normSec(c.secretariaNome);
    for (const it of itens) {
      if (!it.numero) continue;
      const q = it.quantidadeContratada ?? 0;
      if (q <= 0) continue;
      agregado[secKey] = agregado[secKey] || {};
      agregado[secKey][it.numero] = (agregado[secKey][it.numero] ?? 0) + q;
      detalhado.push({
        contratoId: c.contratoId,
        numeroContrato: c.numero,
        processoId: c.processoId,
        processoNumero: c.processoNumero,
        secretariaNome: c.secretariaNome,
        secretariaKey: secKey,
        numeroItem: it.numero,
        descricaoItem: it.descricao,
        quantidade: q,
        cotaSecretaria: it.cotaSecretaria,
      });
    }
  }
  return { ataId, listaContratos: contratos, detalhado, agregado, avisos, sourcePath: path };
}
