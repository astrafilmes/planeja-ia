# Port do `automation_engine.js` → `vps-worker`

Replicar 1:1 o fluxo da extensão como rotas HTTP no worker, reaproveitando o `m2a-client` (sessão única + login automático + fila). Sem inventar rotas novas — só as que a extensão já chama.

## Arquitetura

- Toda lógica do `automation_engine.js` migra para módulos em `vps-worker/src/m2a/` (puros, recebem o `m2a` client por DI).
- Rotas finas em `vps-worker/src/routes/*.js` só validam payload, chamam o módulo, e fazem stream de progresso via **SSE** (`text/event-stream`) — equivalente direto aos `M2A_PROGRESS` que a extensão posta via `postMessage`.
- O `m2a-client` ganha `post(path, body, opts)` (form-url-encoded + CSRF) além do `get` atual. CSRF é lembrado por URL (igual `rememberCsrfFromDoc`).
- Helpers comuns (`absoluteUrl`, `isLoginHtml`, `extractFormDiagnostics`, `ensureOperationAccepted`, datas úteis, normalização de número/quantidade/itens) viram `vps-worker/src/m2a/utils.js`.

## Fases

### Fase 1 — Infra + Contrato (alvo desta entrega)
Cobre `processarContratoCompleto` (linha 2116) e todas as suas dependências de contrato:

1. `m2a-client`: adicionar `post()`, cache de CSRF por URL, helper `capturarCsrf(path)`.
2. `src/m2a/utils.js`: portar helpers genéricos (datas, normalize, diagnostics, ensure*).
3. `src/m2a/contrato.js`:
   - `buscarIdContratoPorNumero` (1220) + `discoverContratoTableUrls` (1181)
   - `criarCabecalhoContrato` (1006)
   - `vincularFiscal` / `vincularGestor` / `vincularPreposto` (1335-1428)
   - `adicionarItensAoContrato` (1665) + `atualizarQuantidadesItens` (1811) + scrapers de itens (1548-1665)
   - `incluirDotacao` (1917)
   - `configurarDocumentos` (2100) + sub-rotinas (1958-2099)
4. `src/m2a/orquestrador-contrato.js`: porta de `processarContratoCompleto` emitindo eventos `progress(etapa, mensagem, extra)` via callback.
5. Rota nova `POST /contratos/processar` (SSE) em `src/routes/contratos.js`:
   - Body: mesmo payload do `M2A_START_AUTOMATION` (já tipado em `src/lib/m2a-payload.ts`).
   - Resposta: stream de `event: progress` + `event: done`/`event: error`.
6. Variante `POST /contratos/diagnosticar` chamando `diagnosticarContrato` (1276).
7. Smoke test em `vps-worker/scripts/test-contrato.js` (igual `test-call.js`, mas consumindo SSE).

### Fase 2 — Processo SRP
Porta de `orquestrarCriacaoProcesso` (925) + `criarDFDProcesso` / `capturarIdsProcesso` / `atualizarParametrosProcesso` / `importarPlanilhasItens`. Rota `POST /processos/criar` (SSE). Decodificação de XLSX (base64/signedUrl) feita no worker (já tem `axios`).

### Fase 3 — Integração com o frontend (opcional, depois)
Adapter no Planeja que decide: se a extensão estiver instalada usa o caminho atual (`postMessage`); senão chama o worker via Edge Function (preserva HMAC). Fora do escopo desta primeira entrega.

## Detalhes técnicos

- **CSRF**: a extensão lê `csrfmiddlewaretoken` do HTML da resposta anterior e do cookie `csrftoken`. No worker, `cheerio` extrai do HTML e `tough-cookie` fornece o cookie — replicar `rememberCsrfFromDoc` num `Map<path, token>`.
- **DOM parsing**: trocar `DOMParser` por `cheerio` (já dep do worker). Todos os `doc.querySelector(...)` viram seletores `$()` — wrapper fino `parseDoc(html)` para minimizar diff visual.
- **Concorrência**: o `PQueue` do `m2a-client` já serializa; nenhum endpoint do worker precisa paralelizar mais que isso.
- **Progresso**: callback `onProgress(etapa, mensagem, extra)` no orquestrador; a rota SSE serializa cada chamada como `event: progress\ndata: {...}\n\n`.
- **Erros**: preservar mensagens originais (`SESSAO_EXPIRADA`, `M2A_LOGIN_FAILED`, `ensureOperationAccepted`) para o frontend reaproveitar tratamento.
- **Não muda**: assinatura HMAC, layout do `.env`, ecosystem PM2, nada do frontend Planeja.

## Entrega desta rodada

Apenas **Fase 1** (contrato). Fase 2 fica como próximo PR para manter o diff revisável (~600-800 linhas novas no worker + helpers).

## Confirmações necessárias

1. OK fazer streaming via **SSE** na resposta HTTP (alternativa: 1 POST que devolve só o resultado final + GET de log). SSE é o que mais se parece com o `postMessage` atual.
2. OK criar a árvore `vps-worker/src/m2a/{utils,contrato,orquestrador-contrato}.js` (separar do `routes/` ajuda muito a testar).
3. Confirma que vamos parar nesta primeira entrega na Fase 1 (contrato) e fazer Processo SRP depois.
