
-- 1) Revoga acesso direto às colunas de CPF para usuários autenticados/anon
REVOKE SELECT (m2a_gestor_cpf, m2a_fiscal_cpf) ON public.secretarias FROM authenticated;
REVOKE SELECT (m2a_gestor_cpf, m2a_fiscal_cpf) ON public.secretarias FROM anon;

-- 2) Função segura que devolve CPFs apenas para admin/gestor
CREATE OR REPLACE FUNCTION public.get_secretarias_cpfs()
RETURNS TABLE(id uuid, m2a_gestor_cpf text, m2a_fiscal_cpf text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores e gestores podem consultar CPFs.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.m2a_gestor_cpf, s.m2a_fiscal_cpf
    FROM public.secretarias s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs() TO authenticated;
