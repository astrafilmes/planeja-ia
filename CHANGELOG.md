# Changelog - Planejamento Sistema + M2A Extensão

Todas as mudanças importantes neste projeto são documentadas neste arquivo.

## [1.8.17] - 2026-06-02

### Changed

- Front-end passa a usar `M2AConnectionProvider` com ping contínuo, indicador global de conexão e bloqueio dos envios quando a ponte da extensão não responde.
- Envio individual e envio em lote agora compartilham o mesmo builder de payload M2A e salvam preferências por usuário/unidade gestora.
- Página de detalhes do processo foi reorganizada com header fixo e tabs para visão geral, itens, contratos e documentos.
- Processos e contratos passam a usar soft delete via `deleted_at`; listagens e busca global filtram registros excluídos.
- Pós-importação redireciona para o processo administrativo criado ou reaproveitado após a geração dos contratos.

## [1.8.16] - 2026-06-01

### Changed

- Motor M2A `1.7.9`: documentos gerados passam a ter metadados extraídos e enviados ao app, sem download imediato na automação.
- As datas dos dois primeiros documentos gerados agora usam o dia útil anterior à data do contrato; os demais mantêm a data original.
- Adicionado armazenamento `m2a_documentos_gerados` em `contratos` e ação global "Baixar Documentos" na listagem para download em lote via extensão.

## [1.8.15] - 2026-06-01

### Changed

- Motor M2A `1.7.8`: comparação do número do contrato agora ignora pontuação e acentos, evitando recriação quando a M2A exibe o número com barras ou separadores diferentes.
- CSRF do `automation_engine` agora também é reaproveitado em nível de sessão quando já apareceu em qualquer resposta do portal, reduzindo GETs usados apenas para capturar token.

## [1.8.14] - 2026-06-01

### Changed

- Motor M2A `1.7.7`: pausas fixas entre etapas foram reduzidas e centralizadas em constantes, diminuindo o tempo total de geração sem alterar a sequência segura de criação, itens, dotação e documentos.

## [1.8.13] - 2026-06-01

### Changed

- Sincronização de processo M2A otimizada: itens e contratos de cada Ata agora são buscados em paralelo controlado, reduzindo tempo total sem aumentar a pressão desordenada no portal.
- Logs do scraper foram enxugados: detalhes linha a linha de fornecedor/item foram movidos para modo debug, mantendo apenas resumo por Ata e tabelas essenciais.

## [1.8.12] - 2026-06-01

### Changed

- Reduzidas requisições repetidas no `automation_engine`: CSRF agora é reaproveitado em cache curto por URL e as quantidades de itens usam um único token por contrato.
- Busca inicial de contrato existente passou a consultar primeiro apenas a tabela canônica da Ata; a busca profunda fica reservada para fallback após criação sem ID direto.
- Vínculo de preposto agora falha com erro explícito quando o payload não traz preposto real ou quando o autocomplete da M2A não encontra a pessoa, evitando falso positivo no console.

## [1.8.11] - 2026-06-01

### Fixed

- Fluxo de importação agora exige e persiste preposto por fornecedor, em vez de usar o nome da empresa como fallback no campo `preposto`.
- Criação do cadastro `fornecedores_prepostos` com persistência reutilizável para futuras importações da mesma empresa.
- Nova tela `/fornecedores` adicionada em `CADASTROS`, permitindo manutenção manual de fornecedor, CNPJ e preposto padrão.

## [1.8.10] - 2026-06-01

### Fixed

- Corrigida a base M2A da Secretaria de Esporte, Juventude e Lazer: Unidade Gestora volta para `7771` e o Órgão da Dotação fica em `10026`.
- A migração preserva o vínculo existente do catálogo de Unidade Gestora e evita que o código de dotação seja usado no campo de criação do contrato.

## [1.8.9] - 2026-06-01

### Fixed

- Separado o ID da Unidade Gestora M2A (`m2a_orgao_id`) do ID de Órgão usado na dotação (`m2a_dot_orgao_id`).
- O payload de dotação agora envia `dadosDotacao.orgao` a partir de `m2a_dot_orgao_id`, mantendo `dadosM2A.unidade_gestora` com o ID correto da Unidade Gestora.
- Cadastro de secretarias passou a validar e exibir o novo campo "Órgão da Dotação" para evitar mistura entre códigos 7771/7774 e códigos 10026/10029.

## [1.8.8] - 2026-06-01

### Fixed

- O payload M2A do processo agora recupera `numero_item` real via `m2a_itens` quando `contrato_itens.numero_item` está vazio, usando `m2a_item_id` como chave.
- A geração de contratos por importação passa a salvar `numero_item` da M2A quando a planilha não traz esse número.
- A alteração manual de ata/item na tela de importação também grava `numero_item` real do item M2A selecionado.

## [1.8.7] - 2026-06-01

### Fixed

- `automation_engine` v1.7.4 agora casa itens disponíveis por similaridade de descrição quando o payload chega sem `numero_item`.
- Removida a consulta antecipada a `/contratos/itens/tabela/{contratoId}` durante a inclusão; essa tabela só é usada depois da inclusão para mapear os novos IDs internos e atualizar quantidades.
- Similaridade validada com exemplos reais do contrato GS3: bola, kit, medalhas, equipagem e troféus.

