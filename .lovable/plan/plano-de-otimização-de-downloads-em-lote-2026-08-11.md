# Plano de Otimização de Downloads em Lote

Melhoria da estabilidade e performance do download de documentos em massa via VPS Worker.

## Mudanças Propostas

### Backend (VPS Worker)
- **Streaming de ZIP (Keep-Alive):** Alterar `/documentos/baixar` para realizar streaming direto do ZIP enquanto baixa do portal M2A, evitando acúmulo em memória.
- **Heartbeat SSE:** Adicionar um evento de `ping` a cada 15 segundos no endpoint `/documentos/baixar/stream` para manter a conexão viva durante processos longos.
- **Resiliência no Parser:** Melhorar a detecção de PDFs que retornam vazios ou páginas de erro, garantindo que o ZIP não seja corrompido.

### Frontend
- **Ajuste de Lote:** Reduzir o tamanho padrão do lote de 100 para **50** arquivos em `useDownloadDocumentos.ts` (equilíbrio entre estabilidade e performance).
- **Timeout Estendido:** Aumentar a tolerância de espera para a resposta inicial do worker.
- **Keep-Alive Listener:** Ignorar eventos de `ping` no frontend, mas usá-los para resetar timers de timeout se necessário.

## Detalhes Técnicos

- **Arquivos:**
    - `vps-worker/src/routes/documentos.js`: Implementação de streaming e heartbeat.
    - `src/features/processo-detalhe/hooks/useDownloadDocumentos.ts`: Redução de `BATCH_SIZE` e logs de depuração.
    - `src/lib/m2a/index.ts`: Ajuste no client de download para suportar fluxos mais longos.

## Checklist de Validação
- [ ] Testar download de um lote de 50 arquivos.
- [ ] Verificar se o ZIP é baixado progressivamente (streaming).
- [ ] Validar se o erro `Failed to fetch` desaparece em conexões lentas.
