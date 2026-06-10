
-- 1) Processos: campos M2A
ALTER TABLE public.processos
  ADD COLUMN IF NOT EXISTS m2a_url text,
  ADD COLUMN IF NOT EXISTS m2a_processo_id text;

-- 2) Contratos: campos M2A
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS m2a_contrato_id text,
  ADD COLUMN IF NOT EXISTS m2a_ata_id text,
  ADD COLUMN IF NOT EXISTS status_envio_m2a text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS ultimo_erro_m2a text,
  ADD COLUMN IF NOT EXISTS enviado_m2a_em timestamptz;

-- 3) contrato_itens
CREATE TABLE IF NOT EXISTS public.contrato_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  lote text,
  numero_item text,
  ordem_item integer,
  descricao text NOT NULL,
  especificacao text,
  unidade text,
  quantidade numeric NOT NULL DEFAULT 0,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  m2a_item_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contrato_itens_contrato ON public.contrato_itens(contrato_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_itens TO authenticated;
GRANT ALL ON public.contrato_itens TO service_role;
ALTER TABLE public.contrato_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY ci_select ON public.contrato_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY ci_insert ON public.contrato_itens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ci_update ON public.contrato_itens FOR UPDATE TO authenticated USING (true);
CREATE POLICY ci_delete ON public.contrato_itens FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor'));
CREATE TRIGGER trg_ci_touch BEFORE UPDATE ON public.contrato_itens FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) contrato_item_dotacoes
CREATE TABLE IF NOT EXISTS public.contrato_item_dotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  secretaria_sigla text NOT NULL,
  secretaria_id uuid,
  dotacao text NOT NULL,
  quantidade_alocada numeric NOT NULL DEFAULT 0,
  m2a_dotacao_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cid_item ON public.contrato_item_dotacoes(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_item_dotacoes TO authenticated;
GRANT ALL ON public.contrato_item_dotacoes TO service_role;
ALTER TABLE public.contrato_item_dotacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cid_all ON public.contrato_item_dotacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_cid_touch BEFORE UPDATE ON public.contrato_item_dotacoes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) contrato_atores
CREATE TABLE IF NOT EXISTS public.contrato_atores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  tipo text NOT NULL, -- fiscal_titular | fiscal_substituto | gestor | preposto
  nome text NOT NULL,
  cpf text,
  email text,
  portaria text,
  m2a_pessoa_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_atores_contrato ON public.contrato_atores(contrato_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_atores TO authenticated;
GRANT ALL ON public.contrato_atores TO service_role;
ALTER TABLE public.contrato_atores ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_all ON public.contrato_atores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ca_touch BEFORE UPDATE ON public.contrato_atores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) contrato_documentos
CREATE TABLE IF NOT EXISTS public.contrato_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  tipo text NOT NULL, -- ata | contrato | portaria | outro
  nome text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  hash_sha256 text,
  versao integer NOT NULL DEFAULT 1,
  m2a_documento_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_contrato ON public.contrato_documentos(contrato_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_documentos TO authenticated;
GRANT ALL ON public.contrato_documentos TO service_role;
ALTER TABLE public.contrato_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY cd_all ON public.contrato_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7) m2a_envio_logs
CREATE TABLE IF NOT EXISTS public.m2a_envio_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  etapa text NOT NULL,
  sucesso boolean NOT NULL DEFAULT false,
  http_status integer,
  duracao_ms integer,
  payload_json jsonb,
  response_json jsonb,
  mensagem text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_log_contrato ON public.m2a_envio_logs(contrato_id);
GRANT SELECT, INSERT ON public.m2a_envio_logs TO authenticated;
GRANT ALL ON public.m2a_envio_logs TO service_role;
ALTER TABLE public.m2a_envio_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY log_select ON public.m2a_envio_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY log_insert ON public.m2a_envio_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 8) Storage bucket para documentos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('contrato-documentos', 'contrato-documentos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "contrato_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contrato-documentos');
CREATE POLICY "contrato_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contrato-documentos');
CREATE POLICY "contrato_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contrato-documentos');
CREATE POLICY "contrato_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contrato-documentos' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'gestor')));
