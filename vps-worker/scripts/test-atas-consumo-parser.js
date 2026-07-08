// Testa os parsers de atas-consumo.js contra HTML real do M2A
// (fixtures extraídas das conversas do usuário — ata 5115, contrato 69607).
// Não faz HTTP: substitui `m2a.get` por um mock que devolve o HTML esperado
// conforme o path solicitado.

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// ---------- fixtures ----------
const HTML_TABELA_CONTRATOS_5115 = `{"html":"<table><thead><tr><th></th><th></th><th><span>Número contrato</span></th><th><span>Número processo</span></th><th><span>Contratante</span></th><th><span>Fornecedor</span></th><th><span>Início vigência</span></th><th><span>Fim vigência</span></th><th><span>Valor</span></th><th><span>Situação</span></th><th><span>Origem</span></th><th><span>Ações</span></th></tr></thead><tbody class=\\"kt-datatable__body\\"><tr class=\\"kt-datatable__row tr_contrato\\" id=\\"tr_69607\\"><td class=\\"text-center\\"></td><th class=\\"text-center\\"><label><input type=\\"checkbox\\" value=\\"69607\\"/></label></th><td class=\\"text-center\\"><a href=\\"/contratos/69607/\\" class=\\"btn btn-label btn-label-info\\"><span>026/2025DES02</span></a></td><td class=\\"text-center\\"><a href=\\"/processo_administrativo/43993/\\"><span>00003.20250403/0001-28</span></a></td><td class=\\"text-left\\"><span>05 - SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA (2025)</span></td><td class=\\"text-left\\"><span>WM SAMPAIO INDUSTRIA COMERCIO SERVICOS E EMPREENDIMENTOS LTDA</span></td><td class=\\"text-center\\"><span>07/07/2025</span></td><td class=\\"text-center\\"><span>07/07/2026</span></td><td class=\\"text-right\\"><span>R$ 88.862,50</span></td><td class=\\"text-center\\"><span class=\\"kt-badge kt-badge--success\\">Ativo</span></td><td class=\\"text-center\\"><span class=\\"kt-badge kt-badge--info\\">Manual</span></td><td></td></tr><tr class=\\"kt-datatable__row tr_contrato\\" id=\\"tr_70000\\"><td></td><th><input type=\\"checkbox\\" value=\\"70000\\"/></th><td><a><span>099/2025SME01</span></a></td><td><a><span>00099.20250101/0001-11</span></a></td><td><span>03 - SECRETARIA MUNICIPAL DE EDUCACAO (2025)</span></td><td><span>FORNECEDOR X</span></td><td><span>10/10/2025</span></td><td><span>10/10/2026</span></td><td><span>R$ 100,00</span></td><td><span class=\\"kt-badge kt-badge--danger\\">Cancelado</span></td><td><span class=\\"kt-badge\\">Manual</span></td><td></td></tr></tbody></table>"}`;

const HTML_ITENS_CONTRATO_69607 = `<table><tbody><tr class="kt-datatable__row tr_contrato_item odd" id="tr_933595"><td class="details-control" url_detail="/contratos/itens/subtabela/933595/"><i class="flaticon2-down kt-font-info"></i></td><td class="text-left"><span>37 - MARGARINA VEGETAL COM SAL - 500G</span></td><td class="text-center"><span>POTE</span></td><td class="text-center td-to-value"><div><input type="text" class="form-control mask_quantidade input-focus" value="25,0" placeholder="25,0" id="quantidade_selecionada_933595" style="text-align: right;"/><div class="m2a-badge badge-success">/ 25,00</div></div></td><td class="text-center"><span class="kt-badge kt-badge--inline kt-badge--lg kt-badge--rounded">25,00</span></td><td class="text-right">R$ 9,22</td><td class="text-right"><span class="kt-badge">R$ 9,22</span></td><td></td></tr><tr class="kt-datatable__row tr_contrato_item" id="tr_638482"><td></td><td class="text-left"><span>12 - ARROZ TIPO 1 - 1KG</span></td><td><span>PACOTE</span></td><td class="td-to-value"><div><input type="text" class="form-control mask_quantidade" value="10,0" id="quantidade_selecionada_638482"/><div class="m2a-badge badge-success">/ 20,00</div></div></td><td><span>20,00</span></td><td>R$ 4,00</td><td><span>R$ 4,00</span></td><td></td></tr></tbody></table>`;

