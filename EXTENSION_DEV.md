# Desenvolvimento Rápido da Extensão M2A

## ⚡ Método 1: Desenvolvimento com Hot Reload (Recomendado)

Este é o **método mais rápido** - não precisa gerar zip, descarregar ou recarregar a extensão toda hora.

### Setup Inicial

1. **Abra a extensão em desenvolvimento no Chrome**:
   - Acesse `chrome://extensions/`
   - Ative "Modo de Desenvolvedor" (canto superior direito)
   - Clique "Carregar extensão sem empacotamento"
   - Selecione a pasta `/Users/user/Documents/Planejamento/m2a-extension/`

2. **Abra DevTools da extensão**:
   - Na página de extensões (`chrome://extensions/`)
   - Encontre "M2A Integrador Automático"
   - Clique em "service worker" para abrir DevTools do background
   - Pinel de console ficará aberto em background

### Fluxo de Desenvolvimento

```bash
# Terminal 1: Monitora mudanças na extensão (rebuild automático)
npm run watch:extension

# Terminal 2: Deve executar seu app normalmente (opcional)
npm run dev
```

### Como funciona:

1. Edita um arquivo em `m2a-extension/` (ex: `processo_scraper.js`)
2. `npm run watch:extension` detecta a mudança e regenera o zip em `public/`
3. **Sem precisar descarregar/carregar**:
   - Vá para `chrome://extensions/`
   - Clique no botão "🔄" (reload) da extensão
   - Ou pressione `Ctrl+R` (Windows/Linux) / `Cmd+R` (Mac) na página de extensões
4. Chrome recarrega apenas o código alterado
5. DevTools mostra logs atualizados

**Tempo total de ciclo**: ~2-3 segundos (vs ~30 segundos do método antigo)

---

## ⚙️ Método 2: Build Manual da Extensão

Se precisar apenas gerar o zip sem monitorar:

```bash
# Gera zip em public/m2a-extension.zip
npm run build:extension

# Gera zip e copia para dist/ também
npm run build:extension:full
```

---

## 📦 Método 3: Build Completo (Produção)

```bash
# Build do site + extensão (tudo junto)
npm run build

# Resultado:
# - dist/ com site otimizado
# - dist/m2a-extension.zip atualizado
```

---

## 🔍 Monitorando Logs em Tempo Real

### Logs da Extensão (Background)

```bash
# 1. Chrome DevTools → Extension Service Worker
chrome://extensions/ 
→ M2A Integrador Automático 
→ "service worker" 
→ Console/Network/Application
```

**Dica**: Mantenha esta aba aberta durante desenvolvimento para ver logs em tempo real:
```javascript
console.log("[M2A Scraper] Item extraído:", item);
```

### Logs do Portal M2A

Quando testar no portal:
- Abra DevTools do portal (F12)
- Aba "Console"
- Procure por logs `[M2A Scraper]` ou `[M2A Background]`

---

## 🧪 Workflow Recomendado

### Para Mudanças Simples (1-2 funções)

```bash
# Terminal 1
npm run watch:extension

# Browser: chrome://extensions → [Reload] extensão
# Testa no portal M2A
```

### Para Mudanças Maiores (refatoração)

```bash
# Terminal 1
npm run watch:extension

# Terminal 2
npm run dev  # Se estiver alterando UI também

# Browser: Recarregar extensão e site conforme necessário
```

### Antes de Commitar

```bash
npm run lint -- --fix       # Fixa problemas de formatação
npm run build:extension:full # Build final da extensão
npm run build               # Build do site
git add -A
git commit -m "v1.8.1: Descrição das mudanças"
```

---

## 📝 Estrutura de Arquivos da Extensão

```
m2a-extension/
├── manifest.json                    # Configuração da extensão
├── popup.html/js                    # UI do popup
├── background.js                    # Service worker (orquestra operações)
├── automation_engine.js             # Envia contratos para M2A
├── app_bridge.js                    # Comunica com iframe
├── m2a_bridge.js                    # Comunica com página M2A
└── engine/
    ├── numeracao_scraper.js         # Sincroniza numeração
    └── processo_scraper.js          # Extrai itens/atas/contratos
```

**Arquivos para monitorar**: Todos dentro de `m2a-extension/`

---

## ❌ Problemas Comuns

### "Extensão não está usando código novo"

✅ Solução:
```bash
# 1. Certifique-se que watch está rodando
npm run watch:extension

# 2. Recarregue a extensão no Chrome
chrome://extensions/ → [Reload]

# 3. Force reload do cache (Ctrl+Shift+R no portal M2A)
```

### "zip está desatualizado"

✅ Solução:
```bash
# Force rebuild manual
npm run build:extension:full

# Verifique data/hora do arquivo
ls -lh public/m2a-extension.zip
```

### "DevTools não mostra novos logs"

✅ Solução:
- Feche e reabra DevTools (F12)
- Ou pressione `Cmd+Shift+R` para hard refresh do background worker

---

## 🚀 Performance

| Método | Tempo Setup | Tempo Ciclo | Melhor Para |
|--------|-------------|------------|-----------|
| **Hot Reload (Recomendado)** | 2 min | ~2-3s | Desenvolvimento iterativo |
| Manual Build | 30s | ~10s | Testes ocasionais |
| Build Completo | 1 min | ~30s | Produção/Release |

---

## 💡 Dicas Adicionais

### 1. Use versioning

Sempre que fizer mudanças significativas:
```javascript
// Em manifest.json
"version": "1.8.1"

// Em package.json
"version": "1.8.1"

// Em CHANGELOG.md
## [1.8.1] - 2026-06-01
```

### 2. Adicione logging detalhado

```javascript
// Em processo_scraper.js
console.log("[M2A Scraper] Tentando buscar itens...", {
  url: attempt.url,
  ataId: ata.id_ata,
});
```

### 3. Teste com múltiplas abas

- Mantenha uma aba com o site (Planejamento)
- Mantenha uma aba com o portal M2A
- Mantenha DevTools aberta em background da extensão

Assim você vê comunicação em tempo real entre todos.

