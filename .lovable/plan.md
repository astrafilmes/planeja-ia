## Diagnóstico (resumo)

O subagente mapeou seis defeitos reais em `src/lib/m2a-snapshot.ts` + schema:

1. **DELETE + INSERT** total em `m2a_itens`/`m2a_atas`/`m2a_contratos_snapshot` a cada sync — IDs internos mudam, links por `id` quebram silenciosamente.
2. Reconciliação de `contrato_itens` **só atua quando `m2a_item_id` já está preenchido** → itens legados, importados sem match, ou criados manualmente nunca são re-ligados.
3. Dedupe em memória por `numero_item` descarta o registro errado quando há colisão entre atas distintas → contratos apontando para o item descartado ficam órfãos.
4. `numero_item` / `lote` / `descricao` em `contrato_itens` não são atualizados quando estão vazios e o portal tem o valor.
5. Sem UNIQUE / FK em `m2a_itens(processo_id, m2a_item_id)` nem índice em `contrato_itens.m2a_item_id` — corrupção silenciosa possível.
6. `contrato_item_dotacoes.quantidade_alocada` nunca é re-validado contra o portal (risco controlado: usuário pode ter alocado manualmente).

## Objetivo

Sincronização **idempotente, determinística, sem perda de relação**: re-roda 100x → mesmo estado. Itens antigos (mesmo sem `m2a_item_id`) são re-ligados quando o portal os identifica.

## Plano de execução

### 1. Migração SQL (estrutura defensiva)

```text
- ALTER m2a_itens: UNIQUE (processo_id, m2a_item_id)
- CREATE INDEX contrato_itens_m2a_item_id_idx ON contrato_itens(m2a_item_id)
                WHERE m2a_item_id IS NOT NULL
- Função helper normalize_numero_item(text) -> text
  (lower + trim + strip leading zeros + strip non-alphanumeric exceto "/" e "-")
```

Sem FK física entre `contrato_itens.m2a_item_id` e `m2a_itens.m2a_item_id` porque o item M2A pode ser removido do portal e o contrato local precisa sobreviver — a integridade fica em código + UNIQUE.

### 2. Reescrita de `persistM2ASnapshot` (`src/lib/m2a-snapshot.ts`)

Passo a passo, dentro de uma única transação RPC (ver §3):

a. **Snapshot pré-sync**: ler estado atual de `m2a_atas`, `m2a_itens`, `contrato_itens` do processo (contém id local + m2a_item_id + numero_item normalizado). Usado para diffing e logging.

b. **Normalização do payload**:
   - Construir mapa `byPortalId: Map<m2a_item_id, item>` (chave primária, sem perda).
   - Construir mapa `byNumero: Map<normalized_numero_item, item[]>` (lista — não descartar duplicatas).
   - Se houver colisão real de `numero_item` em atas diferentes, **manter todos** e logar `m2a_envio_logs` como warning estruturado.

c. **UPSERT m2a_atas / m2a_itens / m2a_contratos_snapshot** usando `onConflict: "processo_id,m2a_item_id"` (atas: `processo_id,m2a_ata_id`). Sem DELETE prévio.

d. **Cleanup**: `DELETE FROM m2a_itens WHERE processo_id = X AND m2a_item_id NOT IN (...payload)` — só remove o que o portal removeu de verdade. Idem atas.

e. **Reconciliação de `contrato_itens`** em três passes ordenados:
   1. **Match por `m2a_item_id` existente** → atualiza valores (já existia).
   2. **Match por `(numero_item normalizado, contrato.fornecedor_nome)`** para linhas com `m2a_item_id IS NULL` → preenche `m2a_item_id`, `numero_item`, `lote`, `descricao`, `unidade`, `valor_unitario`. Só roda se a chave for unívoca no escopo do processo+fornecedor.
   3. **Match por `(numero_item normalizado)` puro** → fallback, apenas se houver exatamente 1 candidato. Caso contrário, registra ambiguidade em `m2a_envio_logs` e mantém `m2a_item_id = NULL`.

f. **Re-validação de `contrato_item_dotacoes`**:
   - Recalcular `valor_total = quantidade * valor_unitario` para itens cujo `valor_unitario` mudou.
   - **Não** sobrescrever `quantidade_alocada` (preserva ajuste manual).
   - Se a soma das alocações > quantidade total do item após sync, gerar warning em `m2a_envio_logs` (não bloqueia).

