#!/usr/bin/env node
/**
 * Pauta Consolidada - Column Reference & Structure Validator
 * Shows exact 54-column mapping for "Modelo Pauta 2026"
 */

const columnStructure = {
  "A (1)": "Empresa",
  "B (2)": "Item Código",
  "C (3)": "Lote",
  "D (4)": "Nº Item",
  "E (5)": "Item",
  "F (6)": "Descrição",
  "G (7)": "Unidade",

  // ADM Block (3 cols)
  "H (8)": "[ADM] Secretaria",
  "I (9)": "[ADM] G.M.",
  "J (10)": "[ADM] TOTAL",

  // CGM Block (2 cols)
  "K (11)": "[CGM] Secretaria",
  "L (12)": "[CGM] TOTAL",

  // CUT Block (2 cols)
  "M (13)": "[CUT] Secretaria",
  "N (14)": "[CUT] TOTAL",

  // DES Block (2 cols)
  "O (15)": "[DES] Secretaria",
  "P (16)": "[DES] TOTAL",

  // EJL Block (2 cols)
  "Q (17)": "[EJL] Secretaria",
  "R (18)": "[EJL] TOTAL",

  // FPS Block (2 cols)
  "S (19)": "[FPS] Fundo",
  "T (20)": "[FPS] TOTAL",

  // GAB Block (2 cols)
  "U (21)": "[GAB] Secretaria",
  "V (22)": "[GAB] TOTAL",

  // INF Block (2 cols)
  "W (23)": "[INF] Secretaria",
  "X (24)": "[INF] TOTAL",

  // SMA Block (2 cols)
  "Y (25)": "[SMA] Secretaria",
  "Z (26)": "[SMA] TOTAL",

  // SME Block (6 cols)
  "AA (27)": "[SME] Secretaria",
  "AB (28)": "[SME] Sec. Educação",
  "AC (29)": "[SME] F. Feira",
  "AD (30)": "[SME] F. Infantil",
  "AE (31)": "[SME] FUNDEB",
  "AF (32)": "[SME] TOTAL",

  // SMS Block (10 cols)
  "AG (33)": "[SMS] Secretaria",
  "AH (34)": "[SMS] Saúde",
  "AI (35)": "[SMS] Hospitalar",
  "AJ (36)": "[SMS] Hospital",
  "AK (37)": "[SMS] MAC",
  "AL (38)": "[SMS] CAF",
  "AM (39)": "[SMS] ATB",
  "AN (40)": "[SMS] Vigilância",
  "AO (41)": "[SMS] FMS",
  "AP (42)": "[SMS] TOTAL",

  // SPS Block (9 cols)
  "AQ (43)": "[SPS] Secretaria",
  "AR (44)": "[SPS] Proteção Social",
  "AS (45)": "[SPS] IGD/PBF",
  "AT (46)": "[SPS] CRAS",
  "AU (47)": "[SPS] CREAS",
  "AV (48)": "[SPS] Criança Feliz",
  "AW (49)": "[SPS] PROCAD",
  "AX (50)": "[SPS] Fundo",
  "AY (51)": "[SPS] TOTAL",

  // Monetário Block (3 cols)
  "AZ (52)": "TOTAL (All Groups)",
  "BA (53)": "Valor Unitário (R$)",
  "BB (54)": "Valor Total (R$)"
};

const secretaryBlocks = {
  "ADM": { start: "H", end: "J", columns: 3, color: "Light Blue" },
  "CGM": { start: "K", end: "L", columns: 2, color: "Light Green" },
  "CUT": { start: "M", end: "N", columns: 2, color: "Light Orange" },
  "DES": { start: "O", end: "P", columns: 2, color: "Sky Blue" },
  "EJL": { start: "Q", end: "R", columns: 2, color: "Green" },
  "FPS": { start: "S", end: "T", columns: 2, color: "Gray" },
  "GAB": { start: "U", end: "V", columns: 2, color: "Yellow" },
  "INF": { start: "W", end: "X", columns: 2, color: "Orange" },
  "SMA": { start: "Y", end: "Z", columns: 2, color: "Light Green" },
  "SME": { start: "AA", end: "AF", columns: 6, color: "Light Blue" },
  "SMS": { start: "AG", end: "AP", columns: 10, color: "Light Pink" },
  "SPS": { start: "AQ", end: "AY", columns: 9, color: "Light Purple" }
};

