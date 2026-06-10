
-- app_files
DROP POLICY IF EXISTS files_insert ON public.app_files;
CREATE POLICY files_insert ON public.app_files FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador')));

-- audit_logs (service_role only; replace with check expression non-trivial)
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO service_role
  WITH CHECK (auth.role() = 'service_role');

-- contrato_documentos
DROP POLICY IF EXISTS cd_insert ON public.contrato_documentos;
CREATE POLICY cd_insert ON public.contrato_documentos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- contrato_import_itens
DROP POLICY IF EXISTS cii_insert ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_update ON public.contrato_import_itens;
CREATE POLICY cii_insert ON public.contrato_import_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY cii_update ON public.contrato_import_itens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- contrato_import_jobs
DROP POLICY IF EXISTS cij_insert ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_update ON public.contrato_import_jobs;
CREATE POLICY cij_insert ON public.contrato_import_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY cij_update ON public.contrato_import_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- contrato_item_dotacoes
DROP POLICY IF EXISTS cid2_insert ON public.contrato_item_dotacoes;
CREATE POLICY cid2_insert ON public.contrato_item_dotacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));

-- m2a_envio_logs
DROP POLICY IF EXISTS log_insert ON public.m2a_envio_logs;
CREATE POLICY log_insert ON public.m2a_envio_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'operador'));
