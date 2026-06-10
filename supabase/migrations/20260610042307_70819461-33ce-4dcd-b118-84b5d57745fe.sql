DROP POLICY IF EXISTS mcs_select ON public.m2a_contratos_snapshot;
CREATE POLICY mcs_select ON public.m2a_contratos_snapshot
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );

DROP POLICY IF EXISTS log_select ON public.m2a_envio_logs;
CREATE POLICY log_select ON public.m2a_envio_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );