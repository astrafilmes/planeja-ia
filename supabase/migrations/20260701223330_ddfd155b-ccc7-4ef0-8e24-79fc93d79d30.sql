GRANT INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

CREATE POLICY audit_insert
ON public.audit_logs
FOR INSERT
TO service_role
WITH CHECK (auth.role() = 'service_role');