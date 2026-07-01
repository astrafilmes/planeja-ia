import { z } from "zod";

/**
 * Schema Zod para as linhas de `irp_jobs` renderizadas na listagem do
 * histórico de importações. Reflete o `select` de `useIrpJobsList`.
 *
 * Campos numéricos vêm nullable porque o processamento pode estar em curso.
 */
export const IrpJobListItemSchema = z.object({
  id: z.string().uuid(),
  original_filename: z.string().nullable(),
  status: z.string().nullable(),
  total_secretarias: z.number().nullable(),
  secretarias_com_itens: z.number().nullable(),
  total_linhas: z.number().nullable(),
  total_valor: z.number().nullable(),
  created_at: z.string().nullable(),
});

export type IrpJobListItem = z.infer<typeof IrpJobListItemSchema>;
