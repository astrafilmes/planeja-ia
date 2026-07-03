// Normalização de texto seguindo a regra original Python.
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim().toUpperCase();
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function safeFileName(value: string): string {
  let name = normalizeText(value).replace(/\s+/g, "_");
  // Supabase Storage aceita apenas um subconjunto ASCII em keys.
  // Removemos qualquer coisa fora de [A-Z0-9._-] para evitar
  // "Invalid key" (ex.: `·`, parênteses, acentos residuais).
  name = name.replace(/[^A-Z0-9._-]+/g, "_");
  name = name.replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "");
  return name || "ARQUIVO";
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function normalizeContratoBase(value: unknown): string {
  const raw = normalizeText(value);
  const match = raw.match(/\d{1,4}\s*\/\s*\d{4}/);
  if (match) return match[0].replace(/\s+/g, "");
  return raw.replace(/[^0-9/]/g, "");
}
