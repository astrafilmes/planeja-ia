// Teste completo de extração com HTML realista do M2A
// Simula o que a extensão faria

import { JSDOM } from "jsdom";

const sampleHTMLFromM2A = `
<!DOCTYPE html>
<html>
<head><title>M2A Subtabela</title></head>
<body>
<table class="kt-datatable" id="kt_datatable_items">
  <thead>
    <tr>
      <th>Item</th>
      <th>Descrição</th>
      <th>Quantidade</th>
      <th>Unidade</th>
      <th>Valor Unit.</th>
      <th>Valor Total</th>
    </tr>
  </thead>
  <tbody>
    <tr class="kt-datatable__row" data-id="item_1">
      <td><span>30 - COMPRESSOR DE 4 BICOS</span></td>
      <td></td>
      <td>62,0</td>
      <td>UND</td>
      <td>R$ 345,00</td>
      <td>R$ 21.390,00</td>
    </tr>
    <tr class="kt-datatable__row" data-id="item_2">
      <td><span>37</span></td>
      <td><span>EQUIPAGEM ESPORTIVA HANDEBOL</span></td>
      <td>30,0</td>
      <td>CX</td>
      <td>R$ 699,00</td>
      <td>R$ 20.970,00</td>
    </tr>
    <tr class="kt-datatable__row" data-id="item_3">
      <td><span>45</span></td>
      <td></td>
      <td>15,0</td>
      <td>UND</td>
      <td>R$ 1.200,50</td>
      <td>R$ 18.007,50</td>
    </tr>
  </tbody>
</table>

<table class="kt-datatable" id="kt_datatable_contratos">
  <thead>
    <tr>
      <th>Fornecedor</th>
      <th>CNPJ</th>
      <th>Ação</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="text-left">
        <div><span>FORTAL COMERCIO ltda epp</span></div>
      </td>
      <td>12.345.678/0001-99</td>
      <td><a href="/contratos/1001/view">Ver</a></td>
    </tr>
  </tbody>
</table>
</body>
</html>
`;

