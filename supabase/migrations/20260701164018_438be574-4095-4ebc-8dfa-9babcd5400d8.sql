
-- 1) Profiles: allow gestor to read all profiles
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin_or_gestor
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
);

-- 2) Revoke EXECUTE on internal / trigger / server-only SECURITY DEFINER functions
-- Triggers (never called from API):
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;

-- Server-only (called by edge functions / cron via service_role):
REVOKE ALL ON FUNCTION public.consume_trusted_device(text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_daily_backup_cron(text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) FROM anon, authenticated, PUBLIC;

-- 3) Revoke anon EXECUTE on all remaining public SECURITY DEFINER functions
-- (authenticated retains access; anon should never hit these)
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_daily_backup_cron(text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setup_daily_backup_cron(text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_logs_e_jobs(integer, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) FROM anon, PUBLIC;
