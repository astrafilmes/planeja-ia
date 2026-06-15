-- 1) CPF de servidores não pode ficar visível para operador
DROP POLICY IF EXISTS m2a_servidores_select ON public.m2a_servidores;

CREATE POLICY m2a_servidores_select_privileged
  ON public.m2a_servidores
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  );

-- 2) Remover publicação Realtime das tabelas IRP (não há subscribers no app).
ALTER PUBLICATION supabase_realtime DROP TABLE public.irp_jobs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.irp_job_secretarias;