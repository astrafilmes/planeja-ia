
-- Revoga acesso público (PUBLIC = anon + authenticated) de TODAS as funções
-- SECURITY DEFINER do schema public. Em seguida re-concede EXECUTE apenas
-- às funções realmente chamadas pelo app autenticado.

REVOKE EXECUTE ON FUNCTION public.next_contrato_number(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_trusted_device(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_logs_e_jobs(int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.setup_daily_backup_cron(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.setup_daily_backup_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_daily_backup_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Funções de uso legítimo pelo app: revoga anon, mantém authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contract_report_data(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) TO authenticated;

-- Funções SQL imutáveis utilitárias (não SECURITY DEFINER mas no schema public):
-- mantemos disponíveis apenas a authenticated; bloqueamos anon por higiene.
REVOKE EXECUTE ON FUNCTION public.normalize_numero_item(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.normalize_m2a_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_numero_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_m2a_text(text) TO authenticated;
