# Auditoria do banco — duplicações, inconsistências, dívida técnica

Documento de **leitura**, sem alterar schema. Cada item tem **risco**, **impacto** e **proposta**. A intenção é atacar **uma fase por vez**, com sua aprovação por migração.

---

## 1. Duplicação de identidade de **fornecedor**

Hoje o nome do fornecedor vive em (no mínimo) 4 lugares:

| Tabela                       | Coluna                          | Origem do dado                          |
|------------------------------|----------------------------------|------------------------------------------|
| `contratos`                  | `fornecedor_nome`               | sync M2A + edição manual                 |
| `m2a_atas`                   | `fornecedor_nome`, `fornecedor_cnpj` | sync M2A                              |
| `m2a_contratos_snapshot`     | `raw->>'fornecedor_nome'`       | snapshot bruto do portal                 |
| `contrato_import_itens`      | `m2a_fornecedor_nome`           | importação CSV                           |
| `fornecedores_prepostos`     | `fornecedor_nome`, `fornecedor_nome_norm`, `fornecedor_cnpj` | catálogo manual de prepostos     |

**Problemas**
- Mesmo fornecedor escrito de formas diferentes em cada tabela (acento, caixa, espaço).
- Quando o sync atualiza a ata mas não o contrato, a UI mostra valores divergentes (foi o bug recente).
- Sem CNPJ como chave canônica não dá pra fechar relatórios.
- `fornecedores_prepostos.fornecedor_nome_norm` já existe mas é usado só para join de prepostos.

**Proposta (fase futura)**
1. Criar `public.fornecedores` (id uuid, nome, nome_norm, cnpj UNIQUE NULLS NOT DISTINCT, created_at).
2. Backfill a partir de `m2a_atas` + `contratos` + `fornecedores_prepostos` deduplicando por `cnpj` (e por `nome_norm` quando CNPJ faltar).
3. Adicionar `fornecedor_id` em `contratos`, `m2a_atas`, `fornecedores_prepostos`.
4. Manter `fornecedor_nome` nas tabelas existentes como **cache denormalizado** (preenchido por trigger a partir de `fornecedores`) — não quebra import/sync/exports.
5. Migrar gradualmente as queries pra usar `fornecedor_id`.

**Risco:** médio. Quebra exports + sync se mal feita. Recomendo fase isolada.

---

## 2. Duplicação de identidade de **secretaria**

| Tabela                       | Colunas                                            |
|------------------------------|----------------------------------------------------|
| `contratos`                  | `secretaria_id`, `secretaria_nome`, `secretaria_sigla`, `secretaria_num` |
| `contrato_import_dotacoes`   | `secretaria_sigla`                                  |
| `contrato_item_dotacoes`     | `secretaria_id`, `secretaria_sigla`                 |
| `m2a_contratos_snapshot`     | `sigla_secretaria` (note: nome diferente!)          |
| `processos`                  | `secretaria_id`                                     |
| `irp_unidades_processamento` | `secretaria_id`                                     |
| `m2a_envio_preferencias`     | `secretaria_id`                                     |

**Problemas**
- 4 colunas redundantes em `contratos` (id já dá tudo).
- `sigla_secretaria` vs `secretaria_sigla` — nome inconsistente entre tabelas.
- Sigla pode ficar dessincronizada do registro mestre em `secretarias`.

**Proposta**
1. Padronizar nome da coluna para `secretaria_sigla` em todas as tabelas (rename em `m2a_contratos_snapshot`).
2. Em `contratos`, manter só `secretaria_id` + view denormalizada pros relatórios. (Ou manter cache, mas com trigger.)
3. Em `contrato_item_dotacoes`, `secretaria_sigla` é cache OK porque facilita export — mas precisa de trigger que sincroniza com `secretarias.sigla`.

**Risco:** baixo se for rename + view. Médio se for drop de colunas.

---

## 3. Duplicação **ata**

| Tabela        | Colunas                              |
|---------------|--------------------------------------|
| `contratos`   | `m2a_ata_id`, `m2a_ata_numero`       |
| `m2a_atas`    | `m2a_ata_id`, `numero_ata`           |

`m2a_ata_numero` em contratos é cache do `numero_ata` da `m2a_atas`. OK como cache, mas:
- Nome divergente (`m2a_ata_numero` vs `numero_ata`).
- Sem FK lógica → órfão silencioso possível.

**Proposta**
- Adicionar FK `(processo_id, m2a_ata_id) → m2a_atas(processo_id, m2a_ata_id)` em `contratos` (nullable).
- Trigger pra manter `m2a_ata_numero` sincronizado.

**Risco:** baixo.

---

## 4. Tabelas de **importação** vivem em paralelo às definitivas

| Importação                  | Definitiva              |
|-----------------------------|-------------------------|
| `contrato_import_jobs`      | `processos`             |
| `contrato_import_itens`     | `contrato_itens` / `m2a_itens` |
| `contrato_import_dotacoes`  | `contrato_item_dotacoes` |

**Problema:** depois que um job é processado, as 3 tabelas viram lixo (não há TTL nem job de limpeza). Hoje provavelmente acumulam milhares de linhas sem uso.