## [1.8.6] - 2026-06-01

### Fixed

- `automation_engine` v1.7.3 agora decodifica respostas HTML escapadas/JSON antes do `DOMParser`, permitindo ler linhas como `class=\"tr_unidade_participante_item_contrato\"`.
- Busca de itens disponíveis do contrato alterada para `/contratos/ata_registro_preco_contrato/tabela/{contratoId}/?page_size=1000`.
- Adicionado diagnóstico explícito no console com `numero`, `codigo` e `descricao` de cada item encontrado antes da inclusão.

## [1.8.5] - 2026-06-01

### 🔧 Fixed

- Correção do envio de itens para contratos M2A quando a planilha estava gerando fallback sequencial (`1..N`):
  - remoção do fallback `idx + 1` na persistência de `numero_item` em `contrato_itens`.
  - parser da planilha ampliado para reconhecer cabeçalhos de número de item (`N`, `Nº`, `N°`, `N ITEM`, `NUMERO ...`).
- `processos.$id` agora envia metadados adicionais de item no payload M2A (`descricao`, `m2a_item_id`) e não usa mais `ordem_item` como número falso.
- `automation_engine` (v1.7.2) passou a fazer match de itens por estratégia híbrida:
  - tenta `ataItemId` quando disponível,
  - usa número quando a numeração do payload é confiável,
  - faz fallback por descrição normalizada quando a sequência numérica parece inválida.
- Mensagens de diagnóstico de itens melhoradas no console para facilitar auditoria de match.

## [1.8.4] - 2026-06-01

### 🔧 Fixed

- Corrigida a descoberta dos itens por ata no `processo_scraper`:
  - endpoint de subtabela agora prioriza `id_licitacao_ata_contrato` (ex: `25520`) em vez de `id_ata` (ex: `4835`).
  - quando disponível, usa `detail_url` da linha da ata.
- Extração de `detail_url` ficou resiliente com fallback por regex no `outerHTML` da linha.
- Parser de payload HTML ficou mais robusto para respostas escapadas (`\"`, `\n`, `\uXXXX`) antes do `DOMParser`.
- Mantida normalização de URL sem barra final antes de query (`.../subtabela/{id}?page_size=1000`).

## [1.8.3] - 2026-06-01

### 🔧 Changed

- Scraper da M2A agora normaliza payload AJAX escapado (`\"`, `\n`) antes do `DOMParser`, permitindo ler as linhas da subtabela de itens corretamente.
- Correção das URLs de itens para remover barra antes da query string no fallback:
  - de `/ata_registro_precos/itens/tabela/{ataId}/?page_size=1000`
  - para `/ata_registro_precos/itens/tabela/{ataId}?page_size=1000`
- Sanitização extra de texto para impedir fornecedor salvo como `\n \n`.

## [1.8.2] - 2026-06-01

### 🔧 Changed

- Bump de versão da extensão no `manifest.json` para sincronizar distribuição e cache do Chrome.

## [1.8.1] - 2026-06-01

### 🔧 Changed (Correções e Melhorias)

#### M2A Extensão - processo_scraper.js

- **Validação de Descrição**: Adicionada função `looksLikeValidDescription()` que valida:
  - Mínimo 5 caracteres
  - Mínimo 40% de letras (rejeita puro números/símbolos como CNPJ, quantidades)
  - Suporte a caracteres portugueses (á, é, í, ó, ú, ã, õ, etc)
  - Evita falsos positivos como "15,0" (quantidade) ou "345.678/0001-99" (CNPJ)

- **Seletores CSS Refinados**:
  - Removido `tbody tr` (seletor muito amplo pegava dados de outras tabelas)
  - Mantém apenas seletores específicos: `tr.tr_ata_registro_preco_item`, `tr.tr_licitacao_ata_contrato_item`, `tr.kt-datatable__row`
  - Adicionada validação mínima: linhas devem ter pelo menos 4 colunas

- **URL Prioritária para Itens**:
  - `/licitacao_ata_contrato_item/subtabela/{ataId}?page_size=1000` agora é primeira tentativa (era fallback)
  - Razão: URL onde os itens realmente estão localizados no portal M2A

- **Text Extraction**:
  - Trata explicitamente `\n` e `\r` antes de normalizar espaços
  - Elimina newlines em nomes de fornecedores

#### Testes

- Adicionado `test-m2a-extraction.js` com JSDOM para validação de lógica de parsing
- Validação: 2/2 itens válidos extraídos, 2/2 falsos positivos rejeitados ✓

#### Build & Lint

- 0 erros, 7 warnings não-críticos (padrões React)
- Build em 892ms

### ✅ Testing

- Testes lógicos: PASSED ✓
- Validação de falsas descrições: PASSED ✓
- Seletor refinement: PASSED ✓
- Integração M2A: PENDING (aguardando teste em portal real)

---

## [1.7.3] - 2026-05-31

### 🔧 Changed (Versão Anterior)

- Melhorias iniciais de extração de itens
- Date consolidation removida do import flow
- Auto-select de fiscal da secretaria padrão
