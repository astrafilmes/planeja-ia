// Teste de lógica de extração sem DOM
// Simula o que o parser faz

function testExtractNumeroDescricao() {
  // Simular os textos das células como viriam do HTML
  const testCases = [
    {
      name: "Item simples",
      cells: [
        "30 - COMPRESSOR DE 4 BICOS",
        "",
        "62,0",
        "UND",
        "R$ 345,00",
        "R$ 21.390,00",
      ],
      expected: { numero: "30", descricao: "COMPRESSOR DE 4 BICOS" },
    },
    {
      name: "Item com número e descrição separados",
      cells: ["37", "EQUIPAGEM ESPORTIVA HANDEBOL", "30,0", "UND", "R$ 699,00"],
      expected: { numero: "37", descricao: "EQUIPAGEM ESPORTIVA HANDEBOL" },
    },
    {
      name: "Item sem número",
      cells: ["COMPRESSOR", "62,0", "UND"],
      expected: { numero: "", descricao: "" },
    },
  ];

  console.log("=== Teste extractNumeroDescricao ===\n");

  testCases.forEach((test) => {
    console.log(`Test: ${test.name}`);
    console.log(`Células: [${test.cells.map((c) => `"${c}"`).join(", ")}]`);

    // Teste 1: padrão inline "NNN - Descrição"
    for (let i = 0; i < test.cells.length; i++) {
      const text = test.cells[i];
      const inlineMatch = text.match(/^(\d{1,5})\s*[-–.]\s*(.+)$/);
      if (inlineMatch) {
        console.log(
          `[ICON] Encontrado padrão inline: #${inlineMatch[1]} - ${inlineMatch[2]}`,
        );
        return;
      }
    }

    // Teste 2: padrão separado (NNN em uma célula, descrição na próxima)
    for (let i = 0; i < test.cells.length; i++) {
      const text = test.cells[i];
      if (!/^\d{1,5}$/.test(text)) continue;

      // Procura próxima célula não-vazia que não seja moeda
      const descricao = test.cells
        .slice(i + 1)
        .find((v) => v && !/R\$|\d+,\d{2}/.test(v));

      if (descricao) {
        console.log(
          `[ICON] Encontrado padrão separado: #${text} - ${descricao}`,
        );
        return;
      }
    }

    console.log("[ICON] Nenhum padrão encontrado\n");
  });
}

function testLooksLikeUnit() {
  const testCases = [
    { value: "UND", expected: true },
    { value: "CX", expected: true },
    { value: "M", expected: true },
    { value: "KG", expected: true },
    { value: "62,0", expected: false },
    { value: "R$ 345,00", expected: false },
    { value: "COMPRESSOR DE 4 BICOS", expected: false },
    { value: "", expected: false },
  ];

  console.log("\n=== Teste looksLikeUnit ===\n");

  testCases.forEach((test) => {
    const value = test.value;
    const cleaned = String(value).trim();

    let result = false;
    if (cleaned && cleaned.length <= 14) {
      if (!/R\$|\d+,\d{2}/.test(cleaned) && !/^\d+([.,]\d+)?$/.test(cleaned)) {
        if (/^[A-Za-z0-9./%-]+$/.test(cleaned)) {
          result = true;
        }
      }
    }

    const status = result === test.expected ? "[ICON]" : "[ICON]";
    console.log(
      `${status} "${value}" => ${result} (esperado: ${test.expected})`,
    );
  });
}

function testParseValor() {
  const testCases = [
    { value: "R$ 345,00", expected: 345.0 },
    { value: "R$ 21.390,00", expected: 21390.0 },
    { value: "R$ 699,00", expected: 699.0 },
    { value: "62,0", expected: 62.0 },
    { value: "", expected: 0 },
  ];

  console.log("\n=== Teste parseValor ===\n");

  testCases.forEach((test) => {
    const s = test.value;
    const c = String(s)
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(c);
    const result = Number.isFinite(n) ? n : 0;

    const match = result === test.expected ? "[ICON]" : "[ICON]";
    console.log(`${match} "${s}" => ${result} (esperado: ${test.expected})`);
  });
}

testExtractNumeroDescricao();
testLooksLikeUnit();
testParseValor();
