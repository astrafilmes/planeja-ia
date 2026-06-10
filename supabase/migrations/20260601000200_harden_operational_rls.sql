-- Harden broad RLS policies created during initial scaffolding.
-- Read access remains available to authenticated users; writes are limited to
-- operational roles. Destructive actions remain admin/gestor only, except M2A
-- snapshot tables where operadores need delete+insert during synchronization.

-- Processos
DROP POLICY IF EXISTS proc_insert ON public.processos;
DROP POLICY IF EXISTS proc_update ON public.processos;

CREATE POLICY proc_insert_operational ON public.processos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

CREATE POLICY proc_update_operational ON public.processos
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

-- Contratos
DROP POLICY IF EXISTS con_insert ON public.contratos;
DROP POLICY IF EXISTS con_update ON public.contratos;

CREATE POLICY con_insert_operational ON public.contratos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

CREATE POLICY con_update_operational ON public.contratos
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

-- Contrato itens
DROP POLICY IF EXISTS ci_insert ON public.contrato_itens;
DROP POLICY IF EXISTS ci_update ON public.contrato_itens;

CREATE POLICY ci_insert_operational ON public.contrato_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

CREATE POLICY ci_update_operational ON public.contrato_itens
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

-- Tabelas filhas do contrato
DROP POLICY IF EXISTS cid_all ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_select ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_insert ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_update ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_delete ON public.contrato_item_dotacoes;

CREATE POLICY cid2_select ON public.contrato_item_dotacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY cid2_insert_operational ON public.contrato_item_dotacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cid2_update_operational ON public.contrato_item_dotacoes
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cid2_delete_manager ON public.contrato_item_dotacoes
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS ca_all ON public.contrato_atores;
DROP POLICY IF EXISTS ca_select ON public.contrato_atores;
DROP POLICY IF EXISTS ca_insert ON public.contrato_atores;
DROP POLICY IF EXISTS ca_update ON public.contrato_atores;
DROP POLICY IF EXISTS ca_delete ON public.contrato_atores;

CREATE POLICY ca_select ON public.contrato_atores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ca_insert_operational ON public.contrato_atores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ca_update_operational ON public.contrato_atores
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ca_delete_manager ON public.contrato_atores
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS cd_all ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_select ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_insert ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_update ON public.contrato_documentos;
DROP POLICY IF EXISTS cd_delete ON public.contrato_documentos;

CREATE POLICY cd_select ON public.contrato_documentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_insert_operational ON public.contrato_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cd_update_operational ON public.contrato_documentos
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cd_delete_manager ON public.contrato_documentos
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

-- Importação de contratos e IRP
DROP POLICY IF EXISTS cij_all ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_select ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_insert ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_update ON public.contrato_import_jobs;
DROP POLICY IF EXISTS cij_delete ON public.contrato_import_jobs;

CREATE POLICY cij_select ON public.contrato_import_jobs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY cij_insert_operational ON public.contrato_import_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cij_update_operational ON public.contrato_import_jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cij_delete_manager ON public.contrato_import_jobs
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS cii_all ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_select ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_insert ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_update ON public.contrato_import_itens;
DROP POLICY IF EXISTS cii_delete ON public.contrato_import_itens;

CREATE POLICY cii_select ON public.contrato_import_itens
  FOR SELECT TO authenticated USING (true);
CREATE POLICY cii_insert_operational ON public.contrato_import_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cii_update_operational ON public.contrato_import_itens
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY cii_delete_manager ON public.contrato_import_itens
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS cid_all ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_select ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_insert ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_update ON public.contrato_import_dotacoes;
DROP POLICY IF EXISTS ciddot_delete ON public.contrato_import_dotacoes;

CREATE POLICY ciddot_select ON public.contrato_import_dotacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ciddot_insert_operational ON public.contrato_import_dotacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ciddot_update_operational ON public.contrato_import_dotacoes
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ciddot_delete_manager ON public.contrato_import_dotacoes
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS jobs_all ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_select ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_insert ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_update ON public.irp_jobs;
DROP POLICY IF EXISTS irpj_delete ON public.irp_jobs;

CREATE POLICY irpj_select ON public.irp_jobs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY irpj_insert_operational ON public.irp_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY irpj_update_operational ON public.irp_jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY irpj_delete_manager ON public.irp_jobs
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

DROP POLICY IF EXISTS jobs_sec_all ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_select ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_insert ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_update ON public.irp_job_secretarias;
DROP POLICY IF EXISTS irpjs_delete ON public.irp_job_secretarias;

CREATE POLICY irpjs_select ON public.irp_job_secretarias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY irpjs_insert_operational ON public.irp_job_secretarias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY irpjs_update_operational ON public.irp_job_secretarias
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY irpjs_delete_manager ON public.irp_job_secretarias
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

-- Snapshots M2A: operadores podem sincronizar, incluindo limpar snapshot antigo.
DROP POLICY IF EXISTS ma_insert ON public.m2a_atas;
DROP POLICY IF EXISTS ma_update ON public.m2a_atas;
DROP POLICY IF EXISTS ma_delete ON public.m2a_atas;

CREATE POLICY ma_insert_operational ON public.m2a_atas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ma_update_operational ON public.m2a_atas
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY ma_delete_operational ON public.m2a_atas
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

DROP POLICY IF EXISTS mi_insert ON public.m2a_itens;
DROP POLICY IF EXISTS mi_update ON public.m2a_itens;
DROP POLICY IF EXISTS mi_delete ON public.m2a_itens;

CREATE POLICY mi_insert_operational ON public.m2a_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY mi_update_operational ON public.m2a_itens
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY mi_delete_operational ON public.m2a_itens
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

DROP POLICY IF EXISTS mcs_insert ON public.m2a_contratos_snapshot;
DROP POLICY IF EXISTS mcs_update ON public.m2a_contratos_snapshot;
DROP POLICY IF EXISTS mcs_delete ON public.m2a_contratos_snapshot;

CREATE POLICY mcs_insert_operational ON public.m2a_contratos_snapshot
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY mcs_update_operational ON public.m2a_contratos_snapshot
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );
CREATE POLICY mcs_delete_operational ON public.m2a_contratos_snapshot
  FOR DELETE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

-- Numeração direta só para gestores/admins; operadores continuam usando RPCs.
DROP POLICY IF EXISTS num_update ON public.numeracao;

CREATE POLICY num_update_manager ON public.numeracao
  FOR ALL TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );
