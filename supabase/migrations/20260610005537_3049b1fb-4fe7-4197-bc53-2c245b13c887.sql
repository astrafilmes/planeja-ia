CREATE OR REPLACE FUNCTION public.next_contrato_number(p_sec_num int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo int;
BEGIN
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, 1, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + 1,
        updated_at = now()
  RETURNING contador INTO v_novo;
  RETURN v_novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_contrato_numbers_batch(p_sec_num int, p_qtd int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final int;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'quantidade deve ser > 0';
  END IF;
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, p_qtd, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + p_qtd,
        updated_at = now()
  RETURNING contador INTO v_final;
  RETURN v_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_contrato_number(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch(int, int) TO authenticated;

DROP POLICY IF EXISTS ca_all ON public.contrato_atores;
CREATE POLICY ca_select ON public.contrato_atores FOR SELECT TO authenticated USING (true);
CREATE POLICY ca_insert ON public.contrato_atores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ca_update ON public.contrato_atores FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY ca_delete ON public.contrato_atores FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cd_all ON public.contrato_documentos;
CREATE POLICY cd_select ON public.contrato_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY cd_insert ON public.contrato_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cd_update ON public.contrato_documentos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cd_delete ON public.contrato_documentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cidot_all ON public.contrato_item_dotacoes;
CREATE POLICY cid2_select ON public.contrato_item_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY cid2_insert ON public.contrato_item_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cid2_update ON public.contrato_item_dotacoes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY cid2_delete ON public.contrato_item_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cij_all ON public.contrato_import_jobs;
CREATE POLICY cij_select ON public.contrato_import_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY cij_insert ON public.contrato_import_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cij_update ON public.contrato_import_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY cij_delete ON public.contrato_import_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cii_all ON public.contrato_import_itens;
CREATE POLICY cii_select ON public.contrato_import_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY cii_insert ON public.contrato_import_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY cii_update ON public.contrato_import_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY cii_delete ON public.contrato_import_itens FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS cid_all ON public.contrato_import_dotacoes;
CREATE POLICY ciddot_select ON public.contrato_import_dotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY ciddot_insert ON public.contrato_import_dotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ciddot_update ON public.contrato_import_dotacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY ciddot_delete ON public.contrato_import_dotacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS jobs_all ON public.irp_jobs;
CREATE POLICY irpj_select ON public.irp_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY irpj_insert ON public.irp_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpj_update ON public.irp_jobs FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpj_delete ON public.irp_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

DROP POLICY IF EXISTS jobs_sec_all ON public.irp_job_secretarias;
CREATE POLICY irpjs_select ON public.irp_job_secretarias FOR SELECT TO authenticated USING (true);
CREATE POLICY irpjs_insert ON public.irp_job_secretarias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY irpjs_update ON public.irp_job_secretarias FOR UPDATE TO authenticated USING (true);
CREATE POLICY irpjs_delete ON public.irp_job_secretarias FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS m2a_sync_at timestamptz;

CREATE TABLE public.m2a_atas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL,
  m2a_ata_id text NOT NULL,
  numero_ata text NOT NULL,
  fornecedor_nome text,
  fornecedor_cnpj text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m2a_atas_processo_idx ON public.m2a_atas(processo_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_atas TO authenticated;
GRANT ALL ON public.m2a_atas TO service_role;
ALTER TABLE public.m2a_atas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ma_select ON public.m2a_atas FOR SELECT TO authenticated USING (true);
CREATE POLICY ma_insert ON public.m2a_atas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ma_update ON public.m2a_atas FOR UPDATE TO authenticated USING (true);
CREATE POLICY ma_delete ON public.m2a_atas FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));

CREATE TABLE public.m2a_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL,
  m2a_ata_id text NOT NULL,
  m2a_item_id text NOT NULL,
  numero_item text,
  descricao text,
  unidade text,
  valor_unitario numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m2a_itens_processo_idx ON public.m2a_itens(processo_id);
CREATE INDEX m2a_itens_ata_idx ON public.m2a_itens(m2a_ata_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_itens TO authenticated;
GRANT ALL ON public.m2a_itens TO service_role;
ALTER TABLE public.m2a_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY mi_select ON public.m2a_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY mi_insert ON public.m2a_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY mi_update ON public.m2a_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY mi_delete ON public.m2a_itens FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));

CREATE TABLE public.m2a_contratos_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL,
  m2a_contrato_id text NOT NULL,
  numero_contrato text NOT NULL,
  m2a_ata_id text,
  sigla_secretaria text,
  ano integer,
  sequencia integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m2a_cs_processo_idx ON public.m2a_contratos_snapshot(processo_id);
CREATE INDEX m2a_cs_sigla_ano_idx ON public.m2a_contratos_snapshot(sigla_secretaria, ano);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_contratos_snapshot TO authenticated;
GRANT ALL ON public.m2a_contratos_snapshot TO service_role;
ALTER TABLE public.m2a_contratos_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcs_select ON public.m2a_contratos_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY mcs_insert ON public.m2a_contratos_snapshot FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY mcs_update ON public.m2a_contratos_snapshot FOR UPDATE TO authenticated USING (true);
CREATE POLICY mcs_delete ON public.m2a_contratos_snapshot FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gestor'::app_role));