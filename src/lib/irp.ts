// Cliente IRP: análise e geração de planilhas por secretaria.
import { normalizeText, safeFileName } from "./normalize";
import { readXlsxMatrix } from "./workbook";

export interface UnidadeProcessamento {
  id: string;
  nome: string;
  numero: number;
  ref_coluna: number; // zero-based
}

export interface ItemValido {
  identificador: string;
  natureza: string;
  descricao: string;
  especificacao: string;
  unidade: string;
  quantidade: number;
  valorReferencia: number;
  sourceRow: number;
}

export interface ResultadoSecretaria {
  unidade: UnidadeProcessamento;
  cabecalhoColuna: string;
  itens: ItemValido[];
  somaQuantidade: number;
  somaValor: number;
  status: "exportado" | "sem_itens" | "erro" | "pendente";
  erro?: string;
}

export interface AnaliseIRP {
  linhaCabecalho: number;
  idxNatureza: number;
  idxDescricao: number;
  idxEspecificacao: number;
  idxUnidade: number;
  idxIdentificador: number;
  idxValorReferencia: number;
  totalLinhasBase: number;
  resultados: ResultadoSecretaria[];
}

interface BaseRow {
  identificador: string;
  natureza: string;
  descricao: string;
  especificacao: string;
  unidade: string;
  valorReferencia: number;
  sourceRow: number;
}

export const readWorkbook = readXlsxMatrix;

function findCol(header: string[], match: (norm: string) => boolean): number {
  for (let i = 0; i < header.length; i++) {
    if (match(header[i])) return i;
  }
  return -1;
}

function findColLast(
  header: string[],
  match: (norm: string) => boolean,
): number {
  for (let i = header.length - 1; i >= 0; i--) {
    if (match(header[i])) return i;
  }
  return -1;
}

function isNumeroItemHeader(norm: string): boolean {
  if (!norm) return false;
  const compact = norm.replace(/[^A-Z0-9]/g, "");
  return (
    compact === "N" ||
    compact === "NO" ||
    compact === "NUMERO" ||
    compact === "NITEM" ||
    norm.startsWith("NUMERO")
  );
}

function toNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const s = String(raw)
    .replace(/R\$\s*/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function scoreTextColumn(
  matrix: unknown[][],
  linhaCabecalho: number,
  col: number,
): number {
  let score = 0;
  const max = Math.min(matrix.length, linhaCabecalho + 25);
  for (let r = linhaCabecalho + 1; r < max; r++) {
    const text = cleanText((matrix[r] ?? [])[col]);
    if (!text) continue;
    const norm = normalizeText(text);
    if (/[A-Z]/.test(norm)) score += Math.min(text.length, 200);
  }
  return score;
}

function findBestItemTextColumn(
  matrix: unknown[][],
  linhaCabecalho: number,
  header: string[],
): number {
  const itemCols = header
    .map((h, i) => (h === "ITEM" ? i : -1))
    .filter((i) => i >= 0);

  let best = -1;
  let bestScore = 0;
  for (const col of itemCols) {
    const score = scoreTextColumn(matrix, linhaCabecalho, col);
    if (score > bestScore) {
      best = col;
      bestScore = score;
    }
  }
  return best;
}

function buildSuperiorLabels(row: unknown[], width: number): string[] {
  const labels: string[] = [];
  let current = "";
  for (let i = 0; i < width; i++) {
    const raw = cleanText(row[i]);
    if (normalizeText(raw)) current = raw;
    labels.push(current);
  }
  return labels;
}

export function analisar(
  matrix: unknown[][],
  unidades: UnidadeProcessamento[],
): AnaliseIRP {
  const matchNatureza = (v: string) =>
    v.includes("NATUREZA") || /\bNAT\b/.test(v) || v.includes("DESPESA");
  const matchDescricao = (v: string) =>
    v.includes("DESCRICAO") ||
    v.includes("DESCRIC") ||
    /\bDESCR\b/.test(v) ||
    v.includes("OBJETO");
  const matchItem = (v: string) => v === "ITEM";
  const matchUnidade = (v: string) =>
    v === "UNIDADE" ||
    v.includes("UNIDADE") ||
    v === "UND" ||
    v === "UN" ||
    v === "U.M." ||
    v === "UM" ||
    v.includes("UNID") ||
    v.includes("UNIDADE DE MEDIDA");

  // 1) localizar linha de cabeçalho (varre toda a planilha)
  let linhaCabecalho = -1;
  for (let i = 0; i < Math.min(50, matrix.length); i++) {
    const row = matrix[i] ?? [];
    const norm = row.map(normalizeText);
    if (
      norm.some(matchNatureza) &&
      (norm.some(matchDescricao) || norm.some(matchItem)) &&
      norm.some(matchUnidade)
    ) {
      linhaCabecalho = i;
      break;
    }
  }
  if (linhaCabecalho < 0) {
    const preview = matrix
      .slice(0, 8)
      .map(
        (r, i) =>
          `L${i + 1}: ${(r ?? [])
            .map((c) => String(c ?? "").trim())
            .filter(Boolean)
            .slice(0, 8)
            .join(" | ")}`,
      )
      .join("\n");
    throw new Error(
      `Não foi possível identificar colunas base (NATUREZA, DESCRICAO, UNIDADE).\nPrimeiras linhas detectadas:\n${preview}`,
    );
  }
  const headerRaw = matrix[linhaCabecalho] ?? [];
  const header = headerRaw.map(normalizeText);
  const idxNatureza = findCol(header, matchNatureza);
  const idxUnidade = findCol(header, matchUnidade);
  const idxItemTexto = findBestItemTextColumn(matrix, linhaCabecalho, header);
  let idxDescricao = findColLast(header, matchDescricao);
  if (idxDescricao < 0) idxDescricao = idxItemTexto;
  let idxEspecificacao = findColLast(header, (v) => v.includes("ESPECIF"));
  if (
    idxEspecificacao < 0 &&
    idxItemTexto >= 0 &&
    idxItemTexto !== idxDescricao
  ) {
    idxEspecificacao = idxItemTexto;
  }
  if (idxEspecificacao < 0) idxEspecificacao = idxDescricao;
  let idxIdentificador = findCol(header, isNumeroItemHeader);
  if (idxIdentificador < 0) {
    idxIdentificador = header.findIndex(
      (v, i) => v === "ITEM" && i !== idxItemTexto,
    );
  }
  const idxValorReferencia = findCol(
    header,
    (v) =>
      v.startsWith("VALOR UNIT") ||
      v.includes("VALOR REFERENCIA") ||
      v.includes("VALOR REF"),
  );
  if (idxNatureza < 0 || idxDescricao < 0 || idxUnidade < 0) {
    throw new Error(
      `Colunas obrigatórias ausentes na linha ${linhaCabecalho + 1}. Cabeçalho lido: ${header.join(" | ")}`,
    );
  }

  // 2) montar dados base
  const base: BaseRow[] = [];
  for (let i = linhaCabecalho + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const identificador =
      idxIdentificador >= 0 ? cleanText(row[idxIdentificador]) : "";
    const natureza = String(row[idxNatureza] ?? "").trim();
    let descricao = cleanText(row[idxDescricao]);
    let especificacao = cleanText(row[idxEspecificacao]);
    if (!descricao && especificacao) descricao = especificacao;
    if (!especificacao) especificacao = descricao;
    const valorReferencia =
      idxValorReferencia >= 0 ? toNumber(row[idxValorReferencia]) : 0;
    const unidade = String(row[idxUnidade] ?? "").trim();
    if (!natureza || !descricao || !especificacao || !unidade) continue;
    base.push({
      identificador,
      natureza,
      descricao,
      especificacao,
      unidade,
      valorReferencia,
      sourceRow: i,
    });
  }
  if (base.length === 0)
    throw new Error(
      "Não foram encontradas linhas com campos base preenchidos após o cabeçalho.",
    );

  // 3) avaliar cada unidade
  const resultados: ResultadoSecretaria[] = unidades.map((u) => {
    const col = u.ref_coluna;
    if (col >= header.length) {
      return {
        unidade: u,
        cabecalhoColuna: `COLUNA ${col + 1}`,
        itens: [],
        somaQuantidade: 0,
        somaValor: 0,
        status: "erro",
        erro: `Coluna de referência ${col + 1} não existe na planilha.`,
      };
    }
    const principal = cleanText(headerRaw[col]);
    const superiorRow =
      linhaCabecalho > 0 ? (matrix[linhaCabecalho - 1] ?? []) : [];
    const superiorLabels = buildSuperiorLabels(superiorRow, header.length);
    const superior = superiorLabels[col] ?? "";
    let cab = `COLUNA ${col + 1}`;
    if (principal && superior) cab = `${superior} / ${principal}`;
    else if (principal) cab = principal;
    else if (superior) cab = superior;

    const itens: ItemValido[] = [];
    let somaQuantidade = 0;
    let somaValor = 0;
    for (const b of base) {
      const raw = (matrix[b.sourceRow] ?? [])[col];
      if (raw === null || raw === undefined || raw === "") continue;
      const quantidade = toNumber(raw);
      if (!Number.isFinite(quantidade) || quantidade <= 0) continue;
      itens.push({ ...b, quantidade });
      somaQuantidade += quantidade;
      somaValor += quantidade * (b.valorReferencia || 0);
    }
    if (itens.length === 0) {
      return {
        unidade: u,
        cabecalhoColuna: cab,
        itens: [],
        somaQuantidade: 0,
        somaValor: 0,
        status: "sem_itens",
        erro: "Sem linhas com valor > 0 para esta coluna.",
      };
    }
    return {
      unidade: u,
      cabecalhoColuna: cab,
      itens,
      somaQuantidade,
      somaValor,
      status: "pendente",
    };
  });

  return {
    linhaCabecalho,
    idxNatureza,
    idxDescricao,
    idxEspecificacao,
    idxUnidade,
    idxIdentificador,
    idxValorReferencia,
    totalLinhasBase: base.length,
    resultados,
  };
}

/**
 * Gera planilha .xlsx para uma secretaria, replicando a estrutura do irp_padrao.
 */
export async function gerarPlanilhaSecretaria(
  result: ResultadoSecretaria,
  prefeitura = "PREFEITURA MUNICIPAL",
): Promise<{ filename: string; blob: Blob }> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Planejamento App";
  const ws = wb.addWorksheet("IMPORTACAO", {
    views: [{ state: "frozen", ySplit: 12 }],
  });
  ws.columns = [
    { width: 14 },
    { width: 50 },
    { width: 60 },
    { width: 14 },
    { width: 12 },
    { width: 28 },
    { width: 16 },
  ];

  const titleFont = { bold: true, size: 12 };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };
  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  } as const;
  const cellBorder = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  } as const;

  ws.getCell("A9").value = prefeitura;
  ws.getCell("A9").font = titleFont;
  ws.mergeCells("A9:G9");

  ws.getCell("A10").value = "Cod. do Orgao:";
  ws.getCell("A10").font = { bold: true };
  ws.getCell("B10").value = result.unidade.numero;

  ws.getCell("A11").value = "Orgao:";
  ws.getCell("A11").font = { bold: true };
  ws.getCell("B11").value = result.unidade.nome;
  ws.mergeCells("B11:G11");

  const headers = [
    "IDENTIFICADOR",
    "DESCRICAO",
    "ESPECIFICACAO",
    "QUANTIDADE",
    "UNIDADE",
    "NATUREZA / DESPESA",
    "VALOR REFERENCIA",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(12, i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = cellBorder;
  });
  ws.getRow(12).height = 28;

  result.itens.forEach((it, idx) => {
    const r = 13 + idx;
    ws.getCell(r, 1).value = it.identificador;
    ws.getCell(r, 2).value = it.descricao;
    ws.getCell(r, 3).value = it.especificacao;
    ws.getCell(r, 4).value = it.quantidade;
    ws.getCell(r, 4).numFmt = "#,##0.00";
    ws.getCell(r, 5).value = it.unidade;
    ws.getCell(r, 6).value = it.natureza;
    if (it.valorReferencia > 0) {
      ws.getCell(r, 7).value = it.valorReferencia;
      ws.getCell(r, 7).numFmt = "#,##0.00";
    }
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(r, c);
      cell.border = cellBorder;
      cell.alignment = { vertical: "top", wrapText: true };
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${result.unidade.numero}-${safeFileName(result.unidade.nome)}.xlsx`;
  return {
    filename,
    blob: new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  };
}
