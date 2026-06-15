GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_files TO authenticated;
GRANT ALL ON public.app_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.numeracao TO authenticated;
GRANT ALL ON public.numeracao TO service_role;

ALTER TABLE public.app_files
  ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS files_insert ON public.app_files;
CREATE POLICY files_insert ON public.app_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'operador'::public.app_role)
    )
  );