ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS publicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_publicado_at ON public.contratos (publicado_at);