
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.secretaria_unidades_equivalentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secretaria_id uuid NOT NULL REFERENCES public.secretarias(id) ON DELETE CASCADE,
  exercicio integer NOT NULL,
  unidade_gestora_m2a_id text NOT NULL,
  unidade_gestora_m2a_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secretaria_id, exercicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secretaria_unidades_equivalentes TO authenticated;
GRANT ALL ON public.secretaria_unidades_equivalentes TO service_role;

ALTER TABLE public.secretaria_unidades_equivalentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_gestor_select_sec_ug_equiv"
ON public.secretaria_unidades_equivalentes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "admin_gestor_insert_sec_ug_equiv"
ON public.secretaria_unidades_equivalentes FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "admin_gestor_update_sec_ug_equiv"
ON public.secretaria_unidades_equivalentes FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "admin_gestor_delete_sec_ug_equiv"
ON public.secretaria_unidades_equivalentes FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_sec_ug_equiv_updated_at
BEFORE UPDATE ON public.secretaria_unidades_equivalentes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
