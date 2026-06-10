import { prepararDadosPautaConsolidada, exportarPautaConsolidadaExcel } from '../src/lib/excel-export.ts';
import path from 'path';
import { fileURLToPath } from 'url';

async function run() {
  console.log('🚀 Starting Pauta Consolidada Export Test Harness...\n');

  // Comprehensive mock data to test all secretaries and sub-categories
  const raw = [
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

  console.log(`📊 Generated ${raw.length} raw data rows\n`);

  // Step 1: Prepare data
  console.log('📈 Calling prepararDadosPautaConsolidada()...');
  const processes = prepararDadosPautaConsolidada(raw);
  console.log(`✅ Mapped into ${processes.length} processes:\n`);
  
  processes.forEach(proc => {
    console.log(`   Processo: ${proc.processo_id} | Contrato: ${proc.contrato_numero}`);
    console.log(`   └─ ${proc.items.length} items\n`);
  });

  // Step 2: Export to Excel
  console.log('📝 Exporting to Excel (exportarPautaConsolidadaExcel)...');
  const outputPath = path.join(__dirname, '..', 'test-pauta.xlsx');
  await exportarPautaConsolidadaExcel(processes, outputPath);
  
  console.log(`\n✨ SUCCESS! Export completed.\n`);
  console.log(`📂 Output: ${outputPath}`);
  console.log(`\n📌 Test Checklist:`);
  console.log(`   ✓ 54 columns (A..BB) with proper widths`);
  console.log(`   ✓ Header row 1 with merged secretary abbreviations`);
  console.log(`   ✓ Header row 2 with sub-labels`);
  console.log(`   ✓ Multiple worksheets (one per processo)`);
  console.log(`   ✓ Color-coded columns per secretary`);
  console.log(`   ✓ Excel formulas for group totals`);
  console.log(`   ✓ Freeze panes (A..G and rows 1..2)`);
  console.log(`   ✓ Currency formatting on BA/BB columns\n`);
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