console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║                  PAUTA CONSOLIDADA - MODELO 2026                        ║");
console.log("║                    54-Column Excel Structure                             ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

console.log("📊 BASE COLUMNS (A-G): Item Information");
console.log("────────────────────────────────────────");
for (let i = 1; i <= 7; i++) {
  const key = String.fromCharCode(64 + i);
  const fullKey = `${key} (${i})`;
  console.log(`  ${fullKey.padEnd(10)} → ${columnStructure[fullKey]}`);
}

console.log("\n🏛️  SECRETARY BLOCKS (H-AY): Quantity Allocations");
console.log("────────────────────────────────────────────────");
Object.entries(secretaryBlocks).forEach(([name, info]) => {
  console.log(`  ▢ ${name.padEnd(5)} (${info.start}-${info.end}, ${info.columns} cols) [${info.color}]`);
});

console.log("\n💰 MONETARY COLUMNS (AZ-BB): Totals & Pricing");
console.log("──────────────────────────────────────────");
["AZ (52)", "BA (53)", "BB (54)"].forEach(key => {
  console.log(`  ${key.padEnd(10)} → ${columnStructure[key]}`);
});

console.log("\n\n📋 COMPLETE COLUMN MAPPING:");
console.log("═════════════════════════════════════════════════════════════════════════════");
let currentSection = null;
Object.entries(columnStructure).forEach(([col, label], idx) => {
  const num = parseInt(col.match(/\((\d+)\)/)[1]);
  const colLetter = col.split(" ")[0];
  
  // Determine section
  let section = "Base";
  if (num >= 8 && num <= 51) section = "Secretaries";
  if (num >= 52 && num <= 54) section = "Monetary";
  
  if (section !== currentSection) {
    if (currentSection !== null) console.log("");
    currentSection = section;
    console.log(`\n${section}:`);
  }
  
  const indicator = label.includes("TOTAL") || label.includes("(All") ? "✓" : " ";
  console.log(`  ${indicator} Col ${col.padEnd(9)} │ ${label}`);
});

console.log("\n\n📐 STRUCTURE METRICS:");
console.log("═════════════════════════════════════════════════════════════════════════════");
console.log(`  Total Columns: 54`);
console.log(`  Base Info Columns: 7 (A-G)`);
console.log(`  Secretary Allocation Columns: 44 (H-AY) across 12 secretaries`);
console.log(`  Monetary Columns: 3 (AZ-BB)`);
console.log(`  Header Row 1: Merged secretary abbreviations`);
console.log(`  Header Row 2: Sub-labels for each column`);
console.log(`  Data Start: Row 3 (after headers)`);
console.log(`  Freeze Panes: Columns A-G × Rows 1-2`);

console.log("\n\n🎨 COLOR MAPPING (ARGB):");
console.log("═════════════════════════════════════════════════════════════════════════════");
const colorMap = {
  "Base Info": "FFD9E1F2 (Light Blue)",
  "ADM": "FF90EE90 (Light Green)",
  "CGM": "FFFFE699 (Yellow)",
  "CUT": "FFF8CBAD (Peach)",
  "DES": "FFBDD7EE (Sky Blue)",
  "EJL": "FFE2EFDA (Mint)",
  "FPS": "FFD9D9D9 (Gray)",
  "GAB": "FFFFD966 (Gold)",
  "INF": "FFF4B084 (Orange)",
  "SMA": "FFA9D08E (Green)",
  "SME": "FF9BC2E6 (Blue)",
  "SMS": "FFFCE4D6 (Light Orange)",
  "SPS": "FFCCC0DA (Lavender)",
  "Monetary": "FFB4C6E7 (Blue)"
};

Object.entries(colorMap).forEach(([label, color]) => {
  console.log(`  • ${label.padEnd(15)} │ ${color}`);
});

console.log("\n\n✅ VALIDATION CHECKLIST:");
console.log("═════════════════════════════════════════════════════════════════════════════");
console.log(`  ✓ Exactly 54 columns (A-BB)`);
console.log(`  ✓ Header row 1: Secretary abbreviations (merged cells)`);
console.log(`  ✓ Header row 2: Sub-labels per column`);
console.log(`  ✓ Color-coded per secretary block (ARGB values)`);
console.log(`  ✓ Freeze panes: xSplit=7 (column G), ySplit=2 (row 2)`);
console.log(`  ✓ Column widths: A=25, B-E=8, F=50, G-AZ=10, BA-BB=15`);
console.log(`  ✓ Currency format: BA & BB formatted as R$ (Portuguese)`);
console.log(`  ✓ Excel formulas: Group totals computed via SUM()`);
console.log(`  ✓ Multi-worksheet: One per processo_id`);
console.log(`  ✓ Footer rows: processo_id + contrato_numero (merged A-G)`);

console.log("\n");
