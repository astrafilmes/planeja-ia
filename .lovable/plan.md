# Plano de implementação

## 1. Confiar neste dispositivo (token longo)

**Backend (migration)**
- Nova tabela `public.trusted_devices`:
  - `user_id uuid` (FK auth.users), `token_hash text` (SHA-256 do token), `device_label text`, `user_agent text`, `last_ip inet`, `created_at`, `last_used_at`, `expires_at` (default `now() + 60 days`), `revoked_at`.
- GRANTs para `authenticated` e `service_role`; RLS:
  - SELECT/UPDATE/DELETE só do próprio `user_id`.
  - INSERT restrita a edge function (via service_role).
- Função `consume_trusted_device(token text)` SECURITY DEFINER que valida hash, atualiza `last_used_at`, retorna `user_id` se válido.

**Edge function `trusted-device`**
- `POST /issue` — gera token aleatório (32 bytes hex), grava hash, devolve token bruto + expiração.
- `POST /revoke` — marca `revoked_at = now()` para o token atual.
- `POST /validate` — usada no boot; se válido e sessão expirou, mantém usuário logado refrescando a sessão.

**Frontend**
- Checkbox **“Confiar neste dispositivo por 60 dias”** em `src/routes/login.tsx`.
- Ao logar com sucesso e checkbox marcado → chama `trusted-device/issue`, salva token em `localStorage` (`pj_trusted_token`).
- `useAuth` no boot: se não há sessão, chama `/validate`. Se válido, mantém a UI logada (o token age como “lembrar”, não substitui a sessão — apenas evita exigir senha imediatamente; o usuário só precisará re-autenticar quando o token expirar).
- Botão **“Sair de todos os dispositivos confiáveis”** no menu de conta (revoga todos os tokens do user).

> Limitação: como o Supabase JWT tem TTL próprio, o token de dispositivo serve para pular o formulário de senha — apresenta tela mínima “Continuar como Fulano” e refresca a sessão automaticamente via fluxo de refresh do Supabase quando possível.

## 2. Sincronização reforçada do processo

Em `src/lib/m2a-snapshot.ts` (persistência) e `useM2ASync`:

- **Upsert estável** por chaves:
  - Atas: `(processo_id, m2a_ata_id)`.
  - Itens M2A: `(processo_id, lote_norm, numero_item_norm)` — dedupe ao gravar.
  - Contratos: `(processo_id, m2a_contrato_id)` ou `numero_contrato` normalizado.
- **Reconciliação**:
  - Para cada contrato existente, atualiza: `fornecedor_nome`, `fornecedor_cnpj`, `valor_global`, `vigencia_*`, datas, `m2a_ata_numero`.
  - Para cada item de contrato existente, atualiza `valor_unitario`, `valor_total`, `quantidade`, `unidade`, `descricao`, `especificacao` quando o portal trouxer novidade (sem apagar campos preenchidos manualmente — política: portal vence em campos M2A).
- **Dedupe pós-sync** (SQL helper `dedupe_m2a_itens(p_processo_id uuid)`): mantém a linha mais recente por `(processo_id, lower(trim(lote)), lower(trim(numero_item)))` e remove as demais.
- **Stream de progresso** já existe; adicionar contadores: `atualizados`, `criados`, `duplicatas_removidas` e expor no toast final.

## 3. Aba de itens sem duplicatas

- Migration: índice único parcial `UNIQUE (processo_id, lower(trim(lote)), lower(trim(numero_item)))` em `m2a_itens` (após dedupe inicial via helper acima).
- Listagem em `src/routes/processos.$id.tsx`: ordenar por `lote, numero_item::int`, deduplicar defensivamente no cliente também.

## 4. Correções de segurança e otimização

- Revisar `get_pauta_consolidada_data`: já filtra `deleted_at IS NULL`; adicionar `SECURITY INVOKER` explícito e `STABLE`.
- Adicionar índices: `contrato_itens(contrato_id)`, `contrato_item_dotacoes(item_id)`, `m2a_itens(processo_id, lote, numero_item)`.
- `useAuth`: trocar `getSession()` por `getUser()` na verificação inicial (já validado server-side), conforme regra de segurança.
- Lint Supabase ao final; corrigir avisos críticos da migração.

## 5. XLSX consolidada — todos os itens do processo

- Nova RPC `get_pauta_consolidada_full(p_processo_id, p_contrato_ids uuid[])`:
  - Retorna **união** de:
    - itens de contratos filtrados (com `secretaria_sigla`, `dotacao`, `quantidade_alocada`);
    - **todos os itens do processo** vindos de `m2a_itens` (ou `contrato_itens` agregado por `processo_id`) que **não** estão nos contratos selecionados → com `quantidade_alocada = 0`, `secretaria_sigla = NULL`.
- `prepararDadosPautaConsolidada` (em `excel-export.ts`):
  - Agrupa por `lote|numero_item`.
  - **Ordenação**: `lote ASC, numero_item ASC (numérico), ordem ASC`.
  - Linhas “sem contrato selecionado” aparecem com colunas de secretaria vazias e total = 0.
  - Mantém `=SUM()` em TOTAL/AZ.
- `PautaConsolidadaExporter`: passa `contractIds` para a nova RPC; mantém multi-abas por processo; nome do arquivo/aba/footer continua via `buildProcessoNome`.
- Excel: ativa **AutoFilter** em `A2:AZ2` para permitir filtrar por empresa/secretaria.

## Detalhes técnicos / arquivos

- **Migrations** (uma única):
  - `trusted_devices` + RLS + GRANTs + função `consume_trusted_device`.
  - `dedupe_m2a_itens(uuid)`, índice único parcial.
  - Novos índices.
  - `get_pauta_consolidada_full(uuid, uuid[])`.
- **Edge function**: `supabase/functions/trusted-device/index.ts`.
- **Edits**:
  - `src/routes/login.tsx` (+ checkbox + chamada).
  - `src/hooks/useAuth.tsx` (boot validate + signOutAllTrusted).
  - `src/lib/m2a-snapshot.ts` (upsert + reconciliação + chamar dedupe).
  - `src/hooks/useM2ASync.ts` (contadores no toast).
  - `src/routes/processos.$id.tsx` (ordenação/dedupe de exibição).
  - `src/lib/excel-export.ts` (todos itens + autofilter + ordenação).
  - `src/components/contratos/PautaConsolidadaExporter.tsx` (RPC nova).

## Fora de escopo (confirmar se quer agora)
- 2FA real.
- Reescrita do worker M2A.
- Reorganização visual da aba de itens.

Aprovar para eu começar a executar?