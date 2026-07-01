DROP POLICY IF EXISTS fp_select ON public.fornecedores_prepostos;
CREATE POLICY fp_select ON public.fornecedores_prepostos
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'operador'::public.app_role)
);