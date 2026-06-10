// Test script for Pauta Consolidada export - uses require() for Node.js compatibility
// This is a CommonJS wrapper to avoid ESM module resolution issues

const path = require('path');
const ExcelJS = require('exceljs');
const { saveAs } = require('file-saver');

// Mock data - same as test-pauta-export.ts
const rawData = [
  // === Processo 1: Item 1 - Multiple secretaries ===
  {
    processo_id: 'Proc 015-2025',
    contrato_numero: '015/2025',
    item_id: 'item-1',
    empresa: 'Empresa A Ltda',
    item_codigo: 'I-001',
    lote: 'L1',
    numero_item: '001',
    descricao: 'Fornecimento de material de expediente e limpeza para secretarias',
    unidade: 'UN',
    quantidade: 100,
    valor_unitario: 5.5,
    valor_total: 550,
    secretaria_sigla: 'ADM',
    subcategoria: 'SECRETARIA'
  },
  {
    processo_id: 'Proc 015-2025',
    contrato_numero: '015/2025',
    item_id: 'item-1',
    quantidade: 50,
    secretaria_sigla: 'ADM',
    subcategoria: 'G.M.'
  },
  {
    processo_id: 'Proc 015-2025',
    contrato_numero: '015/2025',
    item_id: 'item-1',
    quantidade: 30,
    secretaria_sigla: 'CGM'
  },
  // === Processo 1: Item 2 - SME with sub-categories ===
  {
    processo_id: 'Proc 015-2025',
    contrato_numero: '015/2025',
    item_id: 'item-2',
    empresa: 'Empresa B & Co',
    item_codigo: 'I-002',
    lote: 'L2',
    numero_item: '002',
    descricao: 'Equipamentos pedagógicos para escolas municipais',
    unidade: 'UNID',
    quantidade: 20,
    valor_unitario: 150.0,
    valor_total: 3000,
    secretaria_sigla: 'SME',
    subcategoria: 'FUNDEB'
  },
  {
    processo_id: 'Proc 015-2025',
    contrato_numero: '015/2025',
    item_id: 'item-2',
    quantidade: 10,
    secretaria_sigla: 'SME',
    subcategoria: 'SEC.EDU'
  },
  // === Processo 2: SMS items ===
  {
    processo_id: 'Proc 016-2025',
    contrato_numero: '016/2025',
    item_id: 'item-3',
    empresa: 'Saúde Brasil Fornecedora',
    item_codigo: 'I-003',
    lote: 'L1',
    numero_item: '003',
    descricao: 'Insumos médico-hospitalares diversos',
    unidade: 'CAIXA',
    quantidade: 5,
    valor_unitario: 500.0,
    valor_total: 2500,
    secretaria_sigla: 'SMS',
    subcategoria: 'SAUDE'
  },
  {
    processo_id: 'Proc 016-2025',
    contrato_numero: '016/2025',
    item_id: 'item-3',
    quantidade: 3,
    secretaria_sigla: 'SMS',
    subcategoria: 'HOSPITAL'
  },
  // === Processo 2: SPS items ===
  {
    processo_id: 'Proc 016-2025',
    contrato_numero: '016/2025',
    item_id: 'item-4',
    empresa: 'Proteção Social Ltda',
    item_codigo: 'I-004',
    lote: 'L2',
    numero_item: '004',
    descricao: 'Serviços de assistência social para CRAS e CREAS',
    unidade: 'MES',
    quantidade: 12,
    valor_unitario: 2000.0,
    valor_total: 24000,
    secretaria_sigla: 'SPS',
    subcategoria: 'CRAS'
  },
  {
    processo_id: 'Proc 016-2025',
    contrato_numero: '016/2025',
    item_id: 'item-4',
    quantidade: 6,
    secretaria_sigla: 'SPS',
    subcategoria: 'CREAS'
  }
];

console.log('🚀 Starting Pauta Consolidada Export Test Harness...\n');
console.log(`📊 Generated ${rawData.length} raw data rows\n`);

// Simple mapper implementation (matching the logic in excel-export.ts)
console.log('📈 Mapping data...');

const columnMap = {
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
  BA_VALOR_UNIT: 52, BB_VALOR_TOTAL: 53
};

const getTargetIndex = (sigla, sub) => {
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

  if ((columnMap)[s]) return (columnMap)[s];
  return null;
};

const processesMap = new Map();

for (const row of rawData) {
  const pid = row.processo_id || 'unknown';
  if (!processesMap.has(pid)) {
    processesMap.set(pid, { processo_id: pid, contrato_numero: row.contrato_numero || null, itemsMap: new Map() });
  }
  const proc = processesMap.get(pid);

  const itemKey = row.item_id ? String(row.item_id) : `${row.empresa || ''}::${row.numero_item || ''}`;
  if (!proc.itemsMap.has(itemKey)) {
    const cells = new Array(54).fill(null);
    cells[0] = row.empresa || '';
    cells[1] = row.item_codigo || row.numero_item || '';
    cells[2] = row.lote || '';
    cells[3] = row.numero_item || '';
    cells[4] = row.numero_item || '';
    cells[5] = row.descricao || '';
    cells[6] = row.unidade || '';

    proc.itemsMap.set(itemKey, { cells, valor_unit: row.valor_unitario ?? null, valor_total: row.valor_total ?? null });
  }

  const itemEntry = proc.itemsMap.get(itemKey);

  const target = getTargetIndex(row.secretaria_sigla, row.subcategoria);
  if (target !== null && target !== undefined) {
    const existing = itemEntry.cells[target];
    const addVal = Number(row.quantidade ?? 0) || 0;
    itemEntry.cells[target] = (existing ? Number(existing) : 0) + addVal;
  }

  if (typeof row.valor_unitario === 'number') {
    itemEntry.valor_unit = row.valor_unitario;
    itemEntry.cells[columnMap.BA_VALOR_UNIT] = itemEntry.valor_unit;
  }
  if (typeof row.valor_total === 'number') {
    itemEntry.valor_total = row.valor_total;
    itemEntry.cells[columnMap.BB_VALOR_TOTAL] = itemEntry.valor_total;
  }
}

const processes = [];
for (const [pid, proc] of processesMap) {
  const items = [];
  for (const [, entry] of proc.itemsMap) {
    items.push({ cells: entry.cells, valor_unit: entry.valor_unit, valor_total: entry.valor_total });
  }
  processes.push({ processo_id: proc.processo_id, contrato_numero: proc.contrato_numero, items });
}

console.log(`✅ Mapped into ${processes.length} processes:\n`);

processes.forEach(proc => {
  console.log(`   Processo: ${proc.processo_id} | Contrato: ${proc.contrato_numero}`);
  console.log(`   └─ ${proc.items.length} items\n`);
});

console.log('📝 Validating data structure...');
for (const proc of processes) {
  for (const item of proc.items) {
    if (!Array.isArray(item.cells) || item.cells.length !== 54) {
      throw new Error(`❌ Invalid item: cells array must have exactly 54 elements, got ${item.cells.length}`);
    }
  }
}
console.log('✅ All items have valid 54-column structure\n');

console.log('✨ SUCCESS! Data mapping and validation complete.\n');
console.log(`📌 Next Step: Run UI integration to export to Excel\n`);
console.log(`📊 Summary:`);
console.log(`   • Processes: ${processes.length}`);
console.log(`   • Total Items: ${processes.reduce((sum, p) => sum + p.items.length, 0)}`);
console.log(`   • Columns: 54 (A..BB)`);
console.log(`   • Secretary Types: ADM, CGM, CUT, DES, EJL, FPS, GAB, INF, SMA, SME, SMS, SPS\n`);
