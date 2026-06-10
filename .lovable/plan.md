# Recriação do Planeja + Worker M2A em VPS

Mantemos 100% do backend atual (Supabase/Lovable Cloud: 27 tabelas, RLS, RPCs, dados). Refazemos a UI do zero, num stack mais simples e estável, e trocamos a extensão Chrome por um serviço Node.js que roda na sua VPS e fala HTTP direto com o M2A.

## Por que mudar de stack no frontend

O projeto hoje usa **TanStack Start + Cloudflare Workers SSR**, e esse é justamente o motivo dos crashes recentes de build/preview/deploy ("files are missing", 404, `server-entry` inexistente). Para uma app interna como o Planeja, SSR não traz benefício — só fragilidade. Vamos para o stack padrão do Lovable: **Vite + React + React Router (SPA)**, que publica direto sem worker e elimina toda essa classe de erros.

## Arquitetura nova

```text
┌─────────────────┐    HTTPS+JWT     ┌──────────────────────┐
│  Planeja (SPA)  │ ───────────────► │  Lovable Cloud       │
│  React + Vite   │                  │  (Supabase atual)    │
│  React Router   │                  │  - 27 tabelas + RLS  │
└────────┬────────┘                  │  - Auth (e-mail+Google)
         │                           │  - Edge function     │
         │ chamadas M2A              │    "m2a-proxy"       │
         │ via edge function         └──────────┬───────────┘
         ▼                                      │ HTTPS + HMAC
┌──────────────────────────────────────────────▼────────────┐
│  SUA VPS  (Node 20 + Fastify + axios + tough-cookie)      │
│  - Login fixo no M2A (1 conta de serviço)                 │
│  - Sessão persistida em memória + refresh automático      │
│  - Endpoints: /numeracao, /processos/:id, /contratos, ... │
│  - Fila simples (p-queue) para não derrubar o M2A         │
└────────────────────────────────────────────────────────────┘
```

O frontend **nunca** fala direto com a VPS. Tudo passa pela edge function `m2a-proxy`, que:
1. valida o JWT do usuário Lovable Cloud (RLS já garante quem é),
2. assina a chamada para a VPS com um segredo compartilhado (HMAC),
3. encaminha a resposta.

Assim a URL/credenciais da VPS nunca vazam pro browser.

## Etapas

### 1. Worker Node.js para a VPS (entregue como pasta `vps-worker/` no repo)
- `package.json`, `server.ts` (Fastify), `m2a-client.ts` (axios + cookie jar + login automático), `routes/` por endpoint, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md` com passo-a-passo de deploy (SSH, build, PM2 ou Docker, Nginx + Let's Encrypt).
- Reaproveita a lógica que já existe em `m2a-extension/engine/*` (scrapers de numeração e processo) e em `src/lib/m2a-*.ts`, convertida para Node puro.
- Endpoints iniciais (espelhando o que a extensão faz hoje):
  - `POST /auth/refresh` — força novo login
  - `GET  /numeracao` — lista de numerações
  - `GET  /processos/:id` — detalhe + itens
  - `GET  /contratos?ata=...` — snapshot de contratos
  - `GET  /servidores`, `GET  /unidades` — catálogos
  - `GET  /health` — usado pelo monitor do Planeja
- Segurança: cada request da edge function vem com header `X-Signature: HMAC_SHA256(body+timestamp, SHARED_SECRET)` e janela de 5 min.

### 2. Edge function `m2a-proxy` no Lovable Cloud
- Valida JWT do usuário, checa role mínima (`operador` ou superior em `user_roles`).
- Assina e encaminha para `VPS_API_URL`.
- Loga em `m2a_envio_logs` (tabela já existe).

### 3. Frontend novo (mesmas funcionalidades, UI limpa)
Páginas reconstruídas com React Router, shadcn/ui e Tailwind, todas usando o cliente Supabase atual sem mudança de schema:
- `/login`, `/reset-password`
- `/` Dashboard (cards de status + saúde da VPS via `/health`)
- `/processos`, `/processos/:id`
- `/contratos`, `/contratos/:id`
- `/importar-contratos` (planilhas — lógica do `src/lib/contratoImport.ts` mantida)
- `/numeracao`
- `/irp`
- `/secretarias`, `/fornecedores`, `/gestores`, `/fiscais`
- `/historico`, `/logs`
- Settings: configuração da VPS (URL + status), preferências M2A
- AppShell com sidebar, command palette, progress tracker e action bar — mas reescritos do zero, sem o peso atual.

### 4. Migração de stack
- Remover: `@tanstack/react-start`, `@tanstack/react-router`, `wrangler.jsonc`, `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routes/`, `src/routeTree.gen.ts`, `m2a-extension/`, `public/m2a-extension.zip`, `scripts/build-extension.js`, `scripts/watch-extension.js`.
- Adicionar: `react-router-dom`, estrutura `src/pages/`, `src/App.tsx` com `<BrowserRouter>`, `index.html` simples.
- `vite.config.ts` volta ao padrão Lovable.
- Backend Supabase fica intacto — nenhuma migration SQL nesta etapa.

### 5. Segredos
- **Na VPS** (`.env`): `M2A_USERNAME`, `M2A_PASSWORD`, `SHARED_SECRET`, `PORT`.
- **No Lovable Cloud** (vou pedir via `add_secret` na hora certa): `M2A_VPS_URL`, `M2A_VPS_SHARED_SECRET`.

## O que você precisa me dar quando eu pedir
1. Sistema operacional da VPS (Ubuntu 22.04? Debian? outro?) — define o `README.md` de deploy.
2. Se já tem domínio/subdomínio pra apontar pra VPS (ex.: `m2a.seudominio.com`) ou se vamos rodar só por IP+porta com TLS via Caddy.
3. Confirmar que a conta M2A de serviço já existe e os limites de uso dela.

## Trade-offs honestos
- **Perda real**: a extensão rodava no browser do usuário e herdava o login dele. Com VPS + conta de serviço, todas as ações no M2A aparecem como sendo dessa conta — auditoria do lado do M2A fica menos granular. Você confirmou que quer assim.
- **Risco do HTTP direto**: se o M2A adicionar CAPTCHA ou exigir execução de JS, o worker quebra e teremos que migrar para Playwright na mesma VPS. O código fica estruturado pra essa troca ser localizada em `m2a-client.ts`.
- **Trabalho**: é grande. Vou entregar em ordem: (1) worker VPS, (2) edge function, (3) frontend novo página por página, começando por login + dashboard + processos.

Se aprovar, começo pela **etapa 1 (worker VPS)** para você já conseguir subir e testar enquanto eu reconstruo o frontend.
