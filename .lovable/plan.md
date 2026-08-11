# Plano: Consolidação de Downloads em Arquivo Único (ZIP)

O objetivo é aumentar o lote para 50 arquivos e, em vez de baixar vários ZIPs separados, consolidar todos eles em um único arquivo ZIP final no navegador do usuário. Isso resolve o problema de "travamento" (timeout) no servidor ao processar volumes gigantes, mantendo a conveniência de um único download.

## Mudanças Técnicas

1.  **Frontend (Dependencies)**: Instalar `jszip` para permitir a manipulação e criação de ZIPs diretamente no navegador.
2.  **Hook `useDownloadDocumentos.ts`**:
    *   Atualizar `BATCH_SIZE` para 50.
    *   Em vez de disparar downloads diretos por lote, coletar os blobs de cada lote.
    *   Usar o `JSZip` para extrair os conteúdos dos ZIPs parciais vindos do worker e reinseri-los em um ZIP mestre.
    *   Disparar o download do ZIP consolidado apenas ao final de todos os lotes.
3.  **Resiliência**: Se um lote falhar completamente, o sistema deve informar e permitir baixar o que foi obtido até o momento ou tentar novamente.

## Checklist de Segurança e Performance
*   **Memória**: Para volumes extremos (ex: >2GB), o navegador pode ter limites de memória para o Blob final. Adicionaremos uma verificação básica.
*   **Identidade**: O nome dos arquivos dentro do ZIP consolidado será mantido conforme gerado pelo worker para evitar colisões.

---
**Pergunta**: Você concorda com a abordagem de usar o navegador para "costurar" os lotes em um único arquivo, ou prefere manter a separação caso o volume seja realmente massivo (ex: milhares de arquivos)?
