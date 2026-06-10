-- Harden RLS policies for operational tables
DROP POLICY IF EXISTS proc_insert ON public.processos;
DROP POLICY IF EXISTS proc_update ON public.processos;
CREATE POLICY proc_insert_operational ON public.processos FOR INSERT TO authenticated WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));
CREATE POLICY proc_update_operational ON public.processos FOR UPDATE TO authenticated USING (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role)) WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));

DROP POLICY IF EXISTS con_insert ON public.contratos;
DROP POLICY IF EXISTS con_update ON public.contratos;
CREATE POLICY con_insert_operational ON public.contratos FOR INSERT TO authenticated WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));
CREATE POLICY con_update_operational ON public.contratos FOR UPDATE TO authenticated USING (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role)) WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));

DROP POLICY IF EXISTS ci_insert ON public.contrato_itens;
DROP POLICY IF EXISTS ci_update ON public.contrato_itens;
CREATE POLICY ci_insert_operational ON public.contrato_itens FOR INSERT TO authenticated WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));
CREATE POLICY ci_update_operational ON public.contrato_itens FOR UPDATE TO authenticated USING (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role)) WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));

-- M2A Catalog tables
DO $$ BEGIN
  CREATE TYPE public.m2a_servidor_cargo AS ENUM ('FISCAL', 'GESTOR', 'PREPOSTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.m2a_unidades_gestoras (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  m2a_id varchar NOT NULL UNIQUE,
  nome text NOT NULL UNIQUE,
  sigla text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_unidades_gestoras TO authenticated;
GRANT ALL ON public.m2a_unidades_gestoras TO service_role;
ALTER TABLE public.m2a_unidades_gestoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY m2a_unidades_select ON public.m2a_unidades_gestoras FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_unidades_modify ON public.m2a_unidades_gestoras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.m2a_servidores (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  m2a_id varchar NOT NULL UNIQUE,
  nome text NOT NULL,
  cpf text,
  cargo public.m2a_servidor_cargo NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_servidores TO authenticated;
GRANT ALL ON public.m2a_servidores TO service_role;
ALTER TABLE public.m2a_servidores ENABLE ROW LEVEL SECURITY;
CREATE POLICY m2a_servidores_select ON public.m2a_servidores FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_servidores_modify ON public.m2a_servidores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE TABLE IF NOT EXISTS public.m2a_servidor_unidade (
  servidor_id uuid NOT NULL REFERENCES public.m2a_servidores(id_local) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.m2a_unidades_gestoras(id_local) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (servidor_id, unidade_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_servidor_unidade TO authenticated;
GRANT ALL ON public.m2a_servidor_unidade TO service_role;
ALTER TABLE public.m2a_servidor_unidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY m2a_servidor_unidade_select ON public.m2a_servidor_unidade FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_servidor_unidade_modify ON public.m2a_servidor_unidade FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

-- secretarias: extra m2a columns
ALTER TABLE public.secretarias
  ADD COLUMN IF NOT EXISTS m2a_dot_orgao_id text;

-- Import flow ATAs/extras
ALTER TABLE public.contrato_import_jobs
  ADD COLUMN IF NOT EXISTS processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS m2a_url text,
  ADD COLUMN IF NOT EXISTS m2a_processo_id text,
  ADD COLUMN IF NOT EXISTS m2a_sync_at timestamptz;

ALTER TABLE public.contrato_import_itens
  ADD COLUMN IF NOT EXISTS m2a_ata_id text,
  ADD COLUMN IF NOT EXISTS m2a_item_id text,
  ADD COLUMN IF NOT EXISTS m2a_ata_numero text,
  ADD COLUMN IF NOT EXISTS m2a_fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS m2a_match_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS m2a_match_score numeric NOT NULL DEFAULT 0;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS m2a_ata_numero text,
  ADD COLUMN IF NOT EXISTS fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS m2a_documentos_gerados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS processos_deleted_at_idx ON public.processos(deleted_at);
CREATE INDEX IF NOT EXISTS contratos_deleted_at_idx ON public.contratos(deleted_at);

-- Fornecedores prepostos
CREATE TABLE IF NOT EXISTS public.fornecedores_prepostos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_nome text NOT NULL,
  fornecedor_nome_norm text NOT NULL UNIQUE,
  fornecedor_cnpj text,
  preposto_nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores_prepostos TO authenticated;
GRANT ALL ON public.fornecedores_prepostos TO service_role;
ALTER TABLE public.fornecedores_prepostos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_select ON public.fornecedores_prepostos FOR SELECT TO authenticated USING (true);
CREATE POLICY fp_insert_operational ON public.fornecedores_prepostos FOR INSERT TO authenticated
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));
CREATE POLICY fp_update_operational ON public.fornecedores_prepostos FOR UPDATE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role) OR public.has_role((select auth.uid()), 'operador'::public.app_role));
CREATE POLICY fp_delete_manager ON public.fornecedores_prepostos FOR DELETE TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role) OR public.has_role((select auth.uid()), 'gestor'::public.app_role));
CREATE TRIGGER fornecedores_prepostos_touch BEFORE UPDATE ON public.fornecedores_prepostos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- M2A envio preferencias (per user)
CREATE TABLE IF NOT EXISTS public.m2a_envio_preferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unidade_gestora_id text NOT NULL,
  secretaria_id uuid REFERENCES public.secretarias(id) ON DELETE SET NULL,
  data_padrao date,
  fiscal_id text NOT NULL,
  gestor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, unidade_gestora_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_envio_preferencias TO authenticated;