// ---------- mock do client m2a: sobrescreve método na instância ----------
const calls = [];
const { m2a } = await import("../src/m2a-client.js");
m2a.get = async (path) => {
  calls.push(path);
  if (path.startsWith("/ata_registro_precos/tabela_contratos/5115")) {
    return { status: 200, html: HTML_TABELA_CONTRATOS_5115 };
  }
  if (path.startsWith("/contratos/itens/tabela/69607")) {
    return { status: 200, html: HTML_ITENS_CONTRATO_69607 };
  }
  if (path.startsWith("/contratos/itens/tabela/70000")) {
    throw new Error("não deveria buscar itens de contrato cancelado");
  }
  return { status: 200, html: "<html>nenhum registro encontrado</html>" };
};

const { listarContratosDaAta, listarItensContrato, consumoDaAta } = await import(
  "../src/m2a/atas-consumo.js"
);

// ---------- teste 1: listarContratosDaAta ----------
console.log("\n[1] listarContratosDaAta(5115)");
const r1 = await listarContratosDaAta(5115);
console.log("  path:", r1.path);
console.log("  contratos:", JSON.stringify(r1.contratos, null, 2));
assert.equal(r1.contratos.length, 2, "esperava 2 contratos");
assert.equal(r1.contratos[0].contratoId, 69607);
assert.equal(r1.contratos[0].numero, "026/2025DES02");
assert.equal(
  r1.contratos[0].secretariaNome,
  "SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA",
  "nome de secretaria não bateu",
);
assert.equal(r1.contratos[0].cancelado, false);
assert.equal(r1.contratos[1].contratoId, 70000);
assert.equal(r1.contratos[1].cancelado, true, "contrato 2 devia estar cancelado");
console.log("  OK");

// ---------- teste 2: listarItensContrato ----------
console.log("\n[2] listarItensContrato(69607)");
const r2 = await listarItensContrato(69607);
console.log("  itens:", JSON.stringify(r2, null, 2));
assert.equal(r2.length, 2);
assert.equal(r2[0].contratoItemId, 933595);
assert.equal(r2[0].numero, "37");
assert.equal(r2[0].quantidadeContratada, 25);
assert.equal(r2[0].cotaSecretaria, 25);
assert.equal(r2[1].contratoItemId, 638482);
assert.equal(r2[1].numero, "12");
assert.equal(r2[1].quantidadeContratada, 10);
assert.equal(r2[1].cotaSecretaria, 20);
console.log("  OK");

// ---------- teste 3: consumoDaAta agrega e ignora cancelados ----------
console.log("\n[3] consumoDaAta(5115)");
const r3 = await consumoDaAta(5115);
console.log("  agregado:", JSON.stringify(r3.agregado, null, 2));
console.log("  detalhado (linhas):", r3.detalhado.length);
const secKeys = Object.keys(r3.agregado);
assert.equal(secKeys.length, 1, "só a secretaria do contrato ativo deve aparecer");
const [sec] = secKeys;
assert.ok(sec.includes("DESENVOLVIMENTO RURAL"), "chave normalizada incorreta: " + sec);
assert.equal(r3.agregado[sec]["37"], 25);
assert.equal(r3.agregado[sec]["12"], 10);
console.log("  OK");

console.log("\nTODOS OS PARSERS PASSARAM ✅");
console.log("Chamadas ao m2a.get:", calls);
