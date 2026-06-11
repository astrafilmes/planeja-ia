
-- 1) Restrict anon EXECUTE on SECURITY DEFINER functions that should not be callable without auth
REVOKE EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_trusted_device(text) FROM anon, PUBLIC;
-- consume_trusted_device é chamada pela edge function trusted-device com service_role
GRANT EXECUTE ON FUNCTION public.consume_trusted_device(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) TO authenticated, service_role;

-- 2) Bloquear leitura direta das colunas de CPF da tabela secretarias
--    para qualquer usuário autenticado (operador/consulta inclusos).
--    Admin/gestor continuam acessando via RPC get_secretarias_cpfs (já protegida por has_role).
REVOKE SELECT (m2a_gestor_cpf, m2a_fiscal_cpf) ON public.secretarias FROM authenticated, anon, PUBLIC;
-- service_role mantém acesso total para operações administrativas e edge functions
GRANT SELECT (m2a_gestor_cpf, m2a_fiscal_cpf) ON public.secretarias TO service_role;
