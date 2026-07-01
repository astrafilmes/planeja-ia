import { normalizeContratoBase, pad2 } from "@/lib/utils/normalize";

function cleanNumber(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z/]/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseContratoSequencia(
  numeroContrato: unknown,
  numeroBase: string,
  sigla: string,
) {
  const base = normalizeContratoBase(numeroBase);
  const siglaNorm = cleanNumber(sigla).replace(/[^A-Z0-9]/g, "");
  if (!base || !siglaNorm) return null;

  const pattern = new RegExp(
    `^${escapeRegex(base)}${escapeRegex(siglaNorm)}0*(\\d+)$`,
  );
  const match = cleanNumber(numeroContrato).match(pattern);
  return match ? Number(match[1]) : null;
}

export async function getNextContratoNumbers(
  supabase: any,
  params: {
    numeroBase: string;
    secretariaSigla: string;
    quantidade: number;
  },
) {
  const numeroBase = normalizeContratoBase(params.numeroBase);
  const sigla = cleanNumber(params.secretariaSigla).replace(/[^A-Z0-9]/g, "");
  const quantidade = params.quantidade;

  if (!numeroBase) throw new Error("Número base inválido.");
  if (!sigla) throw new Error("Sigla da secretaria inválida.");
  if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");

  const [localResult, snapshotResult] = await Promise.all([
    supabase
      .from("contratos")
      .select("numero_contrato")
      .ilike("numero_contrato", `${numeroBase}%`)
      .is("deleted_at", null),
    supabase
      .from("m2a_contratos_snapshot")
      .select("numero_contrato, secretaria_sigla, ano, sequencia")
      .ilike("numero_contrato", `${numeroBase}%`),
  ]);

  if (localResult.error) throw localResult.error;
  if (snapshotResult.error) throw snapshotResult.error;

  const localMax = Math.max(
    0,
    ...(localResult.data ?? [])
      .map((row: any) =>
        parseContratoSequencia(row.numero_contrato, numeroBase, sigla),
      )
      .filter((value: number | null): value is number =>
        Number.isFinite(value),
      ),
  );

  const snapshotMax = Math.max(
    0,
    ...(snapshotResult.data ?? [])
      .filter((row: any) => {
        const rowSigla = cleanNumber(row.secretaria_sigla).replace(
          /[^A-Z0-9]/g,
          "",
        );
        return !rowSigla || rowSigla === sigla;
      })
      .map((row: any) => {
        const parsed = parseContratoSequencia(
          row.numero_contrato,
          numeroBase,
          sigla,
        );
        return Number(row.sequencia ?? parsed);
      })
      .filter((value: number): value is number => Number.isFinite(value)),
  );

  const start = Math.max(localMax, snapshotMax) + 1;
  return Array.from({ length: quantidade }, (_, index) => ({
    sequencia: start + index,
    numeroContrato: `${numeroBase}${sigla}${pad2(start + index)}`,
  }));
}
