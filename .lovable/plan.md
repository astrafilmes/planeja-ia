# Plano — Identificação Determinística de Fornecedor via Ata M2A

## Diagnóstico do problema atual

Hoje o "fornecedor" de cada contrato preliminar é derivado do texto bruto da coluna **EMPRESA** da planilha. Isso causa duplicidade porque a mesma empresa aparece com grafias diferentes:

- `PAPER JOY` vs `PAPER JOY PAPELARIA LTDA`
- `CEBRASIL - CEARA BRASIL DISTRIBUIDORA LTDA` vs `CEBRASIL`

Onde o vazamento acontece hoje:

- `src/lib/contratoImport.ts::agruparContratos` (linha 354) — chave do contrato é `${empresa}|${secretaria}|${dotacao}|${m2aAtaId}`. Se a mesma ata aparece com dois textos diferentes de "empresa", vira dois contratos.
- `src/features/importar-contratos/lib.ts::resolveFornecedorKey` — normaliza o texto da planilha; nunca consulta o CNPJ da ata.
- `usePrepostosState` e o painel de prepostos agrupam por esse mesmo texto → o usuário vê o mesmo fornecedor duas vezes (screenshot).

O sistema **já** puxa o snapshot M2A (atas + fornecedor + CNPJ) e **já** faz `resolveM2AItemMatch` por número de item. O que falta é **usar a ata como fonte de verdade do fornecedor** e ignorar o texto da planilha para identidade.

## Objetivo

Trocar o eixo de identidade do fornecedor: de **texto livre da planilha** para **ata M2A (CNPJ)**. Consequência: contratos preliminares agrupam por ata, prepostos aparecem uma vez por fornecedor real, contratos nomeados com a razão social oficial.

## Novo fluxo de importação (UX)

```text
1. Usuário cola link do processo M2A + escolhe arquivo
2. Botão "Sincronizar atas" (executa ANTES do parse)
   → puxa snapshot: atas, itens, fornecedores (nome + CNPJ)
   → mostra painel "Atas encontradas": N atas, N itens, N fornecedores únicos
3. Usuário confirma → parse da planilha
4. Sistema linka cada linha da planilha a um id_ata (auto por nº item + score)
5. Tela de revisão mostra:
   - Itens com match automático (verde)
   - Itens ambíguos (amarelo) → dropdown com atas candidatas do processo
   - Itens sem match (vermelho) → dropdown obrigatório antes de autorizar
6. Ao autorizar: contratos gerados com fornecedor = ata.fornecedor.nome (razão social + CNPJ oficiais)
```

Diferença chave: o texto "EMPRESA" da planilha vira apenas **dica de matching**, nunca identidade.

## Mudanças por camada

### 1. Modelo de dados (migration)

Adicionar em `contrato_import_itens`:

- `m2a_fornecedor_cnpj text` — copiado da ata no momento do match
- índice `(job_id, m2a_ata_id)` para agrupamento rápido

Backfill: itens existentes com `m2a_ata_id` recebem CNPJ via join com `m2a_atas`.

Nenhuma mudança em `contrato_import_jobs` / `contrato_import_dotacoes`.

### 2. `src/lib/contratoImport.ts`

**`agruparContratos`** — nova chave de agrupamento:

```text
antes:  `${empresa}|${secretaria}|${dotacao}|${m2aAtaId}`
depois: `${m2aAtaId ?? `SEM_ATA::${empresaNorm}`}|${secretaria}|${dotacao}`
```

- Contratos com ata: agrupados **exclusivamente** por `m2a_ata_id`. Texto "empresa" da planilha é ignorado para identidade.
- Contratos sem ata (fallback): mantém agrupamento por empresa normalizada para não perder dados legados.
- `fornecedorNome` no `ContratoPreliminar` passa a ser sempre `item.m2a_fornecedor_nome` quando houver ata; só cai no texto da planilha se `m2aAtaId === null`.

### 3. `src/features/importar-contratos/lib.ts`

- `resolveFornecedorKey(contrato)` → prioridade: `m2aAtaId` > `cnpj_normalizado` > texto normalizado. Retorna `ATA::${id}` quando ata presente.
- `resolveFornecedorNome(contrato)` → prioridade: `fornecedorNome` (já vem da ata) > texto da planilha.
- `resolveM2AItemMatch` — inalterado, mas o score passa a favorecer também CNPJ (quando a planilha tiver coluna CNPJ; opcional, se não tiver mantém como está).

### 4. `useImportarPlanilha.ts`

Ao montar `itensInsert` (linha 264), quando `canApplyMatch`:

```ts
m2a_fornecedor_cnpj: ata?.fornecedor?.cnpj ?? null,
```

E também popular quando o usuário resolver manualmente um item ambíguo (via `useItemMutations`).

### 5. `useContratosDerivados.ts`

`fornecedoresPrepostoTargets` passa a ser deduplicado pela nova `resolveFornecedorKey` — resultado: uma linha por ata (ou por CNPJ), eliminando as duplicatas do screenshot.

### 6. UI

- **UploadCard**: dividir em dois passos visuais — (a) sincronizar processo, (b) escolher planilha. Botão "Analisar planilha" desabilitado enquanto o snapshot não estiver carregado.
- **AutorizarGeracaoPanel** (painel de fornecedores/prepostos): passa a exibir `fornecedor.nome` da ata + CNPJ formatado + nº ata.
- **ItensReviewTable**: coluna "Fornecedor" mostra nome da ata (não da planilha); item sem ata fica destacado com CTA "Selecionar ata".
- **ContratosPreviewList**: título do contrato = razão social da ata; badge secundária com nº da ata.

### 7. `useItemMutations`

Nova ação `setItemAta(itemId, ataId | null)` que:

- Atualiza `m2a_ata_id`, `m2a_item_id`, `m2a_ata_numero`, `m2a_fornecedor_nome`, `m2a_fornecedor_cnpj`, `m2a_match_status = 'manual'`.
- Invalida `["cij-detail", jobId]`.

Usada pelos dropdowns de "Selecionar ata" na tela de revisão.

## Regras inegociáveis mantidas

- Design system: tokens semânticos, zero cor hardcoded.
- `notify.*` preservado nos mesmos pontos.
- `logAudit` em cada mutação de match manual.
- Compatibilidade com jobs antigos (fallback por empresa normalizada quando `m2a_ata_id` for null).
- Typecheck 0 erros.

## Divisão de entrega (3 partes)

1. **Migration + backfill de CNPJ** + ajuste de `agruparContratos` e `resolveFornecedorKey/Nome`. Verificar em jobs existentes que as duplicatas do screenshot colapsam.
2. **`useImportarPlanilha` + `useItemMutations.setItemAta`** — popular CNPJ e permitir correção manual.
3. **UI**: UploadCard em 2 passos, AutorizarGeracaoPanel com CNPJ+ata, ItensReviewTable com seletor de ata, ContratosPreviewList com razão social da ata.

## Riscos e mitigação

- **Jobs antigos** sem CNPJ: backfill via `m2a_atas` cobre o histórico; itens que continuarem sem ata (fallback) mantêm comportamento atual.
- **Ata M2A com fornecedor vazio**: manter fallback para texto da planilha e sinalizar na UI ("fornecedor não informado na ata").
- **Snapshot demorado**: já é feito hoje; apenas antecipamos a percepção movendo o botão para antes do upload.

Aguardando aprovação para iniciar a Parte 1.