**Proposta**
- Adicionar `expires_at` (default `now() + interval '30 days'`) + cron job que deleta jobs finalizados antigos.
- Documentar que são tabelas **transientes**.

**Risco:** baixo (só cleanup).

---

## 5. **CPFs** espalhados

| Tabela              | Coluna             |
|---------------------|--------------------|
| `contrato_atores`   | `cpf`              |
| `m2a_servidores`    | `cpf`              |
| `secretarias`       | `m2a_gestor_cpf`, `m2a_fiscal_cpf` |

**Problema crítico** (já apontado pelo scanner): CPFs em `secretarias` continuam acessíveis via SELECT pelo papel `consulta` se as policies não escondem essas colunas. Foi parcialmente mitigado com `get_secretarias_cpfs` mas as colunas continuam expostas no SELECT direto.

**Proposta**
- Criar tabela `public.secretaria_contatos` com `(secretaria_id, role enum('gestor','fiscal'), cpf, nome)` + RLS estrita (só admin/gestor lê CPF).
- Mover `m2a_gestor_cpf` / `m2a_fiscal_cpf` pra lá e remover da `secretarias`.

**Risco:** médio (mexe em flow de envio M2A).

---

## 6. Falta de **FKs físicas**

Mapa atual (parcial — preciso confirmar com `pg_constraint`):
- `contrato_itens.m2a_item_id` → `m2a_itens.m2a_item_id` — sem FK (intencional segundo o plano antigo, OK).
- `contratos.m2a_ata_id` → sem FK.
- `contrato_item_dotacoes.item_id` → sem FK? confirmar.
- `m2a_atas.processo_id` → sem FK para `processos`?

**Proposta**
- Auditar com `SELECT conname,conrelid::regclass FROM pg_constraint WHERE contype='f'` e listar FKs faltantes onde a deleção em cascata é segura.

**Risco:** baixo (FKs só adicionam segurança).

---

## 7. Funções SECURITY DEFINER expostas (warning recorrente do linter)

Hoje várias RPCs públicas são `SECURITY DEFINER` sem REVOKE para `anon`:
- `get_pauta_consolidada_data`, `get_pauta_consolidada_full`, `get_contract_report_data`, `get_multiple_contracts_report_data`, `dedupe_m2a_itens`, `next_contrato_*`, `sync_m2a_*`, `consume_trusted_device`, `restore_soft_deleted_process`.

**Proposta**
- Revogar `EXECUTE` de `anon` em todas as funções que exigem login.
- Manter `SECURITY DEFINER` só onde realmente precisa contornar RLS; o resto vira `SECURITY INVOKER`.

**Risco:** baixo.

---

## 8. Inconsistência de **nomes de coluna**

- `m2a_contratos_snapshot.sigla_secretaria` vs `contratos.secretaria_sigla`.
- `m2a_atas.numero_ata` vs `contratos.m2a_ata_numero`.
- `contratos.data` (timestamp do contrato) vs `processos.data_abertura` vs `m2a_envio_preferencias.data_padrao`.
- `contrato_atores.cpf` vs `secretarias.m2a_gestor_cpf` (com e sem prefixo).

Padrão sugerido: prefixo `m2a_` só para campos vindos do portal; nome consistente entre tabelas para o mesmo conceito.

**Risco:** baixo, mas renames quebram client. Precisa migrar `types.ts` + queries.

---

## 9. Triggers de `updated_at` ausentes

A função `touch_updated_at()` existe mas a auditoria de DB mostra **zero triggers**. Várias tabelas têm coluna `updated_at` que **nunca** é atualizada automaticamente — o app precisa lembrar de setar `updated_at = now()` em cada UPDATE (e às vezes esquece).

**Proposta:** adicionar trigger `BEFORE UPDATE` em todas as tabelas com `updated_at`.

**Risco:** baixíssimo.

---

## 10. Tabelas de **log** sem retenção

- `audit_logs`
- `m2a_envio_logs`

Crescem indefinidamente. Sem index em `created_at` provavelmente.

**Proposta:** TTL (30/90/365 dias conforme criticidade) + index parcial em `created_at DESC`.

**Risco:** baixo.

---

## Plano de fases sugerido (ordem de menor → maior risco)

1. **Fase A — Cosmético + cleanup** (esta semana): triggers `updated_at`, REVOKE EXECUTE `anon` (#7, #9), TTL de logs e import jobs (#4, #10).
2. **Fase B — FKs faltantes** (#6): adicionar constraints onde for seguro.
3. **Fase C — Padronização de nomes** (#8): rename `sigla_secretaria` → `secretaria_sigla`, atualizar types/queries.
4. **Fase D — CPFs fora de `secretarias`** (#5).
5. **Fase E — Tabela canônica `fornecedores`** (#1) — a mais arriscada.
6. **Fase F — Limpeza de colunas redundantes em `contratos`** (#2) — depois que tudo acima estiver estável.

---

**Próximo passo:** me diga qual fase começamos. Recomendo **Fase A** porque traz ganho imediato com risco quase nulo.
