# Plano: Justificativa automática da DFD via Gemini

## Objetivo
Ao final do orquestrador de criação do Processo SRP (depois de consolidar todas as IRPs), gerar uma justificativa de demanda com Gemini e injetá-la na DFD via endpoint `atualizar_justificativa/<dfdId>/` do M2A.

## Arquivos a alterar/criar

### 1. `vps-worker/.env.example` e `.env`
Adicionar:
```
GEMINI_API_KEY=AQ.Ab8RN6LAgiJ...
```
(usuário precisa colar a chave real no `.env` da VPS; valor já fornecido)

### 2. `vps-worker/src/config.js`
Expor `gemini.apiKey` lendo `process.env.GEMINI_API_KEY` (sem `required()` — opcional; se ausente, pulamos a etapa com warning).

### 3. `vps-worker/src/m2a/justificativa-gemini.js` (novo)
- `gerarJustificativaGemini({ objeto, eRegistroPreco, itens, secretarias })`
  - Usa `fetch` direto contra `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent` com header `X-goog-api-key` (evita adicionar dependência `@google/generative-ai`).
  - Prompt conforme spec: 5 parágrafos, sem títulos, dissertativo, menção à Lei 14.133/2021.
  - Em erro/sem key → retorna fallback genérico (texto curto com objeto).
- `atualizarJustificativaM2A(dfdId, textoGerado)`
  - Usa o `m2aClient` existente (`vps-worker/src/m2a-client.js`) para POST autenticado com CSRF — não recriamos sessão/headers manualmente.
  - Path: `/gestao_compras/formalizacao_demanda/atualizar_justificativa/${dfdId}/`
  - Body `x-www-form-urlencoded`: `csrfmiddlewaretoken`, `justificativa_demanda` (HTML envolto em `<div style="text-align: justify;">…<br>…</div>`), `files=''`.
  - Erro é logado mas não derruba o job (justificativa é "best-effort").

### 4. `vps-worker/src/m2a/orquestrador-processo-srp.js`
Logo antes do `onProgress({ etapa: "concluido" … })`:
- Construir `listaItens` (string com descrições dos `itensCriados`) e `listaSecretarias` (siglas/nomes de `todasSecretarias`).
- `onProgress({ etapa: "justificativa", mensagem: "Gerando justificativa via IA…", progresso: 98 })`.
- `try { texto = await gerarJustificativaGemini(...); await atualizarJustificativaM2A(dfdId, texto); } catch (e) { erros.push({ etapa: "justificativa", erro: e.message }); }`
- Incluir `justificativaGerada: boolean` no retorno.

## Por que `fetch` em vez de `@google/generative-ai`
- Menos uma dependência no worker.
- A chamada é um único POST simples; SDK não agrega valor.
- Mantém o worker leve (já roda em VPS via PM2).

## Não-objetivos
- Não expor a chave Gemini no frontend.
- Não chamar Gemini do edge function — fica no worker, junto do resto do fluxo M2A.
- Não migrar/alterar nenhuma das 4 telas que ainda usam `postMessage` (escopo separado).

## Validação
- Rodar um processo SRP de teste; ao final, verificar nos logs:
  - `[gemini] justificativa gerada (N chars)`
  - `[m2a] justificativa atualizada na DFD <id> (status 200)`
- Conferir no portal M2A se o campo "Justificativa da Demanda" da DFD ficou preenchido com 5 parágrafos.
