function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeCellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  const cell = value as Record<string, unknown>;
  if (
    hasOwn(cell, "result") &&
    cell.result !== null &&
    cell.result !== undefined
  ) {
    return normalizeCellValue(cell.result);
  }
  if ("text" in cell && typeof cell.text === "string") return cell.text;
  if ("richText" in cell && Array.isArray(cell.richText)) {
    return cell.richText
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text ?? "")
          : "",
      )
      .join("");
  }

  return null;
}

function columnNameToIndex(name: string): number {
  let n = 0;
  for (const char of name.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!match) return null;
  const col = columnNameToIndex(match[1]);
  const row = Number(match[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

function toFormulaNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(
    String(value)
      .replace(/R\$\s*/gi, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
}

function sumRange(
  startRef: string,
  endRef: string,
  resolve: (row: number, col: number) => unknown,
): number {
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start || !end) return 0;

  const rowStart = Math.min(start.row, end.row);
  const rowEnd = Math.max(start.row, end.row);
  const colStart = Math.min(start.col, end.col);
  const colEnd = Math.max(start.col, end.col);

  let total = 0;
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      total += toFormulaNumber(resolve(row, col));
    }
  }
  return total;
}

function evaluateFormula(
  formula: string,
  resolve: (row: number, col: number) => unknown,
): unknown {
  const expression = formula.trim().replace(/^=/, "");
  const directRef = parseCellRef(expression);
  if (directRef) return resolve(directRef.row, directRef.col);

  let replaced = expression.replace(
    /SUM\(\s*(\$?[A-Z]+\$?\d+)\s*:\s*(\$?[A-Z]+\$?\d+)\s*\)/gi,
    (_match, start: string, end: string) =>
      String(sumRange(start, end, resolve)),
  );

  replaced = replaced.replace(/\$?[A-Z]+\$?\d+/gi, (ref) => {
    const parsed = parseCellRef(ref);
    if (!parsed) return "0";
    return String(toFormulaNumber(resolve(parsed.row, parsed.col)));
  });

  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) return null;

  try {
    const result = Function(`"use strict"; return (${replaced});`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function resolveMatrixCell(
  rawMatrix: unknown[][],
  memo: Map<string, unknown>,
  rowNumber: number,
  colNumber: number,
  visiting: Set<string>,
): unknown {
  const key = `${rowNumber}:${colNumber}`;
  if (memo.has(key)) return memo.get(key);
  if (visiting.has(key)) return null;
  visiting.add(key);

  const raw = rawMatrix[rowNumber]?.[colNumber];
  let resolved: unknown = null;

  if (
    isRecord(raw) &&
    (typeof raw.formula === "string" || "sharedFormula" in raw)
  ) {
    if (
      hasOwn(raw, "result") &&
      raw.result !== null &&
      raw.result !== undefined
    ) {
      resolved = normalizeCellValue(raw.result);
    } else if (typeof raw.formula === "string") {
      resolved = evaluateFormula(raw.formula, (row, col) =>
        resolveMatrixCell(rawMatrix, memo, row, col, visiting),
      );
    }
  } else {
    resolved = normalizeCellValue(raw);
  }

  visiting.delete(key);
  memo.set(key, resolved);
  return resolved;
}

export async function readXlsxMatrix(file: File): Promise<unknown[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("A planilha nao possui abas para leitura.");
  }

  const colCount = worksheet.columnCount;
  const rawMatrix: unknown[][] = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    for (let colNumber = 1; colNumber <= colCount; colNumber++) {
      values.push(row.getCell(colNumber).value);
    }
    rawMatrix.push(values);
  }

  const memo = new Map<string, unknown>();
  const matrix: unknown[][] = [];
  for (let row = 0; row < rawMatrix.length; row++) {
    const values: unknown[] = [];
    for (let col = 0; col < colCount; col++) {
      values.push(resolveMatrixCell(rawMatrix, memo, row, col, new Set()));
    }
    matrix.push(values);
  }

  return matrix;
}