g. **Retorno estruturado**: `{ insertedAtas, insertedItens, updatedItens, relinkedItens, removedItens, ambiguousItens[], warnings[] }`. UI exibe banner com resumo.

### 3. Atomicidade

Encapsular passos (c)–(f) em RPC PostgreSQL `sync_m2a_snapshot(p_processo_id uuid, p_payload jsonb)` `SECURITY DEFINER` — garante rollback se qualquer etapa falhar. O client continua chamando `persistM2ASnapshot`, mas internamente é um único `supabase.rpc(...)`.

### 4. Suíte de testes (Vitest)

Arquivo `src/lib/__tests__/m2a-snapshot.test.ts` cobrindo:

| # | Cenário | Asserção |
|---|---------|----------|
| 1 | Sync inicial vazio | insere atas/itens, contrato_itens não tocado |
| 2 | Re-sync idêntico | zero updates, zero inserts (idempotência) |
| 3 | Item removido do portal | item removido de `m2a_itens`, contrato_item permanece com `m2a_item_id` órfão + warning |
| 4 | Item legado sem `m2a_item_id`, numero bate | relinka corretamente |
| 5 | Numero ambíguo entre dois fornecedores | desempata por fornecedor, sem relinkagem cruzada |
| 6 | Numero ambíguo dentro do mesmo fornecedor | não relinka, gera warning |
| 7 | Colisão de `numero_item` entre duas atas | mantém os dois m2a_itens, dedupe não descarta |
| 8 | `valor_unitario` mudou no portal | atualiza contrato_item + recalcula valor_total das dotações |
| 9 | Alocação manual em dotações preservada após sync | quantidade_alocada inalterada |
| 10 | Sync 100 vezes em loop (fuzz idempotência) | estado final estável |
| 11 | Payload com 5 mil itens | performance < 5s (smoke test) |
| 12 | RPC falha no meio | rollback completo, processos.m2a_sync_at não atualizado |

Mocks: `supabase` client com `@supabase/supabase-js` driver memória (ou mock manual com tabelas em `Map`). Banco real **não** é usado nos testes unitários.

### 5. Verificação manual pós-deploy

- Rodar sync em 1 processo conhecido com itens legados.
- Conferir no banco: `SELECT count(*) FROM contrato_itens WHERE m2a_item_id IS NULL AND contrato_id IN (...)` → deve cair para zero (ou número esperado de itens manuais).
- Conferir `m2a_envio_logs` para warnings.

### 6. Não-objetivos (fora do escopo desta entrega)

- UI para resolver ambiguidades manualmente (fica para próxima fase).
- Migração retroativa de dados já corrompidos: o primeiro sync após o deploy já corrige naturalmente via passe 2/3.
- Alterar fluxo de `importar-contratos.tsx` — usa o mesmo `persistM2ASnapshot`, então herda a correção automaticamente.

## Entregáveis

1. `supabase/migrations/<ts>_m2a_sync_hardening.sql` — UNIQUE + índice + função `normalize_numero_item` + RPC `sync_m2a_snapshot`.
2. `src/lib/m2a-snapshot.ts` reescrito (UPSERT + 3 passes + retorno estruturado).
3. `src/lib/normalize.ts` — exporta `normalizeNumeroItem` espelhando a função SQL para consistência client/server.
4. `src/hooks/useM2ASync.ts` — exibe toast com resumo `{ relinked, ambiguous, removed }`.
5. `src/lib/__tests__/m2a-snapshot.test.ts` — 12 cenários acima.
6. Atualização mínima de `src/routes/processos.$id.tsx` para mostrar warnings de ambiguidade no card de sync (se houver).

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Match por número errado em fornecedores diferentes | Passe 2 exige fornecedor; passe 3 só roda se candidato único |
| Quantidade alocada divergente após mudança no portal | Warning, nunca sobrescrita silenciosa |
| RPC com payload grande estoura limite | Chunking por ata (já existe) + payload reduzido antes do RPC (sem campos não usados) |
| Regressão em fluxo de importação | Testes 1–8 também executados via path da importação |
