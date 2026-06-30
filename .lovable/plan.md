## Verificação dos arquivos enviados

Sim, são exatamente os 7 arquivos da extensão antiga:

| Arquivo | Função na extensão | Status do port para o VPS |
|---|---|---|
| `app_bridge.js` | Content script no app (postMessage ↔ chrome.runtime) | **Não precisa portar** — eliminado (front fala direto com edge `m2a-proxy`) |
| `lovable_bridge.js` | Idem app_bridge para preview Lovable | **Não precisa portar** |
| `m2a_bridge.js` | Content script no portal M2A | **Não precisa portar** |
| `background.js` | Service worker: orquestra, abre abas, faz bulk download e injeta engines | **Substituído pelo worker Fastify** (`vps-worker/src/server.js`) |
| `automation_engine.js` (1758 linhas) | Cria contrato, vincula atores, itens, dotação, documentos | ✅ **Já portado** em `vps-worker/src/m2a/contrato.js` + `orquestrador-contrato.js` |
| `processo_scraper.js` (737 linhas) | Lista atas, itens e contratos de um processo | ✅ **Já portado** em `vps-worker/src/routes/processos.js` |
| `numeracao_scraper.js` (122 linhas) | Maior número de contrato por secretaria/ano | ✅ **Já portado** em `vps-worker/src/routes/numeracao.js` |

**Conclusão:** o backend (worker) já contém **toda a lógica funcional** da extensão. O que falta é eliminar as últimas referências `window.postMessage` no front e trocá-las por chamadas à edge `m2a-proxy`, além de criar duas rotas auxiliares no worker para os fluxos que ainda não têm endpoint próprio.

---

## Plano de execução

### Fase 1 — Worker (completar lacunas do background.js)

Já existe orquestrador de contrato, processos SRP/comum, numeração e processos. Faltam dois fluxos que o `background.js` cobria diretamente:

1. **`POST /documentos/download`** (`vps-worker/src/routes/documentos.js` — já existe parcialmente, validar)
   - Recebe `{ documentos: [{id_m2a, nome}], archive: boolean, filename }`
   - Reproduz `fetchDocumentoM2APdf` + `handleBulkDownload` do background.js:1-496
   - Se `archive=true`: empacota em ZIP com `archiver` (substitui JSZip) e devolve `application/zip`
   - Se `archive=false` e único doc: devolve `application/pdf`
   - Se múltiplos sem ZIP: força ZIP (não dá pra fazer N downloads via HTTP único)

2. **`POST /contratos/diagnosticar`** já existe — confirmar paridade com `automation_engine.diagnosticarContrato` (linhas 702-758)

### Fase 2 — Edge function (sem mudança)

`supabase/functions/m2a-proxy/index.ts` já faz HMAC + repasse para a VPS, incluindo binário (PDF/ZIP) e SSE. Nada a alterar.

### Fase 3 — Cliente do front (`src/lib/`)

1. **`src/lib/m2a-worker.ts`** — adicionar helpers:
   ```ts
   processarContratoStream(payload, onProgress) // SSE de /contratos/processar
   processarContratoJson(payload)               // POST /contratos/processar/json
   diagnosticarContratoWorker(payload)          // POST /contratos/diagnosticar
   criarProcessoSrpWorker(payload, onProgress)  // SSE de /processos-srp/criar
   sincronizarNumeracaoWorker(secretarias, ano) // GET /numeracao
   downloadDocumentosWorker(documentos, opts)   // POST /documentos/download → blob
   ```
   Para SSE: usa `fetch` direto na edge function (em vez de `supabase.functions.invoke`) para conseguir ler o stream `text/event-stream`, mantendo o header `Authorization`.

2. **`src/lib/m2a.ts`** — **deletar arquivo inteiro**. Todas as funções `sendToM2A`, `diagnoseM2A`, `requestM2AProcessCreation`, `requestNumeracaoSync`, `listenM2AProgress`, `isExtensionInstalled` deixam de existir. Tipos compartilhados (`M2AProgressEvent`, `M2AEtapa`, `ETAPA_LABEL`, `M2ADocumentoGerado`, `extractM2AProcessoId`) movem para `src/lib/m2a-types.ts`.

### Fase 4 — Páginas que ainda chamam `window.postMessage`

1. **`src/routes/processos.$id.tsx`**
   - Linha 983: `diagnoseM2A(payload)` → `await diagnosticarContratoWorker(payload)` + toast com resultado
   - Linha 1040-1046: loop `sendToM2A(payload)` → `await processarContratoStream(payload, onProgress)` em série, atualizando progresso por etapa via callback (não mais via listener global)
   - Linha 344 / 590: `listenM2AProgress` removido — agora o `onProgress` da chamada SSE alimenta o mesmo state
   - Linha 1751 / 1852: textos "Configurar envio pela extensão" → "Configurar envio M2A"; "Testar extensão" → "Diagnosticar contrato"

2. **`src/routes/contratos.$id.tsx`** — análogo: `sendToM2A` → `processarContratoStream`, listener removido, textos atualizados (linhas 379, 535, 655, 804)

3. **`src/routes/irp.tsx`** — `requestM2AProcessCreation` → `criarProcessoSrpWorker(payload, onProgress)` em SSE; `listenM2AProcessCreationProgress` removido

