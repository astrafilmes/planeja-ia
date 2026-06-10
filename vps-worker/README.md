# Planeja — M2A Worker (VPS)

Worker HTTP em Node.js que substitui a extensão Chrome do Planeja. Ele mantém
uma sessão única no portal M2A (conta de serviço), executa as requisições e
expõe uma API protegida por HMAC consumida pela edge function `m2a-proxy` do
Lovable Cloud.

```
Planeja (browser) → Lovable Cloud (edge function m2a-proxy) → ESTA VPS → M2A
```

## 1. Requisitos da VPS

- Ubuntu 22.04 / Debian 12 (ou qualquer Linux com Node 20+).
- 1 vCPU / 1 GB RAM já é suficiente para começar.
- Porta TCP de saída para `*.m2atecnologia.com.br`.
- Porta TCP de entrada **apenas** a partir do Lovable Cloud (ou aberta + TLS).

## 2. Instalação (deploy manual com PM2)

```bash
# como usuário não-root, com sudo disponível
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2

git clone <SEU_REPO> planeja
cd planeja/vps-worker
cp .env.example .env
nano .env                    # preencha M2A_*, SHARED_SECRET, etc.
npm install --omit=dev
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                  # rode o comando que o pm2 imprime
```

Verifique:

```bash
curl http://localhost:8080/health
# {"ok":true,"service":"planeja-m2a-worker", ...}
```

## 3. Instalação (Docker)

```bash
cd vps-worker
cp .env.example .env && nano .env
docker compose up -d --build
docker compose logs -f
```

## 4. Expor a porta com TLS (recomendado: Caddy)

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
m2a.seudominio.com.br {
  reverse_proxy 127.0.0.1:8080
}
EOF
sudo systemctl reload caddy
```

A partir daí o Lovable Cloud usa `https://m2a.seudominio.com.br`.

Sem domínio? Você pode usar IP + porta com TLS auto-assinado, mas o ideal é
manter o tráfego restrito por firewall **e** assinar com HMAC (já feito).

## 5. Configuração

`.env`:

| Variável               | Descrição                                                  |
| ---------------------- | ---------------------------------------------------------- |
| `M2A_BASE_URL`         | URL do tenant (`https://prefxxx.m2atecnologia.com.br`)     |
| `M2A_USERNAME`         | Usuário da conta de serviço                                |
| `M2A_PASSWORD`         | Senha                                                      |
| `SHARED_SECRET`        | Token compartilhado com a edge function (`openssl rand -hex 32`) |
| `PORT`                 | Porta HTTP do worker. Default `8080`                       |
| `M2A_MAX_CONCURRENCY`  | Requests simultâneos no M2A. Default `2`                   |

O login no M2A é fixo no portal da entidade: `/usuario/login/` com `perfil=1`.
O worker não usa variáveis de ambiente para alternar para fornecedor.

## 6. Endpoints

Todas as rotas (exceto `/health`) exigem dois headers:

```
X-Timestamp: 1717000000000           # Date.now() do cliente
X-Signature: <hex HMAC_SHA256>       # HMAC do `${ts}.${rawBody}`
```

| Método | Rota                                    | Descrição                                   |
| ------ | --------------------------------------- | ------------------------------------------- |
| GET    | `/health`                               | Liveness (sem auth).                        |
| GET    | `/auth/status`                          | Estado da sessão M2A.                       |
| POST   | `/auth/refresh`                         | Força novo login.                           |
| GET    | `/numeracao?ano=YYYY&secretarias=A,B`   | Maior nº de contrato por secretaria/ano.    |
| GET    | `/processos/:id`                        | Atas vinculadas ao processo.                |
| GET    | `/processos/:id/atas/:ataId/itens`      | Itens da ata.                               |

Novos endpoints (contratos, snapshot, servidores, unidades) são adicionados em
`src/routes/` seguindo o mesmo padrão; cada um chama `m2a.get(path)` e parseia
com `cheerio`.

## 7. Atualização

```bash
cd planeja && git pull && cd vps-worker
npm install --omit=dev
pm2 restart planeja-m2a-worker      # ou: docker compose up -d --build
```

## 8. Troubleshooting

- **`M2A_LOGIN_FAILED`**: usuário/senha errados, perfil sem permissão, ou CAPTCHA.
  Veja `pm2 logs planeja-m2a-worker`. Se aparecer "portal de fornecedores",
  confirme que o log mostra `[m2a-login] start ENTIDADE ... perfil=1`. Se não
  mostrar, a VPS ainda está rodando código antigo; rode `git pull`,
  `npm install --omit=dev` e `pm2 restart planeja-m2a-worker --update-env`.
- **`401 bad_signature`** vindo da edge function: `SHARED_SECRET` divergente
  entre a VPS e o Lovable Cloud.
- **`stale_timestamp`**: relógio da VPS muito fora de hora —
  `sudo timedatectl set-ntp true`.
- **Páginas voltam vazias / com formulário de login**: a sessão expirou e o
  re-login falhou. Rode `POST /auth/refresh` manualmente para forçar.
