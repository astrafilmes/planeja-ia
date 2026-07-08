# Saldo real por (ata, secretaria, item) — plano revisado

## Insight

A M2A não expõe um endpoint direto de "saldo disponível". Mas os dados existem em dois lugares:

1. **Cota da secretaria na ata** — quanto foi alocado para aquela unidade participante em cada item.
   `GET /ata_registro_precos/unidades_participantes/tabela/{ataId}/?page_size=100`
   → lista os `participanteId` (com secretaria + exercício).
   `GET /ata_registro_precos/unidades_participantes/itens/tabela/{participanteId}/?page_size=1000`
   → para cada item devolve `m2a_item_id` (da linha `tr_...`), unidade, e **quantidade total alocada** para aquela secretaria.

2. **Consumo já contratado** — soma das quantidades dos itens da ata em contratos existentes daquela ata + secretaria.
   Cada contrato tem itens em `/contratos/{id}/#contrato_item` (a linha traz `input value="10,0"` + badge `/ 20,00`, onde 10 = já contratado, 20 = disponível — só útil quando já existe contrato). Para ser genérico, iteramos os contratos da ata/secretaria e somamos.

**Fórmula:**
```
saldo(ata, secretaria, item) = cota_participante − Σ quantidade_contratada_dos_contratos_existentes(ata, secretaria, item)
```

Isso funciona **sempre**, exista ou não contrato anterior. Zero contratos ⇒ saldo = cota total. É a única forma limpa e determinística sem precisar "gerar e apagar".

## Arquitetura

### Worker — novos endpoints

- `GET /atas/:ataId/participantes-itens`
  - Chama `unidades_participantes/tabela/:ataId` → lista de participantes com secretaria.
  - Para cada participante, chama `unidades_participantes/itens/tabela/:participanteId`.
  - Retorna:
    ```json
    {
      "ataId": 5115,
      "participantes": [
        {
          "participanteId": 6160,
          "secretariaNome": "GABINETE DO PREFEITO",
          "exercicio": 2025,
          "itens": [
            { "m2aItemId": "83115", "numero": "40", "unidade": "SERVIÇO", "quantidadeAlocada": 10.0 }
          ]
        }
      ]
    }
    ```

- `GET /atas/:ataId/consumo`
  - Lista contratos da ata: `/contratos/tabela/?ata=:ataId&page_size=1000` (endpoint existente do M2A).
  - Para cada contrato: extrai secretaria (do cabeçalho) e itens (`/contratos/itens/tabela/:contratoId/` ou parseamos da página do contrato).
  - Agrega por `(secretariaId, m2aItemId)` → `quantidadeContratada`.
  - Retorna:
    ```json
    {
      "ataId": 5115,
      "consumo": [
        { "secretariaNome": "GABINETE DO PREFEITO", "m2aItemId": "83115", "quantidade": 4.0, "contratos": [{"id":69607,"quantidade":4}] }
      ]
    }
    ```
  - Cache em memória por ataId (TTL curto: 60s) para não re-parsear a cada chamada.

- (Opcional, atalho) `GET /atas/:ataId/saldos-por-secretaria` que junta os dois anteriores e devolve `saldo = cota − consumo` pronto.

### Front — `useValidacaoPreGeracao`

Trocar a lógica atual (que tentava ler saldo global da ata) por:

1. Para cada ata envolvida na importação, buscar `/atas/:id/saldos-por-secretaria` uma vez.
2. Montar índice `saldoMap[ataId][secretariaMatchKey][m2aItemId] = saldo`.
   - `secretariaMatchKey`: primeiro tenta `m2a_uo_id`, fallback normalizando nome (mesmo `resolveUG2026`).
3. Para cada item de cada contrato derivado:
   - `qtdPlanilha` vs `saldo`.
   - 1 dotação e `qtd > saldo > 0` → ajusta automático, badge amarelo.
   - 1 dotação e `saldo == 0` → bloqueia item.
   - >1 dotação e `Σ qtd > saldo` → bloqueia, força edição manual em `ItensReviewTable`.