4. **`src/routes/numeracao.tsx`** — `requestNumeracaoSync` → `await sincronizarNumeracaoWorker(secretarias, ano)`, sem requestId (resposta síncrona via GET)

5. **`src/routes/login.tsx`** linha 258: texto "Integração com o portal M2A via extensão Chrome" → "Integração automática com o portal M2A"

6. **`src/components/contratos/DocumentosEditor.tsx`** / **`src/routes/contratos.tsx`** / **`src/routes/processos.$id.tsx`** linha 299/590 — comentários já dizem "sem extensão", verificar se ainda há call-sites de `requestM2ABulkDownload` (não há, foi removido). Confirmar.

7. **`src/contexts/M2AConnectionProvider.tsx`** — já é stub; remover `ensureConnected` se ninguém mais usa, ou manter no-op por compatibilidade. Provider some.

### Fase 5 — Progresso ao vivo unificado

Hoje o front escuta `M2A_PROGRESS` via window. Novo modelo:

```text
                    ┌───────────────────────────────────────┐
                    │ ProgressContext (já existe)           │
                    └───────────────▲───────────────────────┘
                                    │ pushProgress(event)
   processarContratoStream(payload, (ev) => pushProgress(ev))
                                    │
                                    ▼ SSE
        m2a-proxy ────▶ vps-worker /contratos/processar
                                    │
                                    └─ orquestrador-contrato.onProgress
```

O componente que disparou o envio recebe o callback direto; nada de listener global. O `ProgressContext` continua sendo a fonte do toast/painel.

### Fase 6 — Limpeza

- Apagar `src/lib/m2a.ts`
- Apagar `src/contexts/M2AConnectionProvider.tsx` + import em `src/routes/__root.tsx`
- Apagar `M2AConnectionIndicator` no `AppShell.tsx`
- Remover textos "extensão" residuais (grep final)

---

## Mapeamento 1:1 das funções da extensão → worker

| Função original (extension) | Local atual no worker | OK? |
|---|---|---|
| `criarCabecalhoContrato` | `m2a/contrato.js` | ✅ |
| `buscarIdContratoPorNumero` / `discoverContratoTableUrls` | `m2a/contrato.js` | ✅ |
| `vincularFiscal/Gestor/Preposto` (autocomplete incluso) | `m2a/contrato.js` | ✅ |
| `adicionarItensAoContrato` (scrape + match + post) | `m2a/contrato.js` | ✅ |
| `atualizarQuantidadesItens` | `m2a/contrato.js` | ✅ |
| `incluirDotacao` | `m2a/contrato.js` | ✅ |
| `obterDocumentosContrato`/`excluirDocumentos`/`gerarDocumentosEntidade`/`atualizarDatasDocumentos`/`configurarDocumentos` | `m2a/contrato.js` | ✅ |
| `processarContratoCompleto` (orquestrador) | `m2a/orquestrador-contrato.js` + route `/contratos/processar` (SSE) | ✅ |
| `diagnosticarContrato` | `m2a/contrato.js` + `/contratos/diagnosticar` | ✅ verificar |
| `extractAtasFromDoc`/`fetchItensDaAta`/`fetchContratosDaAta`/`runCascata` | `routes/processos.js` /processos/sync | ✅ |
| `numeracao_scraper` | `routes/numeracao.js` /numeracao | ✅ |
| `handleBulkDownload` (ZIP de PDFs) | `routes/documentos.js` — **validar paridade** | ⚠️ |
| `requestM2AProcessCreation` (SRP) | `routes/processos-srp.js` + `orquestrador-processo-srp.js` | ✅ |

---

## Entregáveis técnicos

1. `vps-worker/src/routes/documentos.js` — auditar e completar bulk download (ZIP via archiver, fallback PDF único)
2. `vps-worker/src/m2a/contrato.js` — confirmar export de `diagnosticarContrato`
3. `src/lib/m2a-types.ts` (novo) — tipos extraídos de `m2a.ts`
4. `src/lib/m2a-worker.ts` — adicionar 6 helpers (SSE + JSON + GET + blob)
5. Edição de 5 rotas do front: `processos.$id.tsx`, `contratos.$id.tsx`, `irp.tsx`, `numeracao.tsx`, `login.tsx`
6. Remoção de `src/lib/m2a.ts`, `src/contexts/M2AConnectionProvider.tsx` e import correspondente em `__root.tsx` / `AppShell.tsx`
7. Atualização de textos UI ("extensão" → "worker M2A" / "integração M2A")

---

## Não vou tocar (fora do escopo)

- Edge function `m2a-proxy` (já genérica)
- Tabelas Supabase
- Lógica de RLS / numeração / snapshot
- UI de importação de contratos (já corrigida em mensagens anteriores)

---

## Riscos e observações

- **SSE via `supabase.functions.invoke` não funciona** — vou usar `fetch` direto no endpoint `${SUPABASE_URL}/functions/v1/m2a-proxy` com `Authorization: Bearer <session.access_token>` para conseguir ler o stream linha-a-linha. A edge já tem o passthrough de `text/event-stream`.
- **Bulk download** precisa de `archiver` no worker (`npm i archiver` em `vps-worker/`). Verifico antes de criar a rota.
- **Sessão M2A**: o worker usa cookies persistidos do login automatizado (`vps-worker/src/auth.js`). Não muda.
- Após aprovado, executo tudo em uma única passada de edições paralelas. Não precisa de migration de DB.
