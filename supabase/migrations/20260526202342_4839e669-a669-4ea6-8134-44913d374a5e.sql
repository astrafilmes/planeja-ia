
-- Campos M2A no catálogo de secretarias
ALTER TABLE public.secretarias
  ADD COLUMN IF NOT EXISTS m2a_orgao_id text,
  ADD COLUMN IF NOT EXISTS m2a_uo_id text,
  ADD COLUMN IF NOT EXISTS m2a_dot_id text,
  ADD COLUMN IF NOT EXISTS m2a_dotacao_default text,
  ADD COLUMN IF NOT EXISTS m2a_ref_coluna integer,
  ADD COLUMN IF NOT EXISTS m2a_fiscal_cpf text,
  ADD COLUMN IF NOT EXISTS m2a_fiscal_nome text,
  ADD COLUMN IF NOT EXISTS m2a_gestor_cpf text,
  ADD COLUMN IF NOT EXISTS m2a_gestor_nome text;

-- Bucket de documentos (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contrato-documentos', 'contrato-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket (somente authenticated)
DO $$ BEGIN
  CREATE POLICY "contrato_docs_select" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'contrato-documentos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contrato_docs_insert" ON storage.objects FOR INSERT
    TO authenticated WITH CHECK (bucket_id = 'contrato-documentos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "contrato_docs_delete" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'contrato-documentos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
