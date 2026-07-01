import { z, type ZodTypeAny } from "zod";

/**
 * Utilitário compartilhado para validar em runtime listas devolvidas pelo
 * Supabase (queries `.select()` e RPCs que retornam arrays).
 *
 * Motivação (Fase 4.5 — SRE/SecOps):
 *   Nossos hooks faziam `as Type[]` cegos sobre `data`. Se o schema no banco
 *   mudar (coluna renomeada, tipo alterado, RPC quebrada), o app quebra em
 *   pontos distantes do fetch, com stack traces obscuros dentro de componentes.
 *   Validar na borda do fetch:
 *     1. Falha rápido, com erro nomeado, no ponto exato onde a divergência
 *        entra na aplicação.
 *     2. Descarta linhas inválidas em vez de propagar `undefined` para a UI.
 *     3. Documenta o contrato esperado ao lado do hook.
 *
 * Estratégia: item-a-item (safeParse por linha). Uma linha corrompida
 * não derruba a lista inteira — é apenas ignorada e logada. Ideal para
 * evolução incremental do schema sem downtime.
 */
export function parseSupabaseList<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
  context: string,
): Array<z.infer<T>> {
  if (data == null) return [];
  if (!Array.isArray(data)) {
    console.error(
      `[validators] ${context}: esperava array, recebeu ${typeof data}`,
      data,
    );
    return [];
  }

  const out: Array<z.infer<T>> = [];
  for (let i = 0; i < data.length; i++) {
    const parsed = schema.safeParse(data[i]);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      // Loga uma vez por linha divergente — permite descobrir drift de schema
      // sem quebrar a UI. Um observability sink futuro (Sentry) pode capturar.
      console.warn(
        `[validators] ${context}: linha ${i} inválida — ignorada`,
        parsed.error.flatten(),
      );
    }
  }
  return out;
}
