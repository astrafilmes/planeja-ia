
-- contrato_atores
DROP POLICY IF EXISTS ca_all ON public.contrato_atores;
CREATE POLICY ca_select ON public.contrato_atores FOR SELECT TO authenticated USING (true);
CREATE POLICY ca_insert ON public.contrato_atores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ca_update ON public.contrato_atores FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY ca_delete ON public.contrato_atores FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- contrato_documentos
DROP POLICY IF EXISTS cd_all ON public.contrato_documentos;
CREATE POLICY cd_select ON public.contrato_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_insert ON public.contrato_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cd_update ON public.contrato_documentos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cd_delete ON public.contrato_documentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- contrato_item_dotacoes (tem cid_all)
DROP POLICY IF EXISTS cid_all ON public.contrato_item_dotacoes;
CREATE POLICY cid2_select ON public.contrato_item_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY cid2_insert ON public.contrato_item_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cid2_update ON public.contrato_item_dotacoes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cid2_delete ON public.contrato_item_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- contrato_import_jobs
DROP POLICY IF EXISTS cij_all ON public.contrato_import_jobs;
CREATE POLICY cij_select ON public.contrato_import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY cij_insert ON public.contrato_import_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cij_update ON public.contrato_import_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY cij_delete ON public.contrato_import_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- contrato_import_itens
DROP POLICY IF EXISTS cii_all ON public.contrato_import_itens;
CREATE POLICY cii_select ON public.contrato_import_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY cii_insert ON public.contrato_import_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cii_update ON public.contrato_import_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY cii_delete ON public.contrato_import_itens FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- contrato_import_dotacoes
DROP POLICY IF EXISTS cid_all ON public.contrato_import_dotacoes;
CREATE POLICY ciddot_select ON public.contrato_import_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY ciddot_insert ON public.contrato_import_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ciddot_update ON public.contrato_import_dotacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY ciddot_delete ON public.contrato_import_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- irp_jobs
DROP POLICY IF EXISTS jobs_all ON public.irp_jobs;
CREATE POLICY irpj_select ON public.irp_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY irpj_insert ON public.irp_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpj_update ON public.irp_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpj_delete ON public.irp_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

-- irp_job_secretarias
DROP POLICY IF EXISTS jobs_sec_all ON public.irp_job_secretarias;
CREATE POLICY irpjs_select ON public.irp_job_secretarias FOR SELECT TO authenticated USING (true);
CREATE POLICY irpjs_insert ON public.irp_job_secretarias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpjs_update ON public.irp_job_secretarias FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpjs_delete ON public.irp_job_secretarias FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
