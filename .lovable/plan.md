# Objetivo

Hoje, no fluxo de importação de planilha IRP, cada **secretaria participante** entra no payload M2A pela sua *unidade orçamentária* (`m2a_uo_id`). Quando duas colunas da planilha pertencem à mesma UO — por exemplo `FF` (Fundeb Fundamental) e `FI` (Fundeb Infantil), ambas mapeadas para a UO "FUNDEB" — o agregador colapsa as duas em **um único participante** e soma as quantidades. Resultado: só sai **1 DFD** onde deveriam sair **2 (ou 3, contando a SEC EDU)**.

No fluxo de importação de contratos (registro de preços), isso já funciona certo, porque o parser trabalha por **coluna de dotação** (`ParsedDotacao` guarda `secretariaSigla + dotacao + refColuna`), e cada coluna vira uma entrada independente. Queremos aplicar exatamente essa lógica no fluxo IRP → M2A (processo comum e SRP), sem quebrar o que já funciona.

Além disso, colocar antes do envio uma pergunta explícita "**é registro de preços?**" logo abaixo do input do arquivo, para que a decisão fique clara e visível antes da análise.

# O que muda

## 1. Payload IRP passa a ser por coluna, não por UO

Arquivo: `src/features/irp/hooks/useEnviarProcessoM2A.ts` (função `buildM2AIrpPayload`).

- Trocar a **chave de participante** de `uo:<uoId>` para `col:<refColuna>` (fallback `row.key` quando não houver `ref_coluna`). Cada linha selecionada em `selectedImportRows` já corresponde a uma coluna distinta da planilha, então cada uma vira um participante próprio, mesmo compartilhando `m2a_uo_id`.
- `secretariasParticipantes` deixa de ser deduplicado por UO — cada linha vira um item, com seu próprio `ref_coluna`, `nome` (usar `cabecalhoColuna` para diferenciar visualmente FF vs FI vs SEC EDU) e o mesmo par `m2a_orgao_id / m2a_uo_id` quando de fato compartilhado.
- `agg.quantidades[chave]` passa a somar por coluna, garantindo uma coluna de quantidade separada por DFD.
- `gerenciadora_chave` segue a mesma regra (`col:<refColuna>`).

## 2. Suporte no VPS/worker para múltiplos DFDs sob a mesma UO

Arquivos: `vps-worker/src/m2a/orquestrador-processo-comum.js`, `orquestrador-processo-srp.js`, `processo-comum.js`, `processo-srp.js`.

- Onde hoje o worker itera `secretariasParticipantes` presumindo uma DFD por UO, passar a iterar por participante (por chave `col:*`) e criar **um DFD por chave**, cada um com sua própria dotação/quantidades — igual ao contrato SRP faz por dotação hoje.
- Mapear corretamente `m2a_uo_id` repetido: o M2A aceita várias DFDs para a mesma UO, o que muda é o conjunto de itens/quantidades e a natureza.

## 3. Pergunta "é registro de preços?" no upload

Arquivo: `src/features/irp/components/*` (card de upload) e o hook `useIrpUploadAnalise`.

- Adicionar um toggle/segmented control logo **abaixo do input do arquivo**: `Registro de preços` × `Processo comum (sem registro)`.
- Persistir a escolha em `processoM2AForm.e_registro_preco` desde o início do fluxo (hoje ela só aparece no modal de confirmação).
- Usar essa flag para:
  - Ajustar o texto do botão ("Analisar planilha (SRP)" / "Analisar planilha (comum)").
  - Pré-selecionar a modalidade no modal `IrpConfirmacaoProcessoModal`.
  - No envio, escolher entre `criarProcessoSrpM2A` e `criarProcessoComumM2A` sem o usuário precisar reconfirmar.

## 4. UI da revisão de secretarias

Arquivo: `src/features/irp/hooks/useIrpImportRows.ts` e a tabela de revisão.

- Já retornamos uma linha por coluna (`importableRows`), então a lista visual continua correta.
- Adicionar coluna "Dotação/Rótulo" mostrando `cabecalhoColuna` (ex.: `FUNDEB / FF`) para deixar claro que FF e FI vão gerar DFDs separados apesar de compartilharem a UO FUNDEB.
- No autofill de `unidade_orcamentaria` continuar pegando a primeira linha válida — sem mudanças.

# Detalhes técnicos

## Estrutura do payload novo (comum e SRP)

```text
payload.secretariasParticipantes = [
  { chave: "col:27", nome: "SEC EDU",  m2a_uo_id: "1234", ref_coluna: 27, ... },
  { chave: "col:28", nome: "FUNDEB/FF", m2a_uo_id: "5678", ref_coluna: 28, ... },
  { chave: "col:29", nome: "FUNDEB/FI", m2a_uo_id: "5678", ref_coluna: 29, ... },
]

payload.itens[i].quantidades = {
  "col:27": 100,
  "col:28":  40,
  "col:29":  60,
}
```

O worker itera por chave e cria uma DFD por participante, mesmo quando `m2a_uo_id` se repete.

## Compatibilidade retroativa

- Snapshots antigos usam `uo:<uoId>` como chave. Como o payload é montado no momento do envio a partir de `selectedImportRows` (banco/parse), não há migração necessária.
- Jobs IRP já persistidos continuam válidos; a mudança afeta apenas envios futuros ao M2A.

## Arquivos afetados

- `src/features/irp/hooks/useEnviarProcessoM2A.ts` — nova chave por coluna.
- `src/features/irp/hooks/useIrpUploadAnalise.ts` — receber/persistir `e_registro_preco` desde o upload.
- `src/features/irp/components/` (card de upload + tabela de revisão) — toggle SRP/Comum e coluna "Rótulo".
- `src/features/irp/lib.ts` — tipos `M2ASrpPayload` / `M2AComumPayload` (ref_coluna já existe; documentar `chave` novo).
- `vps-worker/src/m2a/orquestrador-processo-comum.js` e `orquestrador-processo-srp.js` — DFD por chave em vez de por UO.
- `vps-worker/src/m2a/processo-comum.js` e `processo-srp.js` — se houver dedupe interno por UO, remover.

# Como validar

1. Rodar a planilha `AQUISIÇÃO_DE_LIVROS_DIDÁTICOS_-_REGISTRO_2026.xlsx` (que tem SEC EDU + FF + FI) marcando "Registro de preços" → esperar 3 participantes distintos no preview e 3 DFDs criadas no M2A.
2. Rodar a mesma planilha marcando "Processo comum" → mesmos 3 DFDs, agora pelo endpoint comum.
3. Rodar um caso simples (uma única coluna por secretaria, ex.: `ADESÃO_MATERIAIS_DE_CONSTRUÇÃO.xlsx`) → deve continuar gerando 1 DFD por secretaria, sem regressão.
4. Conferir no console `[m2a-import]` que `secretariasParticipantes.length === selectedImportRows.length` e que `quantidades` tem uma chave por coluna.

Se estiver de acordo, aprove que eu implemento na sequência (front + worker) e faço os testes.
