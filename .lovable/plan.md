## Inspiração extraída da referência (Dribbble)

Não vamos clonar — vamos aproveitar **ideias específicas** que conversam com o Planeja:

1. **Layout split com painel lateral fixo** (esquerda = conteúdo principal, direita = "agenda/coluna viva")
2. **Bento grid assimétrico** com cards de tamanhos diferentes (números grandes em destaque, um card "hero/imagem" no meio, mini-KPIs flutuantes sobrepostos)
3. **Hierarquia tipográfica editorial**: título grande "Main Dashboard" + sub-tabs minimalistas com underline
4. **Cards monocromáticos por função**: 1 card sólido colorido como acento + demais neutros/brancos
5. **Painel direito tipo "linha do tempo"**: lista vertical com horário à esquerda e cards coloridos por categoria
6. **Card promocional/CTA ilustrado** no meio do grid (no nosso caso = WorkflowGuide / próximos passos)

Tudo isso usando **tokens semânticos existentes** (accent verde/teal do Planeja já casa com a paleta sage/teal da referência).

---

## O que muda no `/dashboard`

### 1. Novo layout em 2 colunas (12 / 4)
```text
┌──────────────────────────────────┬───────────────┐
│  HERO compacto (eyebrow + título)│  AGENDA       │
│                                  │  ─────────    │
│  Tabs: Visão geral · Atividade   │  Hoje, terça  │
│  ─────────                       │  [mini cal]   │
│                                  │               │
│  ┌─────┐ ┌─────┐ ┌──────────┐    │  Timeline:    │
│  │ KPI │ │ KPI │ │  CARD    │    │  • Processos  │
│  │ 142 │ │ 38  │ │  HERO    │    │    pendentes  │
│  └─────┘ └─────┘ │  (imagem │    │  • Contratos  │
│  ┌─────┐ ┌─────┐ │   ou     │    │    a vencer   │
│  │ KPI │ │ KPI │ │  gráfico)│    │  • Sync M2A   │
│  └─────┘ └─────┘ └──────────┘    │               │
│                                  │               │
│  Gráfico: Contratos por sec.     │               │
│  (full width)                    │               │
│                                  │               │
│  Guia rápido (compact cards)     │               │
└──────────────────────────────────┴───────────────┘
```

### 2. Bento grid de KPIs (substitui a fileira atual de 4 StatChips)
- 4 cards pequenos em grid 2×2 + 1 card grande à direita ocupando 2 linhas
- 1 deles ganha **fundo sólido accent** (amarelo/teal) como na referência — destaque para "Processamentos IRP" ou "Contratos vigentes"
- Os outros: fundo branco/card neutro, número grande (text-3xl), label discreto acima, micro-sparkline opcional
- O card grande (à direita do bento): "Próximo passo" — combina um indicador-chave com CTA forte

### 3. Painel direito "Agenda / Atividade"
- Substitui o card "Guia rápido" lateral
- Topo: data atual em destaque editorial (`Jan, 21 · Terça`) + mini-calendário compacto (recharts/dom nativo, 1 mês, dots em datas com vencimento)
- Abaixo: **timeline vertical** com horários/datas relativas → atividades reais do sistema:
  - Contratos com vencimento próximo (badge teal)
  - Processos aguardando sincronização (badge amber)
  - Últimos jobs IRP (badge rose)
- Cada item = card pill colorido pastel + ícone + título + horário, alinhado a uma "trilha" vertical
- Scroll independente

### 4. Refinamentos visuais
- **Cantos mais arredondados** (`rounded-2xl` / `rounded-3xl`) coerentes com a referência
- **Sombras suaves** usando `var(--shadow-card)` (sem reintroduzir as sombras pesadas que removemos)
- **Tabs minimalistas** com underline accent (Visão geral · Atividade · Indicadores)
- **Espaçamento generoso** entre seções (gap-8)
- Header do dashboard com saudação + busca global compacta no topo (opcional, só se o AppShell já não cobre)

### 5. O que **não** muda
- Não muda o AppShell, sidebar, rotas, RLS, queries de backend (apenas adiciona 2-3 queries leves para a timeline)
- Não muda o tema/paleta — só recompõe usando os tokens já existentes
- Não toca em outras páginas

---

## Seções técnicas

**Arquivos editados**
- `src/routes/dashboard.tsx` — reestrutura o layout
- `src/components/dashboard/BentoKPI.tsx` *(novo)* — variant de card KPI (neutro + accent)
- `src/components/dashboard/AgendaPanel.tsx` *(novo)* — coluna direita (mini-cal + timeline)
- `src/components/dashboard/MiniCalendar.tsx` *(novo)* — calendário compacto read-only com dots
- Reaproveita `HeroCard`, `ChartCard`, `WorkflowGuide` existentes

**Dados novos (queries leves, mesma sessão Supabase)**
- Contratos com `data_fim` próxima (próx. 30 dias) → timeline
- Últimos 5 `irp_jobs` por `created_at` → timeline
- Contagem de processos sem contrato vinculado → timeline

**Sem mudanças de schema, sem migration, sem novas dependências.**

---

## Entregáveis
1. Dashboard reorganizado em bento + painel lateral de agenda
2. KPIs visualmente hierarquizados (1 destaque colorido + neutros)
3. Timeline real de atividades do sistema (não mock)
4. Visual coeso com a referência, mas usando 100% dos tokens do Planeja

Aprova esse plano para eu implementar?