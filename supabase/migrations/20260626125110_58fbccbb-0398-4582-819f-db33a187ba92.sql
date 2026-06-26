
-- Revoke from anon on all sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_trusted_device(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_logs_e_jobs(integer, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) FROM anon, PUBLIC;
