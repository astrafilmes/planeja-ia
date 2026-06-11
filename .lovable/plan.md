# Plano de correções — PLANEJA-IA

Agrupei tudo o que você pediu em blocos lógicos. Cada bloco lista o arquivo principal e o que muda. Nada de mexer em lógica de negócio fora do necessário.

## 1. Identidade e tipografia (global)

- Trocar título exibido para **PLANEJA-IA** (maiúsculo) onde aparece no header/sidebar e `<title>` (`index.html`, `AppShell.tsx`, `route-head.ts`).
- Padronizar **uma única família** de fonte para todo o sistema: **Inter** (já é a sans). Variar só **peso, tamanho e cor**.
  - Remover `Instrument Serif` e `JetBrains Mono` de `src/index.css` / `src/styles.css` (manter `font-mono` apontando para system mono só como fallback técnico, mas não usar em UI).
  - Auditar componentes que usam `font-serif` / `font-mono` e trocar por `font-sans` com peso/tamanho.
- Resultado: todos os campos (inputs, labels, valores) na mesma família.

## 2. Menu lateral (AppShell)

- Hoje itens e subitens parecem iguais. Diferenciar visualmente:
  - Itens pai: peso 600, ícone, sem indentação.
  - Subitens: indentação clara (pl-8), peso 400, tamanho menor, com guia vertical (border-left sutil) para indicar hierarquia.
  - Item pai com filhos: chevron de expandir/recolher.

## 3. Página do Processo (`routes/processos.$id.tsx`)

- **Botão "Sincronizar com M2A" no topo** (header da página), via `PageHeader.primaryAction`. Remover o botão atual que fica ao lado da URL.
- **Tabela de itens**: remover colunas de consumo. Manter:
  - Item / Descrição
  - Quantidade
  - Valor unitário inicial (estimado)
  - Valor contratado
  - Total
- Padronizar fonte dos campos do formulário (vide bloco 1).

### Aba Contratos (dentro do processo)
- Reordenar colunas com larguras controladas:
  - Colunas de **Valor** e **Status**: `width: 1%; white-space: nowrap` para ocuparem exatamente o conteúdo, sem quebrar.
  - Demais colunas flexíveis.
- Adicionar **2 ícones clicáveis** na linha (sem texto, com tooltip):
  - 🖨️ Impresso/Assinado (toggle)
  - 📢 Publicado (toggle)
- Testar em desktop (1440px) para garantir que valor não quebra linha.

### Aba Servidores
- Corrigir contador no título: `Servidores ({count})` — bug, hoje mostra 0 mesmo com 3.
- Remover seção "Servidores adicionais".
- Permitir **editar servidores apenas antes do envio à M2A**. Após envio com sucesso → bloqueado (mensagem: "Editar somente pela M2A").

### Aba Documentos
- Remover texto "Documento gerado no portal id …".
- Remover badge "Portal #1".
- Trocar ações em lote para: **ZIP selecionados** / **PDF selecionados**.

### Envio pela extensão
- Remover "Código externo".
- Manter apenas botão "Abrir porta".

## 4. Página do Contrato (`routes/contratos.$id.tsx`)

### Cabeçalho de informações
- Remover: "Marcar como publicado", "Código externo", "Secretaria".
- Em vez de "Ir para o processo X", mostrar o **número do processo ao lado do número do contrato**, clicável (link discreto sublinhado no hover).

### Dados do contrato
- Remover: Link/código, Código externo, Dotação, Número do contrato (duplicado), texto "Automação usa esta ata gravado no contrato não há fallback…".

### Tabela de itens do contrato
- Permitir **editar e excluir itens** com modal de aviso:
  - "Esta alteração pode interferir na sincronização com a M2A. Deseja continuar?"
  - Checkbox: **"Não mostrar este aviso novamente"** (persistido em `localStorage` por usuário).

## 5. Página de Contratos (lista — `routes/contratos.tsx`)

- Adicionar colunas/ícones de **Impresso/Assinado** e **Publicado** (mesmos toggles da aba do processo, persistindo em `contratos`).
- Adicionar **filtros** no topo: "Impresso", "Publicado" (tri-state: todos / sim / não).
- Garantir mesma regra de largura para coluna de Valor e Status (nowrap, width 1%).

### Barra de ações em lote (quando há seleção)
Ordem exata, sem prefixo "Lote":
1. **Baixar documentos**
2. **Exportar XLSX**
3. **Exportar PDF**
4. **Baixar planilha**
5. **Excluir**
6. **+ Novo**

## 6. Banco de dados

Adicionar 2 colunas em `contratos`:
- `impresso_assinado boolean default false`
- `publicado boolean default false`

Migration com GRANTs e políticas já existentes mantidas (update permitido a `authenticated` conforme padrão atual da tabela).

## Ordem de execução

1. Migration (`contratos.impresso_assinado`, `contratos.publicado`).
2. Tipografia global + título PLANEJA-IA + menu lateral.
3. Página do processo (header, itens, abas contratos/servidores/documentos/extensão).
4. Página do contrato (limpeza cabeçalho/dados, editar itens com aviso opt-out).
5. Página de contratos (colunas, filtros, barra de ações reordenada).
6. QA visual em 1440px focando truncamento de valores.

## Observações técnicas

- Toggles de impresso/publicado: `Toggle` ou `Button` com `variant="ghost"` + ícone preenchido quando ativo.
- Largura "shrink to fit" em tabela: `<TableHead className="w-[1%] whitespace-nowrap">`.
- Aviso opt-out: chave `localStorage["warn-edit-item"] = "off"`.
- Edição de servidor bloqueada quando `contrato.m2a_sync_status === 'success'` (ou flag equivalente já existente).

Pode aprovar que sigo executando nessa ordem, ou me diga o que ajustar.