ALTER TABLE public.secretarias
  ADD COLUMN IF NOT EXISTS m2a_fiscal_codigo text,
  ADD COLUMN IF NOT EXISTS m2a_gestor_codigo text;