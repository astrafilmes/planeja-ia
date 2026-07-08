import { parseUnidadesGestorasDetalheHtml, unidadeGestoraDetalheConfirmaInclusao } from "../src/m2a/atas-participantes-utils.js";

// Resposta REAL do M2A (JSON com html_table) — mesma que o usuário colou
const json = JSON.stringify({html_table: `
<table><tbody>
<tr class="kt-datatable__row tr_ata_registro_preco_unidade_gestora" id="tr_6568">
  <td class="text-left"><span>02 - GABINETE DO PREFEITO (2025)</span></td>
  <td class="text-center"><span>17/06/2025</span></td>
  <td class="text-center"><span class="kt-badge kt-badge--success">Sim</span></td>
  <td class="text-center"><span class="kt-badge kt-badge--success">Ativo</span></td>
  <td class="text-center"></td>
</tr>
<tr class="kt-datatable__row tr_ata_registro_preco_unidade_gestora" id="tr_23212">
  <td class="text-left"><span>02 - GABINETE DO PREFEITO (2026)</span></td>
  <td class="text-center"><span>05/01/2026</span></td>
  <td class="text-center"><span class="kt-badge kt-badge--danger">Não</span></td>
  <td class="text-center"><span class="kt-badge kt-badge--success">Ativo</span></td>
  <td class="text-center"></td>
</tr>
</tbody></table>
`});

const rows = parseUnidadesGestorasDetalheHtml(json);
console.log("linhas parseadas:", rows.length);
console.log(JSON.stringify(rows, null, 2));

const check = unidadeGestoraDetalheConfirmaInclusao(rows, {
  nomeSecretaria: "GABINETE DO PREFEITO",
  ano: "2025",
});
console.log("check 2025:", check);

const check2026 = unidadeGestoraDetalheConfirmaInclusao(rows, {
  nomeSecretaria: "GABINETE DO PREFEITO",
  ano: "2026",
});
console.log("check 2026:", check2026);
