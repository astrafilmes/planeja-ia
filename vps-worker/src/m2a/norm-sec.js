// FONTE CANÔNICA de normalização de nomes de secretaria.
// Deve ser mantida byte-a-byte igual a src/lib/m2a/normSec.ts (front).
// Qualquer divergência quebra o lookup de saldo (silenciosamente).
//
// Regra:
//   1. Trim + toUpperCase
//   2. NFD + remove diacríticos
//   3. Substitui QUALQUER caractere fora de [A-Z0-9\s] por espaço (remove pontuação)
//   4. Colapsa espaços múltiplos
//
// Exemplo:
//   "05 - SEC. DE SAÚDE (2025)"  →  "05 SEC DE SAUDE 2025"
//   "SEC. DE SAÚDE"              →  "SEC DE SAUDE"

export function normSec(txt) {
  return String(txt ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
