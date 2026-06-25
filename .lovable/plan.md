# Fluxo de Processo Comum (não-SRP) na importação de DFDs

Hoje a importação de planilhas no `/irp` sempre dispara o fluxo SRP (DFD da gerenciadora + intenções/IRPs + consolidação). Vou adicionar um **caminho alternativo** ativado por um checkbox na tela de "informações do processo".

## 1. UI — tela de cadastro de informações (`src/routes/irp.tsx` + `IrpConfirmacaoProcessoModal`)

- Novo campo no formulário do cabeçalho: **checkbox "É Registro de Preços?"**, ligado por padrão (preserva comportamento atual).
- Quando **desmarcado**:
  - Esconder o campo "Data de consolidação" (não é exigido).
  - Texto do botão muda para "Confirmar e criar processo comum".
  - Modal de confirmação exibe um badge "Processo comum (sem SRP)" e omite a linha de data de consolidação.
- O estado `eRegistroPreco: boolean` viaja no payload enviado ao worker.

## 2. Worker — novo orquestrador (`vps-worker/src/m2a/orquestrador-processo-comum.js`)

Para cada planilha (uma por secretaria), nesta ordem:

```text
Gerenciadora (primeira) ─┐
Participante 2 ──────────┤── cria 1 DFD por secretaria (sem is_registro_de_preco)
Participante N ──────────┘     + adiciona itens + cadastra Solicitação de Despesa (dotação)
                                  ↓
                          Pega DFD da gerenciadora
                                  ↓
              POST /formalizacao_demanda/gerar_processo/{dfdGerId}/
                                  ↓
              GET  /formalizacao_demanda/{dfdGerId}/  → parseia
                   <a href="/processo_administrativo/{processoId}/">  e o número
                                  ↓
              POST /processo_administrativo/atualizar/{processoId}/
                                  ↓
              POST /processo_administrativo/adicionar_solicitacoes/{processoId}/
                   itens = "dfdId1,dfdId2,..."
                                  ↓
              GET  /processo_administrativo/item/tabela/{processoId}/
                   Para cada item fora de ordem →
                   POST /processo_administrativo/item/alterar_sequencial/{itemId}/
                                  ↓
              Justificativa Gemini → atualizar_justificativa/{dfdGerId}/
```

Etapas reportadas por `onProgress` em SSE (mesma assinatura do SRP):
`criar_dfd_secretaria`, `incluir_itens`, `cadastrar_dotacao`, `gerar_processo`, `descobrir_processo`, `atualizar_processo`, `vincular_dfds`, `reordenar_itens`, `justificativa`, `concluido`.

## 3. Worker — funções novas em `vps-worker/src/m2a/processo-comum.js`

- `criarDFDComum(payload)` — mesma chamada de `criarDFD` **sem** o campo `is_registro_de_preco`.
- `cadastrarDotacao(dfdId, { unidade_orcamentaria, despesa_projeto_atividade })` — POST `/gestao_compras/solicitacao_despesa_atividade/incluir/{dfdId}/`.
- `gerarProcessoFromDFD(dfdId)` — POST `/formalizacao_demanda/gerar_processo/{dfdId}/` com `text=true`.
- `descobrirProcessoDaDFD(dfdId)` — GET `/formalizacao_demanda/{dfdId}/?` e extrai `processoId` e `numero` a partir do bloco `kt-widget12__item m2a-widget12__item` (link `/processo_administrativo/{id}/` + texto).
- `vincularDFDsAoProcesso(processoId, dfdIds[])` — POST `/processo_administrativo/adicionar_solicitacoes/{processoId}/` com `itens=dfd1,dfd2,...`.
- `reordenarItensProcesso(processoId, ordemDesejada[])` — GET `/processo_administrativo/item/tabela/{processoId}/?page_size=1000`, parseia `tr_<itemId>` + descrição + sequencial atual; para cada item fora da posição esperada, POST `/processo_administrativo/item/alterar_sequencial/{itemId}/` com `novo_sequencial=N`.

Reaproveita `atualizarProcesso` existente (ajustando overrides — sem `permitir_adesao_registro_preco`, sem campos de período de vigência específicos de SRP) ou cria um `atualizarProcessoComum` paralelo se os defaults forem incompatíveis.

## 4. Rota HTTP — `vps-worker/src/routes/processos-comum.js`

`POST /processos/comum/criar` com SSE, espelhando `processos-srp.js`. Recebe o mesmo payload + `eRegistroPreco=false` (na verdade só é chamado quando false).

## 5. Cliente — `src/lib/m2a-comum.ts` + roteamento em `src/lib/m2a.ts`

- Função `criarProcessoComumM2A(payload)` análoga a `criarProcessoSrpM2A`.
- Em `requestM2AProcessCreation`, decidir endpoint pelo flag `eRegistroPreco`.

## 6. Persistência local (`processos`)

Após o orquestrador comum concluir, mantém a mesma criação automática de registro em `processos` que já existe para SRP, com `modalidade: "comum"` em vez de `"SRP"`.

## 7. Testes

Adicionar `vps-worker/scripts/test-processo-comum.js` (clone do `test-irp-srp.js`) apontando para `/processos/comum/criar`, com mesmo logging por etapa.

## Pontos abertos

1. **Dotação por DFD**: o exemplo do usuário mostra apenas `unidade_orcamentaria` e `despesa_projeto_atividade`. Vou ler esses dois campos do payload da secretaria (já temos `m2a_uo_id`); a fonte do `despesa_projeto_atividade` por secretaria precisa ser confirmada — proponho buscar do cadastro de secretarias (ou pedir ao usuário cadastrar um `m2a_despesa_projeto_id` por secretaria). Se vazio, pulamos a dotação com warning.
2. **Comissão de planejamento / responsável_dfd** para participantes: vou reutilizar os mesmos do formulário principal (gerenciadora) salvo se houver override por secretaria no cadastro.
3. **Defaults do `atualizarProcesso` comum**: confirmar se mantemos `modalidade=7` ou se há outra (ex.: pregão eletrônico sem SRP). Default proposto: mantém os mesmos, só remove os flags exclusivos de SRP.

Posso ajustar 1–3 antes de implementar — confirme se a fonte do `despesa_projeto_atividade` por secretaria já existe em algum lugar (ou se devo adicionar campo no cadastro de Secretarias).
