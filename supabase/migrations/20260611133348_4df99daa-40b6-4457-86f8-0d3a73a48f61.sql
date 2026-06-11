
-- ============================================================
-- Fase A.1 — Triggers updated_at em todas as tabelas
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'contrato_atores','contrato_import_dotacoes','contrato_import_itens',
    'contrato_import_jobs','contrato_item_dotacoes','contrato_itens',
    'contratos','fornecedores_prepostos','irp_jobs',
    'irp_unidades_processamento','m2a_envio_preferencias','m2a_servidores',
    'm2a_unidades_gestoras','numeracao','processos','profiles','secretarias'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- Fase A.2 — REVOKE EXECUTE de anon em funções SECURITY DEFINER
-- (mantém execução para authenticated e service_role)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.consume_trusted_device(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_trusted_device(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_number(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_m2a_snapshot(uuid, jsonb) TO authenticated, service_role;

-- Reports/RPCs SECURITY INVOKER também só para logados
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_contract_report_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contract_report_data(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_soft_deleted_process(uuid) TO authenticated, service_role;

-- ============================================================
-- Fase A.3 — Índices em created_at para logs + limpeza
-- ============================================================
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS m2a_envio_logs_created_at_idx
  ON public.m2a_envio_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS contrato_import_jobs_status_updated_idx
  ON public.contrato_import_jobs (status, updated_at DESC);

-- ============================================================
-- Fase A.4 — Função de limpeza (TTL) — apenas admin pode chamar
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_logs_e_jobs(
  p_audit_logs_days int DEFAULT 365,
  p_m2a_logs_days int DEFAULT 180,
  p_import_jobs_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_audit_deleted int := 0;
  v_m2a_deleted int := 0;
  v_jobs_deleted int := 0;
  v_itens_deleted int := 0;
  v_dot_deleted int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a limpeza.';
  END IF;

  WITH d AS (DELETE FROM public.audit_logs
              WHERE created_at < now() - make_interval(days => p_audit_logs_days)
              RETURNING 1)
  SELECT count(*) INTO v_audit_deleted FROM d;

  WITH d AS (DELETE FROM public.m2a_envio_logs
              WHERE created_at < now() - make_interval(days => p_m2a_logs_days)
              RETURNING 1)
  SELECT count(*) INTO v_m2a_deleted FROM d;

  -- Import jobs finalizados há mais de N dias + cascateia itens/dotacoes do job
  WITH old_jobs AS (
    SELECT id FROM public.contrato_import_jobs
     WHERE status IN ('concluido','erro','cancelado','finalizado')
       AND updated_at < now() - make_interval(days => p_import_jobs_days)
  ),
  d_dot AS (
    DELETE FROM public.contrato_import_dotacoes
     WHERE job_id IN (SELECT id FROM old_jobs)
    RETURNING 1
  ),
  d_itens AS (
    DELETE FROM public.contrato_import_itens
     WHERE job_id IN (SELECT id FROM old_jobs)
    RETURNING 1
  ),
  d_jobs AS (
    DELETE FROM public.contrato_import_jobs
     WHERE id IN (SELECT id FROM old_jobs)
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM d_dot),
    (SELECT count(*) FROM d_itens),
    (SELECT count(*) FROM d_jobs)
  INTO v_dot_deleted, v_itens_deleted, v_jobs_deleted;

  RETURN jsonb_build_object(
    'audit_logs_removidos', v_audit_deleted,
    'm2a_envio_logs_removidos', v_m2a_deleted,
    'import_jobs_removidos', v_jobs_deleted,
    'import_itens_removidos', v_itens_deleted,
    'import_dotacoes_removidos', v_dot_deleted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_logs_e_jobs(int, int, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_logs_e_jobs(int, int, int) TO authenticated, service_role;
