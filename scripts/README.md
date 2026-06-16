# Scripts auxiliares

Utilitários Node executados manualmente. Não fazem parte do build.

## Pauta consolidada

- `pauta-column-reference.cjs` — referência de colunas/cabeçalhos usados pelo
  exportador da pauta consolidada.
- `test-pauta-export.ts` — harness TypeScript. Roda via:
  ```bash
  npm run test:pauta
  ```
- `test-pauta-node.cjs` — versão Node puro do mesmo harness:
  ```bash
  node scripts/test-pauta-node.cjs
  ```

Veja `PAUTA_CONSOLIDADA_IMPLEMENTATION.md` na raiz para o desenho do recurso.