GRANT ALL ON public.m2a_envio_preferencias TO service_role;
ALTER TABLE public.m2a_envio_preferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY m2a_pref_select_own ON public.m2a_envio_preferencias FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY m2a_pref_insert_own ON public.m2a_envio_preferencias FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY m2a_pref_update_own ON public.m2a_envio_preferencias FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY m2a_pref_delete_own ON public.m2a_envio_preferencias FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
CREATE TRIGGER m2a_envio_preferencias_touch BEFORE UPDATE ON public.m2a_envio_preferencias FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Restore soft-deleted process (admin only)
CREATE OR REPLACE FUNCTION public.restore_soft_deleted_process(p_processo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem restaurar processos excluídos.';
  END IF;
  UPDATE public.processos SET deleted_at = NULL, updated_at = now() WHERE id = p_processo_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_soft_deleted_process(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) TO authenticated;

-- Numbering by base (latest version with portal snapshot)
CREATE OR REPLACE FUNCTION public.next_contrato_numbers_batch_for_base(
  p_numero_base text,
  p_sec_sigla text,
  p_sec_num int,
  p_qtd int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_norm text;
  v_sigla_norm text;
  v_max int;
  v_final int;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'quantidade deve ser > 0';
  END IF;
  v_base_norm := substring(regexp_replace(upper(trim(coalesce(p_numero_base, ''))), '\s+', '', 'g') from '([0-9]{1,4}/[0-9]{4})');
  v_sigla_norm := regexp_replace(upper(trim(coalesce(p_sec_sigla, ''))), '[^A-Z0-9]', '', 'g');
  IF v_base_norm IS NULL OR v_base_norm !~ '^[0-9]{1,4}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'número base inválido: %', p_numero_base;
  END IF;
  IF v_sigla_norm = '' THEN
    RAISE EXCEPTION 'sigla da secretaria inválida';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('contrato-num:' || v_base_norm || ':' || v_sigla_norm));
  WITH candidatos AS (
    SELECT (m[1])::int AS sequencia FROM (
      SELECT regexp_match(regexp_replace(upper(numero_contrato), '[^0-9A-Z/]', '', 'g'), '^' || v_base_norm || v_sigla_norm || '0*([0-9]+)$') AS m
      FROM public.contratos WHERE deleted_at IS NULL
    ) local_rows WHERE m IS NOT NULL
    UNION ALL
    SELECT coalesce(snapshot_rows.sequencia, (snapshot_rows.m[1])::int) AS sequencia FROM (
      SELECT sequencia, regexp_match(regexp_replace(upper(numero_contrato), '[^0-9A-Z/]', '', 'g'), '^' || v_base_norm || v_sigla_norm || '0*([0-9]+)$') AS m
      FROM public.m2a_contratos_snapshot
      WHERE upper(coalesce(sigla_secretaria, v_sigla_norm)) = v_sigla_norm
        AND (ano IS NULL OR ano = substring(v_base_norm from '/([0-9]{4})$')::int)
    ) snapshot_rows WHERE snapshot_rows.m IS NOT NULL
  )
  SELECT coalesce(max(sequencia), 0) INTO v_max FROM candidatos;
  v_final := v_max + p_qtd;
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, v_final, now())
  ON CONFLICT (secretaria_num) DO UPDATE SET contador = greatest(public.numeracao.contador, EXCLUDED.contador), updated_at = now();
  RETURN v_final;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_contrato_number_for_base(p_numero_base text, p_sec_sigla text, p_sec_num int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_final int;
BEGIN
  SELECT public.next_contrato_numbers_batch_for_base(p_numero_base, p_sec_sigla, p_sec_num, 1) INTO v_final;
  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION public.next_contrato_number_for_base(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) TO authenticated;

-- Report RPCs
CREATE OR REPLACE FUNCTION public.get_contract_report_data(p_contract_id uuid)
RETURNS TABLE (contract_id uuid, numero_contrato text, secretaria_nome text, secretaria_sigla text, preposto text, fiscal text, objeto text, dotacao text, m2a_ata_numero text, fornecedor_nome text, processo_id uuid, created_at timestamptz, item_id uuid, item_ordem integer, item_numero text, item_lote text, item_descricao text, item_especificacao text, item_unidade text, item_quantidade numeric, item_valor_unitario numeric, item_valor_total numeric)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.numero_contrato, c.secretaria_nome, c.secretaria_sigla, c.preposto, c.fiscal, c.objeto, c.dotacao, c.m2a_ata_numero, c.fornecedor_nome, c.processo_id, c.created_at, ci.id, ci.ordem_item, ci.numero_item, ci.lote, ci.descricao, ci.especificacao, ci.unidade, ci.quantidade, ci.valor_unitario, ci.valor_total
  FROM public.contratos c LEFT JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  WHERE c.id = p_contract_id ORDER BY ci.ordem_item ASC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_contract_report_data(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_multiple_contracts_report_data(p_contract_ids uuid[])
RETURNS TABLE (contract_id uuid, numero_contrato text, secretaria_nome text, secretaria_sigla text, preposto text, fiscal text, objeto text, dotacao text, m2a_ata_numero text, fornecedor_nome text, processo_id uuid, created_at timestamptz, item_id uuid, item_ordem integer, item_numero text, item_lote text, item_descricao text, item_especificacao text, item_unidade text, item_quantidade numeric, item_valor_unitario numeric, item_valor_total numeric)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.numero_contrato, c.secretaria_nome, c.secretaria_sigla, c.preposto, c.fiscal, c.objeto, c.dotacao, c.m2a_ata_numero, c.fornecedor_nome, c.processo_id, c.created_at, ci.id, ci.ordem_item, ci.numero_item, ci.lote, ci.descricao, ci.especificacao, ci.unidade, ci.quantidade, ci.valor_unitario, ci.valor_total
  FROM public.contratos c LEFT JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  WHERE c.id = ANY(p_contract_ids) ORDER BY c.numero_contrato ASC, ci.ordem_item ASC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pauta_consolidada_data(p_processo_id uuid)
RETURNS TABLE (processo_id uuid, contrato_numero text, item_id uuid, empresa text, item_codigo text, lote text, numero_item text, descricao text, unidade text, quantidade numeric, valor_unitario numeric, valor_total numeric, secretaria_sigla text, subcategoria text)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.processo_id, c.numero_contrato, ci.id, c.fornecedor_nome, ci.numero_item, ci.lote, ci.numero_item, COALESCE(ci.descricao, c.objeto), ci.unidade, cid.quantidade_alocada, ci.valor_unitario, ci.valor_total, cid.secretaria_sigla, cid.dotacao
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  JOIN public.contrato_item_dotacoes cid ON ci.id = cid.item_id
  WHERE c.processo_id = p_processo_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) TO authenticated;