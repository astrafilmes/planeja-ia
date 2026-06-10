import ExcelJS from 'exceljs';
import type { Cell, Worksheet } from 'exceljs';
import * as FileSaver from 'file-saver';

const saveAs =
  (FileSaver as any).saveAs ??
  (FileSaver as any).default?.saveAs ??
  (FileSaver as any).default;

export interface ContractReportData {
  contract_id: string;
  preposto?: string | null;
  fiscal?: string | null;
  m2a_ata_numero?: string | null;
  processo_id?: string | null;
  numero_contrato?: string | null;
  secretaria_nome?: string | null;
  secretaria_sigla?: string | null;
  fornecedor_nome?: string | null;
  objeto?: string | null;
  dotacao?: string | null;
  created_at?: string | null;
  item_id?: string | null;
  item_ordem?: number | null;
  item_numero?: number | null;
  item_lote?: number | null;
  item_descricao?: string | null;
  item_especificacao?: string | null;
  item_unidade?: string | null;
  item_quantidade?: number | null;
  item_valor_unitario?: number | null;
  item_valor_total?: number | null;
}

export interface ContractGroupedData {
  header: {
    contract_id: string;
    preposto?: string | null;
    fiscal?: string | null;
    m2a_ata_numero?: string | null;
    processo_id?: string | null;
    numero_contrato?: string | null;
    secretaria_nome?: string | null;
    secretaria_sigla?: string | null;
    fornecedor_nome?: string | null;
    objeto?: string | null;
    dotacao?: string | null;
    created_at?: string | null;
  };
  items: Array<{
    item_id?: string | null;
    item_ordem?: number | null;
    item_numero?: number | null;
    item_lote?: number | null;
    item_descricao?: string | null;
    item_especificacao?: string | null;
    item_unidade?: string | null;
    item_quantidade?: number | null;
    item_valor_unitario?: number | null;
    item_valor_total?: number | null;
  }>;
}

export const groupContractData = (data: ContractReportData[]): ContractGroupedData[] => {
  const contractsMap = new Map<string, ContractGroupedData>();
  data.forEach(row => {
    const id = row.contract_id || 'unknown';
    if (!contractsMap.has(id)) {
      contractsMap.set(id, {
        header: {
          contract_id: id,
          numero_contrato: row.numero_contrato,
          secretaria_nome: row.secretaria_nome,
          secretaria_sigla: row.secretaria_sigla,
          fornecedor_nome: row.fornecedor_nome,
          objeto: row.objeto,
          dotacao: row.dotacao,
          created_at: row.created_at,
          preposto: row.preposto,
          fiscal: row.fiscal,
          m2a_ata_numero: row.m2a_ata_numero,
          processo_id: row.processo_id,
        },
        items: []
      });
    }
    const contract = contractsMap.get(id)!;
    if (row.item_id) {
      contract.items.push({
        item_id: row.item_id,
        item_ordem: row.item_ordem,
        item_numero: row.item_numero,
        item_lote: row.item_lote,
        item_descricao: row.item_descricao,
        item_especificacao: row.item_especificacao,
        item_unidade: row.item_unidade,
        item_quantidade: row.item_quantidade,
        item_valor_unitario: row.item_valor_unitario,
        item_valor_total: row.item_valor_total,
      });
    }
  });
  return Array.from(contractsMap.values());
};

const safeText = (v?: string | null) => (v ? String(v).replace(/\s+/g, ' ').trim() : '');

/**
 * Força descrições técnicas para CAIXA ALTA e parágrafo único.
 */
const formatTechnicalDesc = (v?: string | null) => (v ? String(v).replace(/\n+/g, ' ').trim().toUpperCase() : '');

