# Blindagem da geração de contratos

Meta: **nenhum contrato chega ao M2A com preposto vazio, quantidade acima do saldo, ou secretaria sem unidade gestora vinculada na ata**. Toda validação é resolvida na tela de Importação, antes do botão "Autorizar geração".

---

## 1. Preposto obrigatório (bloqueio total)

**Regra:** o botão "Autorizar geração" fica desabilitado enquanto qualquer fornecedor da importação não tiver preposto preenchido — e também se algum contrato individualmente ficar sem preposto herdado.

- Reforçar `fornecedoresSemPreposto` em `usePrepostosState` como bloqueio duro no `AutorizarGeracaoPanel` (hoje já existe o aviso, mas o botão continua clicável em alguns fluxos).
- Adicionar checagem no `useAutorizarGeracao` que aborta antes de qualquer insert se `prepostoContrato` estiver vazio para qualquer contrato derivado.
- Persistir automaticamente novos prepostos digitados em `fornecedores_prepostos` já ao sair do campo (debounce), para que a próxima importação do mesmo fornecedor já venha preenchida.
- Banner vermelho fixo no topo listando fornecedores pendentes com botão "focar no campo".

## 2. Saldo real da ata M2A (consulta em tempo real)

**Regra:** ao clicar em "Autorizar geração", o sistema faz uma consulta ao M2A por ata envolvida e valida item a item.

- Nova função no worker: `GET /atas/:m2aAtaId/saldos` → devolve `{ m2a_item_id, quantidade_total, quantidade_utilizada, saldo }`.
- Nova edge function proxy `m2a-saldos` (ou reuso do `m2a-proxy`) invocada pelo front antes de autorizar.
- Comportamento por item, considerando quantas dotações o item tem no contrato derivado:
  - **1 dotação:** se `quantidade_planilha > saldo`, ajusta automaticamente para `saldo` e mostra um badge amarelo "ajustado de X → Y (saldo)". Se `saldo == 0`, item é bloqueado.
  - **>1 dotação:** bloqueio duro. Mostra card "Este item excede o saldo e possui múltiplas dotações — ajuste manualmente a quantidade de cada dotação". Usuário edita inline (nova coluna editável em `ItensReviewTable`, reaproveitando padrão do `ItemEditDialog`).
  - **Saldo suficiente:** segue sem alteração.
- Nova aba/painel "Validação de saldo" no `AutorizarGeracaoPanel` com contadores: `X itens OK · Y ajustados · Z bloqueados`.

## 3. Unidades gestoras equivalentes (participantes da ata)

**Regra:** cada secretaria envolvida no contrato precisa estar cadastrada como **unidade participante** na ata M2A do exercício corrente. Se não estiver, o sistema tenta inclusão automática (portando a lógica do script do usuário) e, se falhar, bloqueia.

- Novo endpoint worker `POST /atas/:m2aAtaId/participantes/garantir` recebendo `{ secretariaIds: [] }`. Internamente:
  1. `GET` da tabela de participantes da ata.
  2. Para cada secretaria pedida: se já é participante → OK. Se não → busca a `unidade_gestora` equivalente (usando `m2a_uo_id` já mapeado em `secretarias`, com fallback fuzzy por nome normalizado — igual ao `resolveUG2026` do script).
  3. `POST /ata_registro_precos/unidades_participantes/unidades_gestoras/incluir/:participanteId/` com `data`, `unidade_gestora`, CSRF.
  4. Retorna lista `{ secretariaId, status: 'ja_incluida' | 'incluida_agora' | 'sem_equivalencia' | 'erro' }`.
- Front chama esse endpoint durante a validação pré-geração. Bloqueia contratos cujas secretarias não puderem ser incluídas e mostra card acionável "Corrigir na M2A" com o motivo.
- Tabela auxiliar opcional: `secretaria_unidades_equivalentes(secretaria_id, exercicio, unidade_gestora_m2a_id)` para memorizar equivalências resolvidas manualmente e evitar fuzzy match futuro.

## 4. Painel de validação pré-geração

Novo componente `PreGeracaoValidacaoPanel` (acima do `AutorizarGeracaoPanel`) que roda ao clicar em "Validar antes de gerar":