// Copia as funções do processo_scraper.js
function txt(el) {
  return (el?.textContent ?? "")
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseValor(s) {
  if (!s) return 0;
  const c = String(s)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

function looksLikeCurrency(value) {
  return /R\$|\d+,\d{2}/.test(value || "");
}

function looksLikeUnit(value) {
  if (!value) return false;
  const cleaned = String(value).trim();
  if (!cleaned || cleaned.length > 14) return false;
  if (/R\$|\d+,\d{2}/.test(cleaned)) return false;
  if (/^\d+([.,]\d+)?$/.test(cleaned)) return false;
  if (!/^[A-Za-z0-9./%-]+$/.test(cleaned)) return false;
  return true;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (value) return value;
  }
  return "";
}

function looksLikeValidDescription(value) {
  if (!value) return false;
  const cleaned = String(value).trim();
  // Descrição deve ter pelo menos 5 caracteres e conter letras
  if (cleaned.length < 5) return false;
  if (!/[A-Za-záéíóúàâêôãõç]/i.test(cleaned)) return false;
  // Não pode ser só números/símbolos (como CNPJ, data, etc)
  const letterRatio =
    cleaned.replace(/[^A-Za-záéíóúàâêôãõç]/gi, "").length / cleaned.length;
  return letterRatio > 0.4;
}

function extractNumeroDescricao(cellsText) {
  console.log(
    `  → Analisando células: [${cellsText.map((c) => `"${c}"`).join(", ")}]`,
  );

  // Padrão inline: "30 - COMPRESSOR DE 4 BICOS"
  for (let i = 0; i < cellsText.length; i++) {
    const text = cellsText[i];
    const inlineMatch = text.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
    if (inlineMatch && looksLikeValidDescription(inlineMatch[2])) {
      console.log(
        `  [ICON] Padrão inline encontrado: #${inlineMatch[1]} - ${inlineMatch[2]}`,
      );
      return {
        numero: inlineMatch[1],
        descricao: inlineMatch[2],
        numeroIndex: i,
      };
    }
  }

  // Padrão separado: número e descrição em células diferentes
  for (let i = 0; i < cellsText.length; i++) {
    const text = cellsText[i];
    if (!/^\d{1,5}$/.test(text)) continue;

    console.log(`  → Número puro encontrado: "${text}" na posição ${i}`);

    const descricao = firstNonEmpty(
      cellsText
        .slice(i + 1)
        .filter(
          (value) =>
            looksLikeValidDescription(value) &&
            !looksLikeCurrency(value) &&
            !looksLikeUnit(value),
        ),
    );

    if (descricao) {
      console.log(`  [ICON] Padrão separado: #${text} - ${descricao}`);
      return {
        numero: text,
        descricao,
        numeroIndex: i,
      };
    }
  }

  console.log(`  [ICON] Nenhum padrão encontrado`);
  return { numero: "", descricao: "", numeroIndex: -1 };
}

function extractItensFromDoc(doc, ataId) {
  console.log(`\n[TESTE] Extraindo itens para ataId=${ataId}`);

  const rows = Array.from(
    doc.querySelectorAll(
      [
        "tr.tr_ata_registro_preco_item",
        "tr.tr_licitacao_ata_contrato_item",
        "tr.kt-datatable__row",
        // REMOVER: "tbody tr" era muito amplo e pegava linhas de outras tabelas
      ].join(", "),
    ),
  );

  console.log(`[TESTE] Encontradas ${rows.length} linhas`);

  const out = [];
  const seen = new Set();
  let idx = 0;

  for (const tr of rows) {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) {
      console.log(`  Linha pulada: sem <td>`);
      continue;
    }

    const cellsText = Array.from(cells)
      .map((cell) => txt(cell))
      .filter(Boolean);

    // Um item deve ter pelo menos 4 células (número, descrição, unidade, valor)
    if (cellsText.length < 4) {
      console.log(
        `  Linha pulada: ${cellsText.length} células (mínimo 4): ${cellsText.join(" | ")}`,
      );
      continue;
    }

    console.log(`\n  Linha ${++idx}:`);
    const parsed = extractNumeroDescricao(cellsText);
    const numero = parsed.numero;
    const descricao = parsed.descricao;

    if (!numero) {
      console.log(`    [ICON] Sem número`);
      continue;
    }

    if (!descricao) {
      console.log(`    [ICON] Sem descrição`);
      continue;
    }

    let unidade = "";
    let valor = 0;

    // Procura unidade (de trás para frente)
    for (let i = cellsText.length - 2; i >= 0; i--) {
      const text = cellsText[i];
      if (!unidade && looksLikeUnit(text) && text !== numero) {
        unidade = text;
        console.log(`    → Unidade encontrada: "${unidade}"`);
      }
    }

    // Procura valor
    for (const text of cellsText) {
      if (!valor && looksLikeCurrency(text)) {
        valor = parseValor(text);
        console.log(`    → Valor encontrado: "${text}" → ${valor}`);
      }
    }

    const dedupeKey = `${ataId}|${numero}|${descricao}`;
    if (seen.has(dedupeKey)) {
      console.log(`    [ICON] Duplicado, pulando`);
      continue;
    }
    seen.add(dedupeKey);

    console.log(
      `    [ICON] Item extraído: #${numero} - ${descricao} (${unidade}) R$ ${valor}`,
    );

    out.push({
      numero_item: numero,
      descricao,
      unidade,
      valor_unitario: valor,
      id_ata: ataId,
    });
  }

  console.log(`\n[TESTE] Total de itens extraídos: ${out.length}\n`);
  return out;
}

// Teste
console.log("=== TESTE DE EXTRAÇÃO M2A ===\n");

// Parse HTML
const dom = new JSDOM("");
const doc = new dom.window.DOMParser().parseFromString(
  sampleHTMLFromM2A,
  "text/html",
);

// Execute extração
const items = extractItensFromDoc(doc, "25520");

console.log("=== RESULTADO FINAL ===");
console.log(JSON.stringify(items, null, 2));

if (items.length === 0) {
  console.error("\n[ICON] PROBLEMA: Nenhum item foi extraído!");
  console.error("Verifique:");
  console.error("1. Os seletores CSS (tr.kt-datatable__row)");
  console.error("2. A estrutura das células (td > span vs td direto)");
  console.error("3. Se o HTML vem do servidor sem JavaScript");
} else {
  console.log(`\n[ICON] Sucesso! ${items.length} itens extraídos`);
}
