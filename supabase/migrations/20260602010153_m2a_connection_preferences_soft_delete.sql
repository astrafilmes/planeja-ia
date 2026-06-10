ALTER TABLE public.processos
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.contratos
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS processos_deleted_at_idx
  ON public.processos(deleted_at);

CREATE INDEX IF NOT EXISTS contratos_deleted_at_idx
  ON public.contratos(deleted_at);

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

CREATE INDEX IF NOT EXISTS m2a_envio_preferencias_user_idx
  ON public.m2a_envio_preferencias(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_envio_preferencias TO authenticated;
GRANT ALL ON public.m2a_envio_preferencias TO service_role;

ALTER TABLE public.m2a_envio_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY m2a_pref_select_own ON public.m2a_envio_preferencias
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY m2a_pref_insert_own ON public.m2a_envio_preferencias
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY m2a_pref_update_own ON public.m2a_envio_preferencias
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY m2a_pref_delete_own ON public.m2a_envio_preferencias
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP TRIGGER IF EXISTS m2a_envio_preferencias_touch ON public.m2a_envio_preferencias;
CREATE TRIGGER m2a_envio_preferencias_touch
  BEFORE UPDATE ON public.m2a_envio_preferencias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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

  UPDATE public.processos
  SET deleted_at = NULL, updated_at = now()
  WHERE id = p_processo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_soft_deleted_process(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) TO authenticated;
