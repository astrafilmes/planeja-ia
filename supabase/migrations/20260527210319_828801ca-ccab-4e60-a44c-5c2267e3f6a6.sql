
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
