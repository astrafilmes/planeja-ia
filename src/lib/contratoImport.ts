// Parser da planilha de contratos por empresa/secretaria/dotação.
import { normalizeText } from "./utils/normalize";
import { readXlsxMatrix } from "./workbook";

export interface ParsedItem {
  sourceRow: number;
  empresa: string;
  lote: string;
  numeroItem: string; // coluna "Nº"
  ordemItem: number | null;
  descricao: string;
  especificacao: string;
  unidade: string;
  valorUnitario: number;
  dotacoes: ParsedDotacao[];
}

export interface ParsedDotacao {
  secretariaSigla: string;
  dotacao: string;
  refColuna: number;
  quantidade: number;
}

export interface ParseResult {
  linhaCabecalho: number;
  empresa: string | null;
  itens: ParsedItem[];
  colunasDotacao: {
    refColuna: number;
    secretariaSigla: string;
    dotacao: string;
  }[];
  totalContratosPrevistos: number;
  totalValor: number;
  refsIgnoradas: number[];
}

// 1-based column index (A=1) -> { sigla, dotacao } a partir do cadastro de Secretarias.
export type AllowedRefs = Map<number, { sigla: string; dotacao: string }>;

const FIXED_LABELS = [
  "EMPRESA",
  "LOTE",
  "Nº",
  "N°",
  "DESCRICAO",
  "DESCRIÇÃO",
  "UNIDADE",
  "ITEM",
  "VALOR UNIT",
  "VALOR TOTAL",
  "TOTAL",
];

function isFixedHeader(label: string): boolean {
  const n = normalizeText(label);
  return [
    "EMPRESA",
    "LOTE",
    "DESCRICAO",
    "UNIDADE",
    "VALOR UNIT",
    "VALOR UNITARIO",
    "VALOR TOTAL",
    "TOTAL",
    "ITEM",
    "N",
    "NO",
  ].some((k) => n === k || n.startsWith(k));
}

export const readWorkbook = readXlsxMatrix;

function findHeaderRow(matrix: unknown[][]): number {
  const max = Math.min(20, matrix.length);
  for (let i = 0; i < max; i++) {
    const row = (matrix[i] ?? []).map(normalizeText);
    const hasEmpresa = row.some((v) => v === "EMPRESA");
    const hasDesc = row.some((v) => v.includes("DESCRICAO"));
    const hasUnid = row.some((v) => v === "UNIDADE");
    if (hasEmpresa && hasDesc && hasUnid) return i;
  }
  return -1;
}

function findCol(
  headerRow: unknown[],
  match: (norm: string) => boolean,
): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (match(normalizeText(headerRow[i]))) return i;
  }
  return -1;
}

function findColLast(
  headerRow: unknown[],
  match: (norm: string) => boolean,
): number {
  for (let i = headerRow.length - 1; i >= 0; i--) {
    if (match(normalizeText(headerRow[i]))) return i;
  }
  return -1;
}

function isNumeroItemHeader(norm: string): boolean {
  if (!norm) return false;
  if (norm === "N" || norm === "NO" || norm === "Nº" || norm === "N°")
    return true;
  if (/^N[º°]?\s*ITEM/.test(norm)) return true;
  if (norm.startsWith("N ") || norm.startsWith("NO ")) return true;
  if (norm.startsWith("NUMERO")) return true;
  return false;
}

function toNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const s = String(raw)
    .replace(/R\$\s*/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseContratoXlsx(
  matrix: unknown[][],
  allowedRefs?: AllowedRefs,
): ParseResult {
  const linhaCabecalho = findHeaderRow(matrix);
  if (linhaCabecalho < 0)
    throw new Error(
      "Não foi possível localizar a linha de cabeçalho (EMPRESA / DESCRIÇÃO / UNIDADE).",
    );
  const header = matrix[linhaCabecalho] ?? [];
  const superior = linhaCabecalho > 0 ? (matrix[linhaCabecalho - 1] ?? []) : [];

  const colEmpresa = findCol(header, (v) => v === "EMPRESA");
  const colLote = findCol(header, (v) => v === "LOTE");
  const colNumeroItem = findCol(header, isNumeroItemHeader);
  const colDesc = findColLast(header, (v) => v.includes("DESCRICAO"));
  const colUnidade = findCol(header, (v) => v === "UNIDADE");
  const colValorUnit = findCol(header, (v) => v.startsWith("VALOR UNIT"));
  const itemCols: number[] = [];
  header.forEach((h, i) => {
    if (normalizeText(h) === "ITEM") itemCols.push(i);
  });
  const colItemDesc = itemCols.length >= 2 ? itemCols[1] : colDesc;
  const colOrdem = itemCols.length >= 1 ? itemCols[0] : -1;

  if (colEmpresa < 0 || colDesc < 0 || colUnidade < 0) {
    throw new Error(
      "Colunas obrigatórias ausentes (EMPRESA / DESCRIÇÃO / UNIDADE).",
    );
  }

  const fixedSet = new Set<number>(
    [
      colEmpresa,
      colLote,
      colNumeroItem,
      colDesc,
      colUnidade,
      colValorUnit,
      colItemDesc,
      colOrdem,
    ].filter((i) => i >= 0),
  );
  const colunasDotacao: ParseResult["colunasDotacao"] = [];

  if (allowedRefs && allowedRefs.size > 0) {
    // Modo cadastrado: usa SOMENTE colunas mapeadas em Secretarias (ref 1-based).
    for (const [oneBased, info] of allowedRefs) {
      const col = oneBased - 1;
      if (col < 0 || col >= header.length) continue;
      if (fixedSet.has(col)) continue;
      colunasDotacao.push({
        refColuna: col,
        secretariaSigla: info.sigla,
        dotacao: info.dotacao,
      });
    }
  } else {
    // Fallback (sem cadastro): comportamento legado.
    let currentSec = "";
    for (let i = 0; i < header.length; i++) {
      const supTxt = normalizeText(superior[i]);
      if (supTxt) currentSec = supTxt;
      if (fixedSet.has(i)) continue;
      const dot = normalizeText(header[i]);
      if (!dot || dot === "TOTAL") continue;
      if (isFixedHeader(header[i] as string)) continue;
      if (!currentSec) continue;
      colunasDotacao.push({
        refColuna: i,
        secretariaSigla: currentSec,
        dotacao: dot,
      });
    }
  }

  const allowedColSet = new Set(colunasDotacao.map((c) => c.refColuna));
  const refsIgnoradasSet = new Set<number>();

  const itens: ParsedItem[] = [];
  let empresaPrincipal: string | null = null;
  let totalValor = 0;
  const contratoKeys = new Set<string>();

  for (let r = linhaCabecalho + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const empresa = String(row[colEmpresa] ?? "").trim();
    const descricao = String(row[colDesc] ?? "").trim();
    const unidade = String(row[colUnidade] ?? "").trim();
    if (!empresa && !descricao && !unidade) continue;
    if (!descricao) continue;
    // Linhas sem EMPRESA são itens fracassados — não vinculam a fornecedor algum.
    if (!empresa) continue;
    if (!empresaPrincipal) empresaPrincipal = empresa;

    const especificacao =
      colItemDesc >= 0 ? String(row[colItemDesc] ?? "").trim() : descricao;
    const valorUnit = colValorUnit >= 0 ? toNumber(row[colValorUnit]) : 0;

    const dotacoes: ParsedDotacao[] = [];
    for (const c of colunasDotacao) {
      const q = toNumber(row[c.refColuna]);
      if (q > 0) {
        dotacoes.push({
          secretariaSigla: c.secretariaSigla,
          dotacao: c.dotacao,
          refColuna: c.refColuna,
          quantidade: q,
        });
      }
    }

    // Detecta colunas com quantidade > 0 mas NÃO autorizadas no cadastro
    if (allowedRefs && allowedRefs.size > 0) {
      for (let c = 0; c < row.length; c++) {
        if (fixedSet.has(c) || allowedColSet.has(c)) continue;
        if (toNumber(row[c]) > 0) refsIgnoradasSet.add(c + 1);
      }
    }

    if (dotacoes.length === 0) continue;

    const numeroItem =
      colNumeroItem >= 0 ? String(row[colNumeroItem] ?? "").trim() : "";
    const ordem = colOrdem >= 0 ? Number(row[colOrdem]) : null;
    const lote = colLote >= 0 ? String(row[colLote] ?? "").trim() : "";
    const empresaRow = empresa || empresaPrincipal || "";

    itens.push({
      sourceRow: r,
      empresa: empresaRow,
      lote,
      numeroItem,
      ordemItem: Number.isFinite(ordem as number) ? (ordem as number) : null,
      descricao,
      especificacao: especificacao || descricao,
      unidade,
      valorUnitario: valorUnit,
      dotacoes,
    });

    for (const d of dotacoes) {
      contratoKeys.add(`${empresaRow}|${d.secretariaSigla}|${d.dotacao}`);
    }
    totalValor += dotacoes.reduce((s, d) => s + d.quantidade * valorUnit, 0);
  }

  if (itens.length === 0)
    throw new Error(
      "Nenhum item válido encontrado. Verifique se as colunas de dotação cadastradas em /secretarias correspondem à planilha.",
    );

  return {
    linhaCabecalho,
    empresa: empresaPrincipal,
    itens,
    colunasDotacao,
    totalContratosPrevistos: contratoKeys.size,
    totalValor,
    refsIgnoradas: Array.from(refsIgnoradasSet).sort((a, b) => a - b),
  };
}

// Agrupa em "contratos preliminares": Empresa + Secretaria + Dotação.
export interface ContratoPreliminarItem {
  itemId: string;
  m2aAtaId: string | null;
  m2aItemId: string | null;
  numeroItem: string;
  lote: string;
  ordemItem: number | null;
  descricao: string;
  especificacao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}

export interface ContratoPreliminar {
  key: string;
  empresa: string;
  m2aAtaId: string | null;
  m2aAtaNumero: string | null;
  fornecedorNome: string | null;
  fornecedorCnpj: string | null;
  secretariaSigla: string;
  dotacao: string;
  refColuna: number;
  itens: ContratoPreliminarItem[];
  totalItens: number;
  totalValor: number;
}

export function agruparContratos(
  itens: {
    id: string;
    descricao: string;
    especificacao?: string | null;
    unidade: string;
    valor_unitario: number;
    empresa: string | null;
    excluido: boolean;
    lote?: string | null;
    m2a_ata_id?: string | null;
    m2a_ata_numero?: string | null;
    m2a_fornecedor_nome?: string | null;
    m2a_fornecedor_cnpj?: string | null;
    m2a_item_id?: string | null;
    numero_item?: string | null;
    ordem_item?: number | null;
  }[],
  dotacoes: {
    item_id: string;
    secretaria_sigla: string;
    dotacao: string;
    ref_coluna: number;
    quantidade: number;
    ignorado: boolean;
  }[],
): ContratoPreliminar[] {
  const itemById = new Map(itens.map((i) => [i.id, i]));
  const map = new Map<string, ContratoPreliminar>();
  for (const d of dotacoes) {
    if (d.ignorado || d.quantidade <= 0) continue;
    const item = itemById.get(d.item_id);
    if (!item || item.excluido) continue;
    const empresa = (item.empresa ?? "").trim();
    const m2aAtaId = item.m2a_ata_id ?? null;
    // IDENTIDADE DO FORNECEDOR: quando há ata M2A, ela é a fonte de verdade
    // (mesmo CNPJ). Sem ata, cai no texto da planilha (fallback legado).
    const fornecedorKey = m2aAtaId
      ? `ATA::${m2aAtaId}`
      : `SEM_ATA::${empresa.toLowerCase().replace(/\s+/g, "")}`;
    const key = `${fornecedorKey}|${d.secretaria_sigla}|${d.dotacao}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        empresa,
        m2aAtaId,
        m2aAtaNumero: item.m2a_ata_numero ?? null,
        fornecedorNome:
          (item.m2a_fornecedor_nome && item.m2a_fornecedor_nome.trim()) ||
          empresa ||
          null,
        fornecedorCnpj:
          (item.m2a_fornecedor_cnpj && item.m2a_fornecedor_cnpj.trim()) ||
          null,
        secretariaSigla: d.secretaria_sigla,
        dotacao: d.dotacao,
        refColuna: d.ref_coluna,
        itens: [],
        totalItens: 0,
        totalValor: 0,
      });
    }
    const c = map.get(key)!;
    const subtotal = d.quantidade * (item.valor_unitario || 0);
    c.itens.push({
      itemId: item.id,
      m2aAtaId,
      m2aItemId: item.m2a_item_id ?? null,
      numeroItem: item.numero_item ?? "",
      lote: item.lote ?? "",
      ordemItem: item.ordem_item ?? null,
      descricao: item.descricao,
      especificacao: item.especificacao ?? "",
      unidade: item.unidade,
      quantidade: d.quantidade,
      valorUnitario: item.valor_unitario,
      subtotal,
    });
    c.totalItens += 1;
    c.totalValor += subtotal;
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      a.secretariaSigla.localeCompare(b.secretariaSigla) ||
      a.dotacao.localeCompare(b.dotacao) ||
      (a.m2aAtaId ?? "").localeCompare(b.m2aAtaId ?? ""),
  );
}
