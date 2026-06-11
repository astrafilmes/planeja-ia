CREATE OR REPLACE FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(p_processo_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH src AS (
    SELECT DISTINCT ON (s.m2a_ata_id, s.processo_id)
      s.processo_id,
      s.m2a_ata_id,
      NULLIF(btrim(s.raw->>'fornecedor_nome'), '') AS forn_nome,
      NULLIF(btrim(s.raw->>'fornecedor_cnpj'), '') AS forn_cnpj
    FROM public.m2a_contratos_snapshot s
    WHERE (p_processo_id IS NULL OR s.processo_id = p_processo_id)
      AND NULLIF(btrim(s.raw->>'fornecedor_nome'), '') IS NOT NULL
    ORDER BY s.m2a_ata_id, s.processo_id, s.created_at DESC
  ), upd AS (
    UPDATE public.m2a_atas a
    SET
      fornecedor_nome = COALESCE(NULLIF(btrim(a.fornecedor_nome), ''), src.forn_nome),
      fornecedor_cnpj = COALESCE(NULLIF(btrim(a.fornecedor_cnpj), ''), src.forn_cnpj)
    FROM src
    WHERE a.processo_id = src.processo_id
      AND a.m2a_ata_id = src.m2a_ata_id
      AND (
        NULLIF(btrim(a.fornecedor_nome), '') IS NULL
        OR (NULLIF(btrim(a.fornecedor_cnpj), '') IS NULL AND src.forn_cnpj IS NOT NULL)
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_m2a_atas_fornecedor_from_snapshot(uuid) TO authenticated, service_role;

-- Backfill imediato para todas as atas
SELECT public.sync_m2a_atas_fornecedor_from_snapshot(NULL);
