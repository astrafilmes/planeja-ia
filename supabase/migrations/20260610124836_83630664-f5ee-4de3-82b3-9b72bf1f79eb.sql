
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_number(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contract_report_data(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