```text
[Validação pré-geração]
✔ Prepostos:        12/12 fornecedores
⚠ Saldos:           38 OK · 4 ajustados · 2 bloqueados
✔ Unidades gestoras: 6/6 secretarias participantes
[Detalhes ▾]                              [Corrigir problemas] [Autorizar geração]
```

- "Autorizar geração" só habilita quando não há bloqueios.
- Cada seção expande com a lista detalhada e ação inline (editar quantidade, incluir preposto, forçar re-tentativa da inclusão de participante).

## 5. Fragilidades e riscos a mitigar

- **Consulta de saldo em tempo real** adiciona 1–3s de latência por ata. Mitigação: cache em memória por sessão + botão "Revalidar".
- **Fuzzy match de unidades gestoras** pode escolher errado. Mitigação: quando `bestScore < 3` pedir confirmação manual e persistir na tabela de equivalências.
- **Consumo de saldo concorrente**: entre a validação e o envio, outro sistema pode gastar o saldo. Mitigação: revalidar saldo por contrato dentro do worker `orquestrador-contrato.js` antes do módulo 5 (atualizar quantidades) e, se divergir, retornar erro tipado `SALDO_INSUFICIENTE_RUNTIME` que o front trata mostrando o card de correção.
- **CSRF/sessão M2A no worker** para a inclusão de participante — reusar o `m2a-client.js` existente.
- **Múltiplas dotações com ajuste**: como o usuário confirmou bloqueio manual, garantimos que a lógica de rateio automático **não** é escrita, evitando divisão errada.

## 6. Inconsistências atuais que ficam resolvidas

- Contrato enviado com quantidade > saldo (erro 500 M2A no módulo 5).
- Contrato enviado sem preposto (falha no módulo de documentos/atores).
- Secretaria ausente na ata (erro na inclusão de item por participante).
- Duplicidade de tentativas manuais de sync de participantes por script no console (fica embutido no worker).

---

## Detalhes técnicos

**Arquivos que serão criados/alterados:**

- `vps-worker/src/m2a/atas-saldos.js` (novo) — parser da tabela de saldos da ata.
- `vps-worker/src/m2a/atas-participantes.js` (novo) — porta o script do usuário para incluir participantes (`resolveUG2026`, POST em `unidades_gestoras/incluir/:id/`).
- `vps-worker/src/routes/atas.js` (novo) — expõe `GET /atas/:id/saldos` e `POST /atas/:id/participantes/garantir`.
- `supabase/functions/m2a-proxy/index.ts` — encaminha os dois novos endpoints.
- `src/lib/m2a/atas.ts` (novo) — client tipado no front.
- `src/features/importar-contratos/hooks/useValidacaoPreGeracao.ts` (novo) — orquestra as 3 validações em paralelo.
- `src/features/importar-contratos/components/PreGeracaoValidacaoPanel.tsx` (novo) — UI descrita acima.
- `src/features/importar-contratos/components/ItensReviewTable.tsx` — colunas editáveis de quantidade por dotação + badge "ajustado".
- `src/features/importar-contratos/components/AutorizarGeracaoPanel.tsx` — bloqueio duro + chip resumo.
- `src/features/importar-contratos/hooks/useAutorizarGeracao.ts` — aborta se validação não passou; aplica quantidades ajustadas.
- `vps-worker/src/m2a/orquestrador-contrato.js` — revalida saldo antes do módulo 5, retorna erro tipado.
- Migration nova: `secretaria_unidades_equivalentes` (com GRANTs e RLS por role admin/gestor).

**Ordem de implementação sugerida:**
1. Worker: endpoints de saldo e participantes (com testes em `vps-worker/scripts/`).
2. Edge proxy + client TS.
3. Hook `useValidacaoPreGeracao` + painel.
4. Bloqueio duro no `AutorizarGeracaoPanel` e edição inline em `ItensReviewTable`.
5. Revalidação runtime no orquestrador do worker.
6. Migration da tabela de equivalências + persistência automática de prepostos.

Confirma para eu começar pelo passo 1 (endpoints no worker)?
