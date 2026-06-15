// Mapa de natureza de despesa (string do .xlsx) → ID da M2A.
// Atualize aqui ao incluir novas naturezas.
//
// Códigos mais usados (Aracaju – exemplo):
//   33903000  → 1858  (Material de Consumo)
//   33903900  → 1802  (Serviço)
//   44905200  → 1978  (Material Permanente)
//   44905100  → 1940  (Obra)

const MAPA = {
  "33903000": "1858",
  "33903900": "1802",
  "44905200": "1978",
  "44905100": "1940",
};

function limpar(natureza) {
  return String(natureza ?? "").replace(/[^0-9]/g, "");
}

export function resolverNaturezaId(naturezaRaw) {
  const limpa = limpar(naturezaRaw);
  if (!limpa) return null;
  if (MAPA[limpa]) return MAPA[limpa];
  // tenta encurtar para os 8 dígitos finais (caso venha com prefixo)
  const tail = limpa.slice(-8);
  return MAPA[tail] ?? null;
}

export function isNaturezaServico(naturezaRaw) {
  return limpar(naturezaRaw).endsWith("3900");
}
