# Plano — Desmembramento de `src/routes/secretarias.tsx`

Encerrando a Fase 3. Aplicando o mesmo padrão-ouro validado em `contrato-detalhe/` e `irp/`: `lib.ts` + `hooks/` + `components/` + rota puramente orquestradora. Alvo: rota final ~140 linhas.

## Estrutura de arquivos

```text
src/features/secretarias/
├── lib.ts                              # Types + helpers puros + constantes
├── hooks/
│   ├── index.ts                        # Barrel
│   ├── useSecretariasQuery.ts          # Lista + CPFs (RPC) + enrich
│   ├── useSecretariaMutations.ts       # save / saveGroup / delete + audit + notify
│   ├── useSecretariaForm.ts            # Estado do formulário individual (open/editing)
│   ├── useSecretariaGroupForm.ts       # Estado do formulário de grupo (openGroupEdit)
│   ├── useSecretariaDeleteDialog.ts    # Estado do AlertDialog de exclusão
│   └── useSecretariasFilters.ts        # search + statusFilter + expandedGroups + filteredRows + secretariaGroups memoizados
├── components/
│   ├── index.ts                        # Barrel
│   ├── SecretariasToolbar.tsx          # Search input + status Select + Expand/Collapse
│   ├── SecretariasStatsBar.tsx         # Badges de contagem + hint
│   ├── SecretariasEmptyState.tsx       # EmptyState padronizado com CTA "Nova"
│   ├── SecretariaGroupCard.tsx         # Card + Collapsible + header do grupo (com onEditGroup)
│   ├── SecretariaGroupTable.tsx        # Tabela interna do grupo (memoizada, linhas isoladas)
│   ├── SecretariaEditDialog.tsx        # Dialog individual (formulário completo)
│   ├── SecretariaGroupEditDialog.tsx   # Dialog de bulk-edit de grupo
│   ├── SecretariaDeleteDialog.tsx      # AlertDialog de exclusão
│   └── ActorSelect.tsx                 # Movido do fim do arquivo (já é dumb)
└── (rota) src/routes/secretarias.tsx   # Orquestrador puro (~140 linhas)
```

## Distribuição de responsabilidades

### `lib.ts` — Types + helpers puros
- **Types:** `Sec`, `EnrichedSec`, `SecretariaGroup`, `GroupForm`, `StatusFilter`.
- **Constantes:** `EMPTY_SELECT_VALUE`, `KEEP_SELECT_VALUE`.
- **Helpers puros:** `emptySec`, `normalizeText`, `isNumericM2AId`, `trimOrNull`, `toSecretariaPayload`, `actorPatch`, `pickPrincipal`, `groupRows`.
- **Helper de RPC:** `syncSecretariaCpfs` (fica no lib porque é I/O puro sem estado React).

### Hooks

| Hook | Responsabilidade |
|------|------------------|
| `useSecretariasQuery` | `useQuery(["secretarias"])` + merge de CPFs via RPC `get_secretarias_cpfs`; expõe `rows`, `enrichedRows` (após join com fiscais/gestores/UGs), `isLoading`. |
| `useSecretariaMutations` | `save(sec)`, `saveGroup(group, form)`, `remove(sec)` — validação, `supabase.upsert/update/delete`, `syncSecretariaCpfs`, `logAudit`, `notify.*`, `invalidateQueries`. Retorna também `isSaving`. |
| `useSecretariaForm` | `open`, `editing`, `openNew()`, `openEdit(sec)`, `close()`, `setField(key, value)`. |
| `useSecretariaGroupForm` | `groupEditing`, `groupForm`, `openGroupEdit(group)`, `close()`, `setField()`. |
| `useSecretariaDeleteDialog` | `deleting`, `open(sec)`, `close()`. |
| `useSecretariasFilters` | `search`, `statusFilter`, `expandedGroups`, `toggleGroup`, `expandAll`, `collapseAll`, `filteredRows`, `secretariaGroups` (memoizados). |

### Components (todos dumb + `React.memo` onde couber)

| Componente | Props principais |
|------------|------------------|
| `SecretariasToolbar` | `search`, `onSearchChange`, `statusFilter`, `onStatusFilterChange`, `onExpandAll`, `onCollapseAll`, `duplicateCount` |
| `SecretariasStatsBar` | `groupCount`, `filteredCount`, `totalCount` |
| `SecretariasEmptyState` | `onNew` |
| `SecretariaGroupCard` | `group`, `expanded`, `onToggle`, `onEditGroup`, `children` (recebe a tabela) |
| `SecretariaGroupTable` | `rows`, `fiscaisById`, `gestoresById`, `onEditRow`, `onDeleteRow` — memoizada, linhas em componente interno também `memo` |
| `SecretariaEditDialog` | `open`, `editing`, `onChange`, `unidades`, `fiscais`, `gestores`, `onSave`, `onCancel`, `isSaving` |
| `SecretariaGroupEditDialog` | `group`, `form`, `onChange`, `unidades`, `fiscais`, `gestores`, `onSave`, `onCancel`, `isSaving` |
| `SecretariaDeleteDialog` | `item`, `onConfirm`, `onCancel`, `isDeleting` |
| `ActorSelect` | (mantém API atual) — apenas realocado |

### Rota final (`src/routes/secretarias.tsx`)
- Apenas: `createFileRoute`, `routeHead`, invocação dos 6 hooks, chamadas a `useUnidadesGestoras`/`useServidores`, `useMemo` para `filterServidoresByUnidade` (row/group), JSX distribuindo props aos componentes.
- Zero regra de negócio inline. Zero `supabase.*` inline. Zero `notify.*` inline.

## Regras inegociáveis mantidas
- **Design System (Fase 2):** tokens semânticos (`border-border/60`, `bg-muted/40`, `text-muted-foreground`), zero cor hardcoded, `rounded-lg`.
- **API `notify.*`:** todos os toasts existentes preservados 1:1 (`error`/`success` nos mesmos pontos).
- **Auditoria:** `logAudit` mantido em `save`/`saveGroup`/`remove` com os mesmos `action`/`entityType`/`payload`.
- **RPC de CPF:** `syncSecretariaCpfs` continua sendo chamado com a mesma assinatura em save/saveGroup.
- **Performance:** `SecretariaGroupTable` memoizada; linha isolada em subcomponente `memo` com callbacks estáveis (`useCallback` no orquestrador) — mesmo padrão do `IrpSecretariasTable`.
- **Typecheck:** meta 0 erros — interfaces explícitas em todos os hooks e componentes.

## Divisão de entrega (3 partes)

1. **Parte 1:** `lib.ts` + todos os 6 hooks + `hooks/index.ts`. Typecheck após.
2. **Parte 2:** 5 componentes visuais (toolbar, statsBar, emptyState, groupCard, groupTable, ActorSelect). Typecheck após.
3. **Parte 3:** 3 dialogs (edit, groupEdit, delete) + rota orquestradora final. Typecheck + confirmação da redução de linhas.

Aguardando aprovação para iniciar a Parte 1.
