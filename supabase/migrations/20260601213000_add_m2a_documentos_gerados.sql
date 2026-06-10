ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS m2a_documentos_gerados jsonb NOT NULL DEFAULT '[]'::jsonb;
