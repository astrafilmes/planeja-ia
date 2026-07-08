// Consulta de saldo por item de ata no portal M2A.
//
// A tabela de itens da ata (com colunas "Quantidade", "Utilizada", "Saldo")
// é carregada por AJAX em `/ata_registro_precos/{ataId}/#ata_item`. O worker
// abre a página, coleta as linhas <tr class="tr_ata_item"> e extrai as
// células por posição.
//
// Como a estrutura pode variar entre versões do portal, deixamos o parser
// tolerante: procura pelos rótulos das colunas no <thead> e mapeia os
// índices dinamicamente. Se a página não expõe saldo (algumas atas
// mostram só qtd total), devolve saldo=null e o front trata como "não
// verificável" (bloqueia por segurança).

import * as cheerio from "cheerio";
import { m2a } from "../m2a-client.js";

function toNumberBR(txt) {
  if (txt == null) return null;
  const raw = String(txt).trim();
  if (!raw) return null;
  // Aceita "1.234,56" e "1234.56"
  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Retorna saldos por item de uma ata.
 * @returns {{ ataId: string|number, itens: Array<{ m2a_item_id:string, numero:string|null, descricao:string, quantidade_total:number|null, quantidade_utilizada:number|null, saldo:number|null }>, avisos:string[] }}
 */
export async function saldosDaAta(ataId) {
  const path = `/ata_registro_precos/${ataId}/`;
  const res = await m2a.get(path);
  if (res.status !== 200) {
    throw new Error(`Falha ao carregar ata ${ataId}: HTTP ${res.status}`);
  }
  const $ = cheerio.load(res.html);
  const avisos = [];

  // Localiza a tabela de itens (tem class kt-datatable com linhas tr_ata_item).
  const rows = $("tr.tr_ata_item, tr.kt-datatable__row.tr_ata_item");
  if (rows.length === 0) {
    avisos.push("Nenhuma linha tr_ata_item localizada — parser precisa ser ajustado.");
    return { ataId, itens: [], avisos };
  }

  // Mapeia índices das colunas relevantes lendo o <thead> mais próximo.
  const thead = rows.first().closest("table").find("thead").first();
  const headers = thead
    .find("th")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim().toLowerCase())
    .get();
  const findCol = (...aliases) =>
    headers.findIndex((h) => aliases.some((a) => h.includes(a)));

  const colNumero = findCol("nº", "numero", "no");
  const colDesc = findCol("descri");
  const colQtd = findCol("quantidade", "qtd total", "quantidade total");
  const colUtil = findCol("utiliz");
  const colSaldo = findCol("saldo", "disponível", "disponivel");

  const itens = [];
  rows.each((_, tr) => {
    const $tr = $(tr);
    const idAttr =
      $tr.attr("data-id") ||
      $tr.attr("data-item-id") ||
      $tr.find("a[href*='/ata_itens/']").attr("href") ||
      "";
    const idMatch = String(idAttr).match(/(\d+)/);
    const m2a_item_id = idMatch ? idMatch[1] : "";
    const tds = $tr.find("td");
    const cell = (i) => (i >= 0 ? tds.eq(i).text().replace(/\s+/g, " ").trim() : "");
    const item = {
      m2a_item_id,
      numero: colNumero >= 0 ? cell(colNumero) || null : null,
      descricao: colDesc >= 0 ? cell(colDesc) : "",
      quantidade_total: toNumberBR(cell(colQtd)),
      quantidade_utilizada: toNumberBR(cell(colUtil)),
      saldo: toNumberBR(cell(colSaldo)),
    };
    // Se não houver coluna saldo explícita, tenta derivar.
    if (item.saldo == null && item.quantidade_total != null && item.quantidade_utilizada != null) {
      item.saldo = item.quantidade_total - item.quantidade_utilizada;
    }
    if (item.m2a_item_id) itens.push(item);
  });

  if (itens.length === 0) {
    avisos.push(
      "Linhas tr_ata_item encontradas, mas nenhum item com m2a_item_id — verifique atributos data-id/data-item-id da tabela.",
    );
  }
  return { ataId, itens, avisos };
}
