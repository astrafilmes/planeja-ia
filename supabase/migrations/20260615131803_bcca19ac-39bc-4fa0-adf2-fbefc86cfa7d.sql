
-- ===== Unidades Orçamentárias (filhas dos órgãos) =====
CREATE TABLE IF NOT EXISTS public.m2a_unidades_orcamentarias (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  m2a_id text NOT NULL UNIQUE,
  nome text NOT NULL,
  orgao_m2a_id text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_unidades_orcamentarias TO authenticated;
GRANT ALL ON public.m2a_unidades_orcamentarias TO service_role;
ALTER TABLE public.m2a_unidades_orcamentarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uo_select_auth" ON public.m2a_unidades_orcamentarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "uo_admin_write" ON public.m2a_unidades_orcamentarias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role));
CREATE INDEX IF NOT EXISTS uo_orgao_idx ON public.m2a_unidades_orcamentarias(orgao_m2a_id);

-- ===== Agentes de Planejamento por UO =====
CREATE TABLE IF NOT EXISTS public.m2a_agentes_planejamento (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_m2a_id text NOT NULL,
  servidor_m2a_id text NOT NULL,
  nome text NOT NULL,
  data_referencia date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_m2a_id, servidor_m2a_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_agentes_planejamento TO authenticated;
GRANT ALL ON public.m2a_agentes_planejamento TO service_role;
ALTER TABLE public.m2a_agentes_planejamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agp_select_auth" ON public.m2a_agentes_planejamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "agp_admin_write" ON public.m2a_agentes_planejamento FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role));
CREATE INDEX IF NOT EXISTS agp_unidade_idx ON public.m2a_agentes_planejamento(unidade_m2a_id);

-- ===== Colunas em irp_jobs p/ guardar IDs M2A diretos (text) =====
ALTER TABLE public.irp_jobs
  ADD COLUMN IF NOT EXISTS unidade_orcamentaria_m2a_pk text,
  ADD COLUMN IF NOT EXISTS agente_planejamento_m2a_pk text;

-- ===== updated_at triggers =====
CREATE TRIGGER trg_uo_updated BEFORE UPDATE ON public.m2a_unidades_orcamentarias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_agp_updated BEFORE UPDATE ON public.m2a_agentes_planejamento
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
