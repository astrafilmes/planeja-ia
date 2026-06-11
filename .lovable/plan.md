## Objetivo

Eliminar 100% da dependência da extensão no fluxo de download de documentos. Toda requisição ao portal M2A passará por:

```
Browser → Edge Function (m2a-proxy) → VPS Worker → M2A
```

A VPS faz o download autenticado dos PDFs e, quando solicitado, gera o ZIP. O navegador apenas recebe o binário pronto.

---

## Fase 1 — VPS Worker: nova rota de download

Arquivo novo: `vps-worker/src/routes/documentos.js`

- `POST /documentos/baixar`
  - Body:
    ```json
    {
      "documentos": [
        { "source": "m2a", "id_m2a": "12345", "nome": "Contrato-001.pdf" },
        { "source": "url", "url": "https://signed.url/...", "nome": "Aditivo.pdf" }
      ],
      "archive": true,
      "filename": "contrato-123-documentos.zip"
    }
    ```
  - Comportamento:
    - Para cada `source: "m2a"`, baixa via `m2a.request("GET", "/contratos/documentos/baixar/{id}/", { responseType: "arraybuffer" })` (estender `m2a-client.js` para suportar binário).
    - Para `source: "url"`, faz `fetch` direto (usado para anexos locais já no Storage).
    - Se `archive: true` ou houver >1 documento → empacota com `archiver` (stream zip) e devolve `application/zip`.
    - Se 1 doc e `archive: false` → devolve o binário cru com `Content-Type` original e `Content-Disposition: attachment; filename="..."`.
  - Concorrência limitada (reaproveita a `PQueue` existente).
  - Detecta página de login no retorno e força re-login (já implementado em `m2a-client.js`).

Ajustes:
- `vps-worker/package.json`: adicionar `archiver`.
- `vps-worker/src/m2a-client.js`: aceitar `opts.responseType === "arraybuffer"` em `_raw`/`request` retornando `Buffer` no campo `bytes` (em vez de `html`).
- `vps-worker/src/server.js`: registrar `documentosRoutes`.

---

## Fase 2 — Edge Function `m2a-proxy`: passthrough binário

`supabase/functions/m2a-proxy/index.ts`:

- Detectar `Content-Type` da resposta do worker. Se não for `application/json`, devolver o corpo como `ArrayBuffer` preservando `Content-Type` e `Content-Disposition`.
- Manter o caminho JSON intacto para as rotas existentes (`/processos/sync`, etc.).

Como `supabase.functions.invoke()` força parsing, o frontend chamará a função via `fetch` direto na URL pública:

```
${SUPABASE_URL}/functions/v1/m2a-proxy
```

com `Authorization: Bearer <session.access_token>`, recebendo `Blob`.

---

## Fase 3 — Frontend: substituir a extensão

Arquivo novo: `src/lib/m2a-documents.ts`

```ts
export async function downloadM2ADocuments(
  documentos: M2ABulkDownloadDocumento[],
  opts?: { archive?: boolean; filename?: string },
  onProgress?: (e: { status; baixados; total; mensagem? }) => void
): Promise<void>
```

- Converte entrada (mistura de `M2ADocumentoGerado` e `M2AUrlDocumento`) em payload do worker.
- Chama `m2a-proxy` via `fetch`, recebe Blob, dispara `saveAs(blob, filename)`.
- Reporta progresso (iniciado/concluido/erro) via callback — sem progresso intermediário por arquivo (o download é único). Para UX, mostramos um estado "Compactando no servidor…".

Refatorar consumidores para usar a nova função (sem `window.postMessage`):

- `src/components/contratos/DocumentosEditor.tsx`
  - Remover `listenM2ABulkDownload` / `requestM2ABulkDownload`.
  - `baixarDocumento(doc)` e `baixarZip(docs)` chamam `downloadM2ADocuments`.
  - Mistura local + M2A continua funcionando: docs locais são enviados com URL assinada (`source: "url"`) e zipados pelo worker.

- `src/routes/processos.$id.tsx`
  - Remover listener e trocar `requestM2ABulkDownload` por `downloadM2ADocuments` nas duas funções (`handleDownloadContratoDocs`, `handleDownloadSelectedDocs`).

- `src/routes/contratos.tsx`
  - Mesmo tratamento.

- `src/lib/m2a.ts`
  - Manter os tipos (`M2ADocumentoGerado`, `M2AUrlDocumento`, `M2ABulkDownloadDocumento`, `M2ABulkDownloadOptions`) — agora consumidos pelo novo helper.
  - Marcar `requestM2ABulkDownload` / `listenM2ABulkDownload` como `@deprecated` (manter exports vazios por compatibilidade, ou remover — preferência: remover, já que não há mais extensão).

---

## Fase 4 — Validação

1. `vps-worker`: `node scripts/test-call.js` adaptado para chamar `/documentos/baixar` com um `id_m2a` real (a ser fornecido) e validar que retorna `application/pdf` ou `application/zip` com bytes > 0.
2. Browser: clicar em "Baixar documento" e "Baixar ZIP" em `DocumentosEditor` e nas duas telas (`processos/$id`, `contratos`) — esperar download direto sem extensão.
3. Confirmar que página de login não aparece no log do PM2 (re-login automático funcionando).

---

## Detalhes técnicos pendentes de confirmação

- **URL exata** do M2A para baixar um documento por `id_m2a`. O padrão observado em outros endpoints é `/contratos/documentos/baixar/{id}/`, mas posso precisar ajustar (ex.: `/documentos/baixar/{id}/` ou query string). Vou começar com `/contratos/documentos/baixar/{id}/` e, se 404, varrer a tabela de documentos do contrato (`/contratos/documentos/tabela/{contratoId}/`) procurando o anchor real de download.
- **Re-deploy da VPS é manual** (`git pull && npm install && pm2 restart`). Vou deixar isso documentado no `vps-worker/README.md`.

---

## Arquivos afetados

Criar:
- `vps-worker/src/routes/documentos.js`
- `src/lib/m2a-documents.ts`

Editar:
- `vps-worker/src/m2a-client.js` (suporte a binário)
- `vps-worker/src/server.js` (registrar rota)
- `vps-worker/package.json` (`archiver`)
- `vps-worker/README.md` (nova rota)
- `supabase/functions/m2a-proxy/index.ts` (passthrough binário)
- `src/components/contratos/DocumentosEditor.tsx`
- `src/routes/processos.$id.tsx`
- `src/routes/contratos.tsx`
- `src/lib/m2a.ts` (remover funções da extensão, manter tipos)

Posso seguir com a implementação?
