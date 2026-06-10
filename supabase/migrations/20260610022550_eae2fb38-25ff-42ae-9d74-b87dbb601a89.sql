
-- ============== 1. contrato_atores: restrict sensitive reads/inserts ==============
DROP POLICY IF EXISTS ca_select ON public.contrato_atores;
DROP POLICY IF EXISTS ca_insert ON public.contrato_atores;
CREATE POLICY ca_select ON public.contrato_atores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY ca_insert ON public.contrato_atores FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 2. m2a_servidores: restrict reads ==============
DROP POLICY IF EXISTS m2a_servidores_select ON public.m2a_servidores;
CREATE POLICY m2a_servidores_select ON public.m2a_servidores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 3. secretarias: restrict reads (contains CPFs) ==============
DROP POLICY IF EXISTS sec_select_auth ON public.secretarias;
CREATE POLICY sec_select_auth ON public.secretarias FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 4. audit_logs: only service_role can insert ==============
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO service_role WITH CHECK (true);

-- ============== 5. numeracao: split ALL policy, restrict mutations ==============
DROP POLICY IF EXISTS num_update ON public.numeracao;
CREATE POLICY num_insert ON public.numeracao FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY num_update ON public.numeracao FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY num_delete ON public.numeracao FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============== 6. contrato_import_dotacoes ==============
DROP POLICY IF EXISTS ciddot_insert ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_update ON public.contrato_import_dotacoes;
CREATE POLICY ciddot_insert ON public.contrato_import_dotacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY ciddot_update ON public.contrato_import_dotacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 7. irp_jobs / irp_job_secretarias ==============
DROP POLICY IF EXISTS irpj_insert ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_update ON public.irp_jobs;
CREATE POLICY irpj_insert ON public.irp_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY irpj_update ON public.irp_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

DROP POLICY IF EXISTS irpjs_insert ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_update ON public.irp_job_secretarias;
CREATE POLICY irpjs_insert ON public.irp_job_secretarias FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY irpjs_update ON public.irp_job_secretarias FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 8. m2a_atas / m2a_itens ==============
DROP POLICY IF EXISTS ma_insert ON public.m2a_atas;
DROP POLICY IF EXISTS ma_update ON public.m2a_atas;
CREATE POLICY ma_insert ON public.m2a_atas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY ma_update ON public.m2a_atas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

DROP POLICY IF EXISTS mi_insert ON public.m2a_itens;
DROP POLICY IF EXISTS mi_update ON public.m2a_itens;
CREATE POLICY mi_insert ON public.m2a_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY mi_update ON public.m2a_itens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 9. m2a_contratos_snapshot ==============
DROP POLICY IF EXISTS mcs_insert ON public.m2a_contratos_snapshot;
DROP POLICY IF EXISTS mcs_update ON public.m2a_contratos_snapshot;
CREATE POLICY mcs_insert ON public.m2a_contratos_snapshot FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY mcs_update ON public.m2a_contratos_snapshot FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- ============== 10. storage.objects: ownership check on irp-files ==============
DROP POLICY IF EXISTS irp_files_auth_select ON storage.objects;
DROP POLICY IF EXISTS irp_files_auth_update ON storage.objects;
DROP POLICY IF EXISTS irp_files_auth_delete ON storage.objects;
DROP POLICY IF EXISTS irp_files_auth_insert ON storage.objects;

CREATE POLICY irp_files_auth_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'irp-files' AND owner = auth.uid());

CREATE POLICY irp_files_auth_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'irp-files'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'gestor')
      OR EXISTS (SELECT 1 FROM public.app_files af WHERE af.bucket = 'irp-files' AND af.storage_path = storage.objects.name AND af.created_by = auth.uid())
    )
  );

CREATE POLICY irp_files_auth_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'irp-files'
    AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  );

CREATE POLICY irp_files_auth_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'irp-files'
    AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  );

-- ============== 11. Fix function search_path & revoke definer execute from anon ==============
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
ALTER FUNCTION public.get_contract_report_data(uuid) SET search_path = public;
ALTER FUNCTION public.get_multiple_contracts_report_data(uuid[]) SET search_path = public;
ALTER FUNCTION public.get_pauta_consolidada_data(uuid) SET search_path = public;

-- Revoke EXECUTE from anon on all SECURITY DEFINER functions (they remain callable by RLS internally)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM anon;
