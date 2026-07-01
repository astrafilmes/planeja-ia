# Plano — Fluxo unificado de Importação com Processo integrado

## Objetivo
Transformar o card de importação em um formulário único que já contempla a identidade do **processo administrativo** (existente ou novo) antes de enviar a planilha. Isso elimina o retrabalho de preencher número/objeto no painel "Autorizar geração" e permite que a sincronização com a M2A seja **inteligente**: incremental para processos já conhecidos, completa para novos.

## Novo fluxo (UX)

Tela `Importar contratos` → `UploadCard` com dois modos, alternáveis por toggle:

### Modo A — Processo existente
- `Select` com lista de processos (mesma query `processos` já usada em `AutorizarGeracaoPanel`).
- Ao selecionar, sistema **auto-preenche** internamente: `numero_processo`, `objeto`, `m2a_processo_id`, `m2a_url` (sem exibir campos editáveis; se faltar `m2a_processo_id`, exibir aviso e pedir o código).
- Campo `Arquivo (.xlsx)`.
- Botão **Analisar e importar** → dispara sincronização **incremental**: só busca atas/contratos/itens novos desde `processos.m2a_sync_at`, e detecta se há novas atas para exigir re-análise completa.

### Modo B — Novo processo
- `Input` **Código do processo M2A** (só o número, ex.: `34291`) — não pedir URL completa.
  - Aceitar também colar URL: extrair com `extractM2AProcessoId`.
- `Input` **Nº do processo administrativo** (`numero_processo`, ex.: `001/2025`).
- `Textarea` **Objeto**.
- `Input date` **Data base do lote** (default hoje).
- `Arquivo (.xlsx)`.
- Botão **Analisar e importar** → cria registro em `processos` (rascunho) e dispara sincronização **completa** (atas + itens + snapshot de contratos).

Ambos os modos: após submit, comportamento existente (job aparece no histórico, tabs de revisão etc.) permanece igual. O painel **Autorizar geração** deixa de pedir "criar processo / vincular processo / nº base / objeto" — passa a apenas confirmar prepostos e a lista de contratos selecionados, pois o processo já está definido desde o upload.

## Comportamento de sincronização

`useImportarPlanilha` recebe `mode: 'existing' | 'new'` e o `processoId` (existente) ou os campos do novo.

- **Existente:**
  - `syncM2AProcesso({ processoId, incremental: true })`.
  - Se `atas_upserted > 0` OU `snapshot_upserted > 0` (via retorno de `sync_m2a_snapshot`), tratar como full para os itens novos; caso contrário só atualiza numeração/últimos contratos.
- **Novo:**
  - `INSERT` em `processos` com os campos preenchidos + `m2a_processo_id` + `m2a_url` derivada.
  - `syncM2AProcesso({ processoId: novoId, incremental: false })` — sincronização completa como hoje.

Nada muda no lado do banco: `sync_m2a_snapshot` já faz upsert idempotente; "incremental" é apenas uma flag no cliente para evitar re-parsear itens quando não há novidade.

## Impacto em `AutorizarGeracaoPanel`

Remover da UI:
- Toggle "Criar novo processo / vincular a existente".
- Campo `Nº base do processo`, `Objeto`, `Data base` (agora vêm do processo).
- `Select` de processo existente.

Manter:
- Prepostos por fornecedor.
- Lista de contratos selecionados/desmarcados + avisos de sem-ata / sem-cadastro M2A.
- Botão **Autorizar geração** — passa `processoId` (sempre existente neste ponto) para `useAutorizarGeracao`.

## Arquivos afetados

**UI**
- `src/features/importar-contratos/components/UploadCard.tsx` — reescrever com toggle e campos condicionais; validação por modo.
- `src/features/importar-contratos/components/AutorizarGeracaoPanel.tsx` — remover blocos de processo/objeto/data/numeroBase.
- `src/routes/_authenticated.importar-contratos.tsx` — estado consolidado (`mode`, `processoId`, `novoProcesso: {codigoM2A, numeroProcesso, objeto, data}`), remover props redundantes de `AutorizarGeracaoPanel`.

**Hooks**
- `src/features/importar-contratos/hooks/useImportarPlanilha.ts` — receber `{mode, processoId?, novoProcesso?, file}`; criar processo quando `mode==='new'`; chamar sync incremental/completo; salvar `processo_id` e `m2a_url` já no `contrato_import_jobs`.
- `src/features/importar-contratos/hooks/useAutorizarGeracao.ts` — remover parâmetros de criação de processo; usar `jobDetail.job.processo_id`.

**Sem migração de schema.** `contrato_import_jobs.processo_id` e `m2a_url` já existem.

## Regras invioláveis
- Design system tokens (nada de cor hardcoded).
- Zero alteração em RLS/edge functions/`sync_m2a_snapshot`.
- `notify.*` e `logAudit` mantidos nos mesmos pontos.
- Retrocompatibilidade: jobs antigos (sem `processo_id`) continuam abrindo — apenas exigem que o usuário vincule antes de autorizar (fallback preservado só nesse caso).

## Entrega em 2 partes
1. **Refactor de UI + estado** (UploadCard novo, remoção dos campos em AutorizarGeracaoPanel, route ajustada).
2. **Hook** (`useImportarPlanilha` cria processo + sync incremental; `useAutorizarGeracao` simplificado).

Confirma esse fluxo para eu executar?