export async function exportarRelatorioContratoExcel(contracts: ContractGroupedData[], isBatch: boolean = false): Promise<void> {
  if (!contracts || contracts.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Planeja GovTech';
  workbook.created = new Date();

  const forceNumber = (val: any) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? val : num;
  };

  for (const contract of contracts) {
    let baseName = safeText(contract.header.numero_contrato) || 'Contrato';
    baseName = baseName.replace(/[\\/*?:[\]]/g, '_').substring(0, 31);
    let sheetName = baseName;
    let counter = 1;
    
    while (workbook.worksheets.some((w: Worksheet) => w.name === sheetName)) {
      const suffix = ` (${counter})`;
      sheetName = (baseName.substring(0, 31 - suffix.length) + suffix).substring(0, 31);
      counter++;
    }

    const ws = workbook.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      }
    });

    ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

    const headerRows: Array<[string, string]> = [
      ['Tipo de Relatório:', 'Relatório de Contrato'],
      ['Número do Contrato:', safeText(contract.header.numero_contrato)],
      ['Secretaria:', `${safeText(contract.header.secretaria_nome)}${contract.header.secretaria_sigla ? ` (${safeText(contract.header.secretaria_sigla)})` : ''}`.trim()],
      ['Fornecedor:', safeText(contract.header.fornecedor_nome)],
      ['Objeto:', safeText(contract.header.objeto)],
      ['Dotação:', safeText(contract.header.dotacao)],
      ['Data de Criação:', contract.header.created_at ? new Date(contract.header.created_at).toLocaleDateString('pt-BR') : '']
    ];

    headerRows.forEach((cols, idx) => {
      const r = idx + 1;
      const labelCell = ws.getCell(`A${r}`);
      labelCell.value = cols[0];
      labelCell.font = { bold: false };
      labelCell.alignment = { vertical: 'top', horizontal: 'left' };

      ws.mergeCells(`B${r}:H${r}`);
      const valueCell = ws.getCell(`B${r}`);
      valueCell.value = cols[1] || '';
      valueCell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    });

    ws.addRow([]);

    const tableHeader = ['Ordem', 'Lote', 'Descrição', 'Especificação', 'Unidade', 'Quantidade', 'Valor Unitário', 'Valor Total'];
    const headerRow = ws.addRow(tableHeader);

    const widths = [10, 10, 50, 50, 15, 18, 18, 18];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    headerRow.eachCell((cell: Cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    for (const it of contract.items) {
      const row = ws.addRow([
        forceNumber(it.item_ordem),
        forceNumber(it.item_lote),
        formatTechnicalDesc(it.item_descricao),
        formatTechnicalDesc(it.item_especificacao),
        safeText(it.item_unidade),
        it.item_quantidade ?? null,
        it.item_valor_unitario ?? null,
        it.item_valor_total ?? null
      ]);

      row.eachCell({ includeEmpty: true }, (cell: Cell, colNumber: number) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        if (colNumber === 3 || colNumber === 4) {
          cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
        } else if (colNumber >= 6 && colNumber <= 8) {
          cell.alignment = { vertical: 'top', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'top', horizontal: 'center' };
        }

        if ((colNumber === 1 || colNumber === 2) && typeof cell.value === 'number') {
          cell.numFmt = '0';
        }
        if (colNumber === 6 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
        if ((colNumber === 7 || colNumber === 8) && typeof cell.value === 'number') {
          cell.numFmt = '"R$" #,##0.00';
        }
      });
    }

    ws.properties.defaultRowHeight = 18;
  }

  const fileName = isBatch
    ? `contratos_relatorio_lote_${new Date().toISOString().slice(0, 10)}.xlsx`
    : `contrato_${safeText(contracts[0].header.numero_contrato) || 'relatorio'}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), fileName);
}


// ===== FASE 2: PAUTA CONSOLIDADA (Arquitetura Data-Driven) =====

interface PautaColDef {
  index: number;
  macro: string;
  sub: string;
  width: number;
  row1Color: string;
  row2Color: string;
  isGroupTotal?: boolean;
  isGeneralTotal?: boolean;
  sumCols?: number[];
  isCurrency?: boolean;
  /** Quando true, as células de dados desta coluna herdam a cor da linha 2 do cabeçalho. */
  fillRow2InData?: boolean;
}

// Cores GovTech (ARGB - prefixo FF)
const C_BASE = 'FFD9D9D9';
const C_ADM = 'FFFFFF00';
const C_CGM = 'FFFFC000';
const C_CUT = 'FF66FFFF';
const C_DES = 'FF00B050';
const C_EJL = 'FFE6B8B7';
const C_FPS = 'FFC4D79B';
const C_GAB = 'FFCC66FF';
const C_INF = 'FF009999';
const C_SMA = 'FF92D050';
const C_SME = 'FF66CCFF';
const C_SME_A = 'FF538DD5';
const C_SME_B = 'FFB7DEE8';
const C_SMS = 'FFCCFF33';
const C_SMS_GREEN = 'FF00B050';
const C_SMS_ORANGE = 'FFFFC000';
const C_SMS_LIME = 'FF92D050';
const C_SPS = 'FFC4BD97';
const C_SPS_A = 'FFDDD9C4';
const C_SPS_B = 'FFD9D9D9';

const PAUTA_COLUMNS_CONFIG: PautaColDef[] = [
  // BASE (1..7)
  { index: 1, macro: '', sub: 'EMPRESA',   width: 12, row1Color: C_BASE, row2Color: C_BASE },
  { index: 2, macro: '', sub: 'ITEM',      width: 5,  row1Color: C_BASE, row2Color: C_BASE },
  { index: 3, macro: '', sub: 'LOTE',      width: 5,  row1Color: C_BASE, row2Color: C_BASE },
  { index: 4, macro: '', sub: 'Nº',        width: 5,  row1Color: C_BASE, row2Color: C_BASE },
  { index: 5, macro: '', sub: 'DESCRIÇÃO',     width: 40, row1Color: C_BASE, row2Color: C_BASE },
  { index: 6, macro: '', sub: 'ESPECIFICAÇÃO', width: 40, row1Color: C_BASE, row2Color: C_BASE },
  { index: 7, macro: '', sub: 'UNIDADE',       width: 15, row1Color: C_BASE, row2Color: C_BASE },
  // ADM
  { index: 8,  macro: 'ADM', sub: 'SECRET', width: 5, row1Color: C_ADM, row2Color: C_ADM },
  { index: 9,  macro: 'ADM', sub: 'G. M.',  width: 5, row1Color: C_ADM, row2Color: C_ADM },
  { index: 10, macro: 'ADM', sub: 'TOTAL',  width: 5, row1Color: C_ADM, row2Color: C_ADM, isGroupTotal: true, sumCols: [8, 9] },
  // CGM
  { index: 11, macro: 'CGM', sub: 'SECRET', width: 5, row1Color: C_CGM, row2Color: C_CGM },
  { index: 12, macro: 'CGM', sub: 'TOTAL',  width: 5, row1Color: C_CGM, row2Color: C_CGM, isGroupTotal: true, sumCols: [11] },
  // CUT
  { index: 13, macro: 'CUT', sub: 'SECRET', width: 5, row1Color: C_CUT, row2Color: C_CUT },
  { index: 14, macro: 'CUT', sub: 'TOTAL',  width: 5, row1Color: C_CUT, row2Color: C_CUT, isGroupTotal: true, sumCols: [13] },
  // DES
  { index: 15, macro: 'DES', sub: 'SECRET', width: 5, row1Color: C_DES, row2Color: C_DES },
  { index: 16, macro: 'DES', sub: 'TOTAL',  width: 5, row1Color: C_DES, row2Color: C_DES, isGroupTotal: true, sumCols: [15] },
  // EJL
  { index: 17, macro: 'EJL', sub: 'SECRET', width: 5, row1Color: C_EJL, row2Color: C_EJL },
  { index: 18, macro: 'EJL', sub: 'TOTAL',  width: 5, row1Color: C_EJL, row2Color: C_EJL, isGroupTotal: true, sumCols: [17] },
  // FPS
  { index: 19, macro: 'FPS', sub: 'FUNDO', width: 5, row1Color: C_FPS, row2Color: C_FPS },
  { index: 20, macro: 'FPS', sub: 'TOTAL', width: 5, row1Color: C_FPS, row2Color: C_FPS, isGroupTotal: true, sumCols: [19] },
  // GAB
  { index: 21, macro: 'GAB', sub: 'SECRET', width: 5, row1Color: C_GAB, row2Color: C_GAB },
  { index: 22, macro: 'GAB', sub: 'TOTAL',  width: 5, row1Color: C_GAB, row2Color: C_GAB, isGroupTotal: true, sumCols: [21] },
  // INF
  { index: 23, macro: 'INF', sub: 'SECRET', width: 5, row1Color: C_INF, row2Color: C_INF },
  { index: 24, macro: 'INF', sub: 'TOTAL',  width: 5, row1Color: C_INF, row2Color: C_INF, isGroupTotal: true, sumCols: [23] },
  // SMA
  { index: 25, macro: 'SMA', sub: 'SECRET', width: 5, row1Color: C_SMA, row2Color: C_SMA },
  { index: 26, macro: 'SMA', sub: 'TOTAL',  width: 5, row1Color: C_SMA, row2Color: C_SMA, isGroupTotal: true, sumCols: [25] },
  // SME (27..32)
  { index: 27, macro: 'SME', sub: 'SEC',     width: 5, row1Color: C_SME, row2Color: C_SME_A },
  { index: 28, macro: 'SME', sub: 'SEC EDU', width: 5, row1Color: C_SME, row2Color: C_SME_A, fillRow2InData: true },
  { index: 29, macro: 'SME', sub: 'FF',      width: 5, row1Color: C_SME, row2Color: C_SME_B },
  { index: 30, macro: 'SME', sub: 'FI',      width: 5, row1Color: C_SME, row2Color: C_SME_B },
  { index: 31, macro: 'SME', sub: 'FUNDEB',  width: 5, row1Color: C_SME, row2Color: C_SME, fillRow2InData: true },
  { index: 32, macro: 'SME', sub: 'TOTAL',   width: 5, row1Color: C_SME, row2Color: C_SME, isGroupTotal: true, sumCols: [27, 28, 29, 30, 31] },
  // SMS (33..42)
  { index: 33, macro: 'SMS', sub: 'SEC',      width: 5, row1Color: C_SMS, row2Color: C_SMS_GREEN },
  { index: 34, macro: 'SMS', sub: 'SAÚDE',    width: 5, row1Color: C_SMS, row2Color: C_SMS_GREEN, fillRow2InData: true },
  { index: 35, macro: 'SMS', sub: 'HOSP',     width: 5, row1Color: C_SMS, row2Color: C_SMS_ORANGE },
  { index: 36, macro: 'SMS', sub: 'HOSPITAL', width: 5, row1Color: C_SMS, row2Color: C_SMS_ORANGE, fillRow2InData: true },
  { index: 37, macro: 'SMS', sub: 'MAC',      width: 5, row1Color: C_SMS, row2Color: C_SMS_LIME },
  { index: 38, macro: 'SMS', sub: 'CAF',      width: 5, row1Color: C_SMS, row2Color: C_SMS_LIME },
  { index: 39, macro: 'SMS', sub: 'ATB',      width: 5, row1Color: C_SMS, row2Color: C_SMS_LIME },
  { index: 40, macro: 'SMS', sub: 'VIGIL.',   width: 5, row1Color: C_SMS, row2Color: C_SMS_LIME },
  { index: 41, macro: 'SMS', sub: 'FMS',      width: 5, row1Color: C_SMS, row2Color: C_SMS, fillRow2InData: true },
  { index: 42, macro: 'SMS', sub: 'TOTAL',    width: 5, row1Color: C_SMS, row2Color: C_SMS, isGroupTotal: true, sumCols: [33, 34, 35, 36, 37, 38, 39, 40, 41] },
  // SPS (43..51)
  { index: 43, macro: 'SPS', sub: 'SECRET',         width: 5, row1Color: C_SPS, row2Color: C_SPS_A },
  { index: 44, macro: 'SPS', sub: 'PROTECAO',       width: 5, row1Color: C_SPS, row2Color: C_SPS_A, fillRow2InData: true },
  { index: 45, macro: 'SPS', sub: 'IGD/PBF',        width: 5, row1Color: C_SPS, row2Color: C_SPS_B },
  { index: 46, macro: 'SPS', sub: 'CRAS SCFV',      width: 5, row1Color: C_SPS, row2Color: C_SPS_B },
  { index: 47, macro: 'SPS', sub: 'CREAS',          width: 5, row1Color: C_SPS, row2Color: C_SPS_B },
  { index: 48, macro: 'SPS', sub: 'CRIANÇA FELIZ',  width: 5, row1Color: C_SPS, row2Color: C_SPS_B },
  { index: 49, macro: 'SPS', sub: 'PROCAD',         width: 5, row1Color: C_SPS, row2Color: C_SPS_B },
  { index: 50, macro: 'SPS', sub: 'FUNDO',          width: 5, row1Color: C_SPS, row2Color: C_SPS_B, fillRow2InData: true },
  { index: 51, macro: 'SPS', sub: 'TOTAL',          width: 5, row1Color: C_SPS, row2Color: C_SPS, isGroupTotal: true, sumCols: [43, 44, 45, 46, 47, 48, 49, 50] },
  // TOTAIS FINAIS (52..54)
  { index: 52, macro: '', sub: 'TOTAL',        width: 15, row1Color: C_BASE, row2Color: C_BASE, isGeneralTotal: true },
  { index: 53, macro: '', sub: 'VALOR UNIT',   width: 15, row1Color: C_BASE, row2Color: C_BASE, isCurrency: true },
  { index: 54, macro: '', sub: 'VALOR TOTAL',  width: 15, row1Color: C_BASE, row2Color: C_BASE, isCurrency: true }
];

const colLetter = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export async function exportarPautaConsolidadaExcel(
  processes: Array<{
    processo_id: string;
    processo_nome?: string | null;
    contrato_numero?: string | null;
    items: Array<{ cells: (string | number | null)[]; valor_unit?: number | null; valor_total?: number | null }>;
  }>,
  fileName?: string
): Promise<void> {
  if (!processes || processes.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Planeja GovTech';
  workbook.created = new Date();
  const moedaFmt = '"R$" #,##0.00';

  for (const proc of processes) {
    const displayName = (proc.processo_nome || proc.processo_id || proc.contrato_numero || 'Processo').toString();
    const safeName = displayName.replace(/[\\/*?:[\]]/g, '_').substring(0, 31);
    const ws = workbook.addWorksheet(safeName, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws.views = [{ state: 'frozen', xSplit: 7, ySplit: 2 }];

    // Configuração das larguras das colunas
    PAUTA_COLUMNS_CONFIG.forEach(cfg => {
      ws.getColumn(cfg.index).width = cfg.width;
    });

    // Construção dos Cabeçalhos (Linha 1 macro / Linha 2 subcategoria)
    const row1 = ws.getRow(1);
    const row2 = ws.getRow(2);
    row1.height = 13;
    row2.height = 60;

    PAUTA_COLUMNS_CONFIG.forEach(cfg => {
      const cell1 = row1.getCell(cfg.index);
      const cell2 = row2.getCell(cfg.index);

      cell1.value = cfg.macro;
      cell2.value = cfg.sub;

      cell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cfg.row1Color } };
      cell1.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
      cell1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell1.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      cell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cfg.row2Color } };
      cell2.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
      // Da coluna 8 em diante, texto da linha 2 rotacionado em 90 graus
      cell2.alignment = cfg.index >= 8
        ? { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: false }
        : { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell2.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Mesclagem automática da Linha 1 (Macros)
    let startMerge = 1;
    for (let i = 1; i <= PAUTA_COLUMNS_CONFIG.length; i++) {
      const isLast = i === PAUTA_COLUMNS_CONFIG.length;
      const currentMacro = PAUTA_COLUMNS_CONFIG[i - 1].macro;
      const nextMacro = isLast ? null : PAUTA_COLUMNS_CONFIG[i].macro;

      if (currentMacro !== nextMacro || isLast) {
        if (startMerge !== i && currentMacro !== '') {
          ws.mergeCells(`${colLetter(startMerge)}1:${colLetter(i)}1`);
        }
        startMerge = i + 1;
      }
    }

    const startRow = 3;

    // Preenchimento de Dados
    proc.items.forEach((item, idx) => {
      const rowIndex = startRow + idx;

      const rowData = new Array(54).fill(null);
      item.cells.forEach((val, i) => {
        if (i < 54) rowData[i] = val;
      });

      // Coluna E (idx 4) DESCRIÇÃO e F (idx 5) ESPECIFICAÇÃO em CAIXA ALTA
      if (typeof rowData[4] === 'string') rowData[4] = formatTechnicalDesc(rowData[4]);
      if (typeof rowData[5] === 'string') rowData[5] = formatTechnicalDesc(rowData[5]);

      // Força B/C/D (idx 1,2,3) para Number quando possível
      [1, 2, 3].forEach(i => {
        const v = rowData[i];
        if (v !== null && v !== undefined && v !== '') {
          const n = Number(String(v).replace(',', '.'));
          if (!Number.isNaN(n)) rowData[i] = n;
        }
      });

      const row = ws.addRow(rowData);
      row.height = 13;

      row.eachCell({ includeEmpty: true }, (cell: Cell, colNumber: number) => {
        const colConf = PAUTA_COLUMNS_CONFIG[colNumber - 1];

        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };

        // Alinhamentos — sem quebra de linha em nenhuma célula de dados
        if (colNumber === 1) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        } else if (colNumber === 5 || colNumber === 6) {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        } else if (colConf.isCurrency || typeof cell.value === 'number') {
          cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: false };
        } else {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        }

        // Formatos numéricos
        if ((colNumber === 2 || colNumber === 3 || colNumber === 4) && typeof cell.value === 'number') {
          cell.numFmt = '0';
        }
        if (colConf.isCurrency && typeof cell.value === 'number') {
          cell.numFmt = moedaFmt;
        }

        // Herda a cor da linha 2 nas células de dados das colunas marcadas (TOTAIS e subtotais visuais)
        if (colConf.fillRow2InData || colConf.isGroupTotal || colConf.isGeneralTotal) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colConf.row2Color } };
        }
      });

      // Fórmulas Dinâmicas por Linha baseadas na Configuração
      PAUTA_COLUMNS_CONFIG.forEach(colConf => {
        if (colConf.sumCols && colConf.sumCols.length > 0) {
          const letter = colLetter(colConf.index);
          const isConsecutive = colConf.sumCols.length > 2 &&
            (colConf.sumCols[colConf.sumCols.length - 1] - colConf.sumCols[0] === colConf.sumCols.length - 1);

          let formulaStr = '';
          if (isConsecutive) {
            formulaStr = `SUM(${colLetter(colConf.sumCols[0])}${rowIndex}:${colLetter(colConf.sumCols[colConf.sumCols.length - 1])}${rowIndex})`;
          } else {
            formulaStr = `SUM(${colConf.sumCols.map(c => `${colLetter(c)}${rowIndex}`).join(',')})`;
          }

          const cell = ws.getCell(`${letter}${rowIndex}`);
          cell.value = { formula: formulaStr } as any;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colConf.row2Color } };
        }
      });

      // Total Geral Dinâmico (Soma de todos os subtotais)
      const groupTotalCols = PAUTA_COLUMNS_CONFIG.filter(c => c.isGroupTotal).map(c => c.index);
      if (groupTotalCols.length > 0) {
        const formulaStr = `SUM(${groupTotalCols.map(c => `${colLetter(c)}${rowIndex}`).join(',')})`;
        const cell = ws.getCell(`AZ${rowIndex}`);
        cell.value = { formula: formulaStr } as any;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BASE } };
      }

      // Sobrescrita explícita para Valores Unitários e Totais (BA e BB)
      if (typeof item.valor_unit === 'number') {
        const cell = ws.getCell(`BA${rowIndex}`);
        cell.value = item.valor_unit;
        cell.numFmt = moedaFmt;
        cell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
      }
      if (typeof item.valor_total === 'number') {
        const cell = ws.getCell(`BB${rowIndex}`);
        cell.value = item.valor_total;
        cell.numFmt = moedaFmt;
        cell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
      }
    });

    const footerRowIndex = startRow + proc.items.length;
    ws.getRow(footerRowIndex).height = 13;
    ws.mergeCells(`A${footerRowIndex}:G${footerRowIndex}`);
    const footerCell = ws.getCell(`A${footerRowIndex}`);
    footerCell.value = proc.contrato_numero ? `${proc.processo_id} / ${proc.contrato_numero}` : proc.processo_id;
    footerCell.font = { bold: false, size: 9, color: { argb: 'FF000000' } };
    footerCell.alignment = { horizontal: 'left', vertical: 'middle' };
  }

  const outName = fileName || `pauta_consolidada_${new Date().toISOString().slice(0, 10)}.xlsx`;
  try {
    if (typeof window === 'undefined') {
      await (workbook.xlsx as any).writeFile(outName);
      return;
    }
  } catch (e) {
    // Fallback normal de ambiente de navegação
  }

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), outName);
}

/**
 * prepararDadosPautaConsolidada
 * Indexação preservada (0-based) integrando com segurança ao mapeamento dos 54 itens.
 */
export function prepararDadosPautaConsolidada(dadosBrutos: any[]): Array<{ processo_id: string; processo_nome?: string | null; contrato_numero?: string | null; items: Array<{ cells: (string | number | null)[]; valor_unit?: number | null; valor_total?: number | null }> }> {
  const columnMap: Record<string, number> = {
    ADM: 7, ADM_GM: 8, ADM_TOTAL: 9,
    CGM: 10, CGM_TOTAL: 11,
    CUT: 12, CUT_TOTAL: 13,
    DES: 14, DES_TOTAL: 15,
    EJL: 16, EJL_TOTAL: 17,
    FPS_FUNDO: 18, FPS_TOTAL: 19,
    GAB: 20, GAB_TOTAL: 21,
    INF: 22, INF_TOTAL: 23,
    SMA: 24, SMA_TOTAL: 25,
    SME_SEC: 26, SME_SECEDU: 27, SME_FF: 28, SME_FI: 29, SME_FUNDEB: 30, SME_TOTAL: 31,
    SMS_SEC: 32, SMS_SAUDE: 33, SMS_HOSP: 34, SMS_HOSPITAL: 35, SMS_MAC: 36, SMS_CAF: 37, SMS_ATB: 38, SMS_VIGIL: 39, SMS_FMS: 40, SMS_TOTAL: 41,
    SPS_SECRET: 42, SPS_PROTECAO: 43, SPS_IGD_PBF: 44, SPS_CRAS: 45, SPS_CREAS: 46, SPS_CRIANCA_FELIZ: 47, SPS_PROCAD: 48, SPS_FUNDO: 49, SPS_TOTAL: 50,
    AZ_TOTAL: 51, BA_VALOR_UNIT: 52, BB_VALOR_TOTAL: 53
  };

  const processesMap = new Map<string, { processo_id: string; processo_nome?: string | null; contrato_numero?: string | null; itemsMap: Map<string, { cells: (string | number | null)[]; valor_unit?: number | null; valor_total?: number | null }> }>();

  const getTargetIndex = (sigla?: string | null, sub?: string | null): number | null => {
    if (!sigla) return null;
    const s = String(sigla).toUpperCase().trim();
    const subKey = sub ? String(sub).toUpperCase().replace(/[^A-Z0-9]/g, '_') : '';

    if (columnMap[s]) return columnMap[s];

    if (s === 'SME') {
      if (subKey.includes('SEC EDU') || subKey.includes('SEC_EDU') || subKey.includes('SECEDU')) return columnMap.SME_SECEDU;
      if (subKey.includes('FUNDEB')) return columnMap.SME_FUNDEB;
      if (subKey.includes('FF')) return columnMap.SME_FF;
      if (subKey.includes('FI')) return columnMap.SME_FI;
      return columnMap.SME_SEC;
    }

    if (s === 'SMS') {
      if (subKey.includes('SAUDE')) return columnMap.SMS_SAUDE;
      if (subKey.includes('HOSP')) return columnMap.SMS_HOSP;
      if (subKey.includes('HOSPITAL')) return columnMap.SMS_HOSPITAL;
      if (subKey.includes('MAC')) return columnMap.SMS_MAC;
      if (subKey.includes('CAF')) return columnMap.SMS_CAF;
      if (subKey.includes('ATB')) return columnMap.SMS_ATB;
      if (subKey.includes('VIGIL')) return columnMap.SMS_VIGIL;
      if (subKey.includes('FMS')) return columnMap.SMS_FMS;
      return columnMap.SMS_SEC;
    }

    if (s === 'SPS') {
      if (subKey.includes('PROTECA')) return columnMap.SPS_PROTECAO;
      if (subKey.includes('IGD') || subKey.includes('PBF')) return columnMap.SPS_IGD_PBF;
      if (subKey.includes('CRAS')) return columnMap.SPS_CRAS;
      if (subKey.includes('CREAS')) return columnMap.SPS_CREAS;
      if (subKey.includes('CRIANCA')) return columnMap.SPS_CRIANCA_FELIZ;
      if (subKey.includes('PROCAD')) return columnMap.SPS_PROCAD;
      if (subKey.includes('FUNDO')) return columnMap.SPS_FUNDO;
      return columnMap.SPS_SECRET;
    }

    if ((columnMap as any)[s]) return (columnMap as any)[s];
    return null;
  };

  for (const row of dadosBrutos) {
    const pid = row.processo_id || row.process_id || 'unknown';
    if (!processesMap.has(pid)) {
      processesMap.set(pid, { processo_id: pid, processo_nome: row.processo_nome || null, contrato_numero: row.contrato_numero || row.numero_contrato || null, itemsMap: new Map() });
    }
    const proc = processesMap.get(pid)!;
    if (!proc.processo_nome && row.processo_nome) proc.processo_nome = row.processo_nome;

    // Consolida o mesmo item (mesmo lote + nº item) através de múltiplos contratos do mesmo processo.
    // Assim, se o item 5 aparece em ADM e GAB (contratos distintos), o resultado é UMA linha
    // com as quantidades distribuídas nas colunas ADM e GAB.
    const lote = String(row.lote ?? '').trim();
    const numItem = String(row.numero_item ?? row.numero ?? row.item_numero ?? '').trim();
    const itemKey = (lote || numItem)
      ? `L:${lote}|N:${numItem}`
      : (row.item_id ? String(row.item_id) : `${row.empresa || ''}::${numItem}`);

    const descricaoRaw = row.descricao ?? row.item_descricao ?? row.objeto ?? '';
    const especificacaoRaw = row.especificacao ?? row.item_especificacao ?? '';
    const descricao = formatTechnicalDesc(String(descricaoRaw));
    const especificacao = formatTechnicalDesc(String(especificacaoRaw));

    if (!proc.itemsMap.has(itemKey)) {
      const cells = new Array(54).fill(null);
      cells[0] = row.empresa || row.fornecedor_nome || '';
      cells[1] = row.item_codigo || row.item || numItem || '';
      cells[2] = lote || '';
      cells[3] = numItem || '';
      // E (idx 4) = DESCRIÇÃO ; F (idx 5) = ESPECIFICAÇÃO ; fallback duplicado
      cells[4] = descricao || especificacao || '';
      cells[5] = especificacao || descricao || '';
      cells[6] = row.unidade || row.item_unidade || '';

      proc.itemsMap.set(itemKey, { cells, valor_unit: row.valor_unitario ?? row.item_valor_unitario ?? null, valor_total: row.valor_total ?? row.item_valor_total ?? null });
    }

    const itemEntry = proc.itemsMap.get(itemKey)!;

    // Reforça fallback caso outra linha do mesmo item traga a info ausente
    if (!itemEntry.cells[4] && (descricao || especificacao)) itemEntry.cells[4] = descricao || especificacao;
    if (!itemEntry.cells[5] && (especificacao || descricao)) itemEntry.cells[5] = especificacao || descricao;

    const target = getTargetIndex(row.secretaria_sigla || row.sigla || row.unidade_sigla, row.subcategoria || row.dotacao || row.subtipo);
    if (target !== null && target !== undefined) {
      const existing = itemEntry.cells[target];
      const addVal = Number(row.quantidade ?? row.item_quantidade ?? 0) || 0;
      itemEntry.cells[target] = (existing ? Number(existing) : 0) + addVal;
    }

    if (typeof row.valor_unitario === 'number' || typeof row.item_valor_unitario === 'number') {
      itemEntry.valor_unit = row.valor_unitario ?? row.item_valor_unitario ?? null;
      itemEntry.cells[columnMap.BA_VALOR_UNIT] = itemEntry.valor_unit ?? null;
    }
    if (typeof row.valor_total === 'number' || typeof row.item_valor_total === 'number') {
      itemEntry.valor_total = row.valor_total ?? row.item_valor_total ?? null;
      itemEntry.cells[columnMap.BB_VALOR_TOTAL] = itemEntry.valor_total ?? null;
    }
  }

  const processes: Array<{ processo_id: string; contrato_numero?: string | null; items: Array<{ cells: (string | number | null)[]; valor_unit?: number | null; valor_total?: number | null }> }> = [];
  for (const [pid, proc] of processesMap) {
    const items: Array<{ cells: (string | number | null)[]; valor_unit?: number | null; valor_total?: number | null }> = [];
    for (const [, entry] of proc.itemsMap) {
      items.push({ cells: entry.cells, valor_unit: entry.valor_unit, valor_total: entry.valor_total });
    }
    processes.push({ processo_id: proc.processo_id, contrato_numero: proc.contrato_numero, items });
  }

  return processes;
}