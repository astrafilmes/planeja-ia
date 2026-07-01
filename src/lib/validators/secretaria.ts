import { z } from "zod";

/**
 * Schema Zod para a tabela `secretarias` (colunas expostas ao client).
 *
 * Alinhado 1:1 com o `select` de `useSecretariasQuery`. Serve como
 * contrato executável em runtime: quando o banco muda uma coluna,
 * `parseSupabaseList` loga e a UI degrada com graça em vez de renderizar
 * `undefined` em cascata.
 */
export const SecretariaRowSchema = z.object({
  id: z.string().uuid(),
  numero: z.number(),
  sigla: z.string(),
  nome: z.string(),
  ativa: z.boolean(),
  m2a_orgao_id: z.string().nullable().optional(),
  m2a_dot_orgao_id: z.string().nullable().optional(),
  m2a_uo_id: z.string().nullable().optional(),
  m2a_dot_id: z.string().nullable().optional(),
  m2a_dotacao_default: z.string().nullable().optional(),
  m2a_ref_coluna: z.number().nullable().optional(),
  m2a_fiscal_codigo: z.string().nullable().optional(),
  m2a_fiscal_nome: z.string().nullable().optional(),
  m2a_gestor_codigo: z.string().nullable().optional(),
  m2a_gestor_nome: z.string().nullable().optional(),
});

/**
 * Retorno da RPC `get_secretarias_cpfs`. Isolada porque é acessada por um
 * subset de roles (admin/gestor) — a lista pode chegar vazia sem ser erro.
 */
export const SecretariaCpfRowSchema = z.object({
  id: z.string().uuid(),
  m2a_gestor_cpf: z.string().nullable(),
  m2a_fiscal_cpf: z.string().nullable(),
});

export type SecretariaRow = z.infer<typeof SecretariaRowSchema>;
export type SecretariaCpfRow = z.infer<typeof SecretariaCpfRowSchema>;
