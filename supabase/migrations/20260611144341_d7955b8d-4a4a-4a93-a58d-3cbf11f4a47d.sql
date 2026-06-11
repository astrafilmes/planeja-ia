ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS impresso_assinado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publicado boolean NOT NULL DEFAULT false;