4. Retorna contadores + lista de ajustes/bloqueios para o `PreGeracaoValidacaoPanel`.

### Runtime safety net

Em `orquestrador-contrato.js`, **antes do módulo 5** (atualizar quantidades), rebuscar `saldos-por-secretaria` daquela ata/secretaria/item específicos. Se `qtdEnviada > saldoAtual`, retornar erro tipado `SALDO_INSUFICIENTE_RUNTIME` com `{ m2aItemId, saldoAtual, quantidadePedida }` — o front trata reabrindo o painel de validação para essa ata.

Isso cobre o único cenário que a validação pré-geração não captura: outra pessoa consumiu saldo entre a validação e o envio.

## O que fica de fora (por design)

- **Solução "gerar e apagar"** — descartada pelo custo/tempo.
- **Rateio automático em múltiplas dotações** — mantido bloqueio manual (decisão anterior do usuário).
- **Endpoint mágico de saldo direto** — não existe na M2A. A abordagem cota−consumo é a única confiável.

## Fragilidades e mitigações

| Risco | Mitigação |
|---|---|
| Contrato antigo com item cancelado inflando o consumo | Ignorar contratos com status `cancelado`/`rescindido` no parser (filtrar por classe/badge). |
| Contrato em rascunho ainda não salvo por outro usuário | Aceito — sistema de referência é o M2A; se ainda não está lá, não existe. Runtime revalidation cobre corrida. |
| Latência (2 requests HTTP por ata + N por participante) | Cache 60s por ata no worker; front dispara em paralelo por ata; botão "Revalidar". |
| Casamento secretaria local ↔ participante M2A | Primeiro `m2a_uo_id`; fallback fuzzy com score mínimo; persistir escolha em `secretaria_unidades_equivalentes` (tabela já criada). |
| Parser HTML frágil | Usar seletores estáveis (`tr.tr_ata_registro_preco_unidade_participante_item`, `id="tr_..."`), testes com fixtures salvas em `vps-worker/scripts/fixtures/`. |
| Item da planilha sem `m2aItemId` resolvido | Já é bloqueado hoje (contratosSemCadastroM2A). Mantém. |

## Arquivos afetados

**Novos**
- `vps-worker/src/m2a/atas-participantes-itens.js` — parser da cota por participante.
- `vps-worker/src/m2a/atas-consumo.js` — parser dos contratos + agregação.
- `vps-worker/scripts/fixtures/` — HTML capturado das duas telas para testes offline.

**Alterar**
- `vps-worker/src/routes/atas.js` — expor `/participantes-itens`, `/consumo`, `/saldos-por-secretaria`.
- `vps-worker/src/m2a/orquestrador-contrato.js` — revalidação pré-módulo-5 + erro tipado.
- `src/lib/m2a/atas.ts` — client dos novos endpoints.
- `src/features/importar-contratos/hooks/useValidacaoPreGeracao.ts` — nova lógica cota−consumo.
- `src/features/importar-contratos/components/PreGeracaoValidacaoPanel.tsx` — mostrar cota, consumido, saldo por secretaria.

**Remover**
- `vps-worker/src/m2a/atas-saldos.js` (parser genérico que não bate com a realidade) — substituído pelos dois novos.

## Ordem de execução

1. Parser `atas-participantes-itens.js` + fixture + rota `/participantes-itens`.
2. Parser `atas-consumo.js` + fixture + rota `/consumo`.
3. Rota agregadora `/saldos-por-secretaria` com cache.
4. Refactor de `useValidacaoPreGeracao` e do painel.
5. Revalidação runtime no orquestrador.

## Metas mensuráveis

- 0 contratos gerados com `quantidade > saldo` (medido via logs do worker por 7 dias).
- 0 contratos gerados sem preposto (já implementado no bloqueio duro).
- 0 falhas de "secretaria não é participante" (já coberto pelo `participantes/garantir`).
- Tempo médio da validação pré-geração < 5s para uma importação típica (≤ 6 secretarias, ≤ 3 atas).

Confirma para eu começar pelos parsers do worker + fixtures?
