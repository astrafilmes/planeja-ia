# Scripts de Build da Extensão M2A

## 📋 Scripts Disponíveis

### Quick Start

```bash
# ⚡ DEVELOPMENT (Recomendado)
# Monitora mudanças e regenera zip automaticamente
npm run watch:extension

# 📦 BUILD RÁPIDO
# Gera zip atualizado em public/
npm run build:extension

# 🏗️ BUILD COMPLETO
# Gera zip e copia para todos os locais (dist/, dist/client/)
npm run build:extension:full

# 🚀 BUILD COMPLETO DO PROJETO
# Faz build do site + extensão (produção)
npm run build
```

## 🔄 Fluxo de Desenvolvimento Rápido

### Opção 1: Hot Reload (Melhor Opção)

```bash
# Terminal 1: Monitora mudanças
npm run watch:extension

# Browser: Chrome DevTools → Extensions → Reload (or Cmd+R)
# Ciclo: ~2-3 segundos
```

Sem precisar de downloads/uploads frequentes!

### Opção 2: Manual

```bash
# Sempre que modificar arquivo da extensão
npm run build:extension

# Depois baixa o novo zip do site
# E recarrega no Chrome
```

## 📁 O que é Incluído no ZIP

- ✅ `manifest.json` - Configuração
- ✅ `popup.html` e `popup.js` - Interface
- ✅ `automation_engine.js` - Envia contratos
- ✅ `background.js` - Orquestrador
- ✅ `app_bridge.js` e `m2a_bridge.js` - Comunicação
- ✅ `engine/numeracao_scraper.js` - Sincronização
- ✅ `engine/processo_scraper.js` - Extração de itens

## 📍 Locais do ZIP

Após build, o arquivo está em:

- `public/m2a-extension.zip` - Principal (servido pelo site)
- `dist/m2a-extension.zip` - Backup (build completo)
- `dist/client/m2a-extension.zip` - Backup cliente

## 🔍 Mais Detalhes

Veja [EXTENSION_DEV.md](./EXTENSION_DEV.md) para workflow completo e troubleshooting.
