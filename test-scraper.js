// Script de teste para parser de itens da ATA
// Testa com o HTML fornecido pelo usuário

const testHTML = `
<table>
<tbody>
<tr class="kt-datatable__row" style="left: 0px;" id="tr_219202">
    <td class="text-left">
        <span>30 - COMPRESSOR DE 4 BICOS</span>
    </td>
    <td class="text-left">
        
    </td>
    <td class="text-center">
        62,0
    </td>
    <td class="text-center">
        UND
    </td>
    <td class="text-right">
        R$ 345,00
    </td>
    <td class="text-right">
        R$ 21.390,00
    </td>
    <td class="text-center">
        <span>
            
        </span>
    </td>
</tr>
<tr class="kt-datatable__row" style="left: 0px;" id="tr_219203">
    <td class="text-left">
        <span>37 - EQUIPAGEM ESPORTIVA HANDEBOL</span>
    </td>
    <td class="text-left">
        
    </td>
    <td class="text-center">
        30,0
    </td>
    <td class="text-center">
        UND
    </td>
    <td class="text-right">
        R$ 699,00
    </td>
    <td class="text-right">
        R$ 20.970,00
    </td>
    <td class="text-center">
        <span>
            
        </span>
    </td>
</tr>
</tbody>
</table>
`;

const testHTMLFornecedor = `
<td class="text-left">
    <div>
        <span id="25520_badge_licitacao_ata_contrato" class="kt-badge kt-badge--info" style="width: 8px; height: 8px; display: none"></span>
        <span>FORTAL COMERCIO ltda epp</span>
    </div>
    <div class="text-primary font-weight-bold" style="font-size: 12px;">
        <span>SECRETARIA MUNICIPAL DE EDUCAÇÃO</span>
    </div>
</td>
`;

function txt(el) {
  return (el?.textContent ?? "")
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeUnit(value) {
  if (!value) return false;
  const cleaned = String(value).trim();
  if (!cleaned || cleaned.length > 14) return false;
  if (/\s{2,}/.test(cleaned)) return false;
  // Não é moeda
  if (/R\$|\d+,\d{2}/.test(cleaned)) return false;
  // Não é número puro ou decimal
  if (/^\d+([.,]\d+)?$/.test(cleaned)) return false;
  return /^[A-Za-z0-9./%-]+$/.test(cleaned);
}

function looksLikeCurrency(value) {
  return /R\$|\d+,\d{2}/.test(value || "");
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

function extractNumeroDescricao(cellsText) {
  for (let i = 0; i < cellsText.length; i++) {
    const text = cellsText[i];
    const inlineMatch = text.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
    if (inlineMatch) {
      return {
        numero: inlineMatch[1],
        descricao: inlineMatch[2],
        numeroIndex: i,
      };
    }
  }
  return { numero: "", descricao: "", numeroIndex: -1 };
}

console.log("=== Teste de Extração de Itens ===\n");

const parser = new DOMParser();
const doc = parser.parseFromString(testHTML, "text/html");

const rows = Array.from(doc.querySelectorAll("tr.kt-datatable__row"));
console.log(`Encontradas ${rows.length} linhas\n`);

rows.forEach((tr, idx) => {
  console.log(`\n--- Linha ${idx + 1} ---`);
  const cells = tr.querySelectorAll("td");
  console.log(`Células: ${cells.length}`);

  const cellsText = Array.from(cells)
    .map((cell) => txt(cell))
    .filter(Boolean);

  console.log("Conteúdo das células:");
  cellsText.forEach((text, i) => {
    console.log(`  [${i}] "${text}"`);
  });

  const parsed = extractNumeroDescricao(cellsText);
  console.log(
    `\nParsed - Número: "${parsed.numero}", Descrição: "${parsed.descricao}"`,
  );

  let unidade = "";
  let valor = 0;
  for (let i = cellsText.length - 2; i >= 0; i--) {
    const text = cellsText[i];
    if (!unidade && looksLikeUnit(text)) {
      console.log(`  Unidade encontrada: "${text}"`);
      unidade = text;
    }
  }
  for (const text of cellsText) {
    if (!valor && looksLikeCurrency(text)) {
      valor = parseValor(text);
      console.log(`  Valor encontrado: "${text}" -> ${valor}`);
    }
  }

  console.log(
    `\nResultado: #${parsed.numero} - ${parsed.descricao} (${unidade}) R$ ${valor}`,
  );
});

console.log("\n\n=== Teste de Extração do Fornecedor ===\n");

const docForn = parser.parseFromString(testHTMLFornecedor, "text/html");
const tdLeft = docForn.querySelector("td.text-left");

const spans = Array.from(tdLeft.querySelectorAll("span"));
console.log(`Encontradas ${spans.length} spans\n`);

spans.forEach((span, idx) => {
  const cleaned = txt(span);
  const isBadge = span.id && /badge_licitacao_ata_contrato/i.test(span.id);
  console.log(
    `[${idx}] ID: "${span.id}", isBadge: ${isBadge}, Texto: "${cleaned}"`,
  );
});

// Teste de lógica de fornecedor
const fornecedorResult = (() => {
  for (const span of spans) {
    if (span.id && /badge_licitacao_ata_contrato/i.test(span.id)) continue;
    if (span.className && span.className.includes("kt-badge")) continue;

    const cleaned = txt(span);
    if (cleaned && cleaned.length > 2) {
      return cleaned;
    }
  }
  return "FALLBACK";
})();

console.log(`\nFornecedor extraído: "${fornecedorResult}"`);
