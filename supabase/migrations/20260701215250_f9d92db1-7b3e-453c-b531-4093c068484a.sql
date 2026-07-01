CREATE OR REPLACE FUNCTION public.sync_m2a_contract_dates_from_snapshot(p_processo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  -- Regra: só atualizamos a data de um contrato local a partir do snapshot M2A
  -- quando o vínculo é INEQUÍVOCO (mesmo m2a_contrato_id). Não usamos mais o
  -- fallback por numero_contrato — ele estava sobrescrevendo a data dos
  -- contratos gerados em lote (que devem preservar a data do processo),
  -- fazendo surgir duas datas para contratos criados juntos.
  WITH src AS (
    SELECT DISTINCT ON (s.m2a_contrato_id)
           s.m2a_contrato_id,
           NULLIF(trim(coalesce(s.raw->>'vigencia_inicio', '')), '') AS data_texto,
           to_date(NULLIF(trim(coalesce(s.raw->>'vigencia_inicio', '')), ''), 'DD/MM/YYYY') AS data_inicio
      FROM public.m2a_contratos_snapshot s
     WHERE s.processo_id = p_processo_id
       AND NULLIF(trim(coalesce(s.raw->>'vigencia_inicio', '')), '') ~ '^\d{2}/\d{2}/\d{4}$'
     ORDER BY s.m2a_contrato_id, s.created_at DESC
  ),
  upd AS (
    UPDATE public.contratos c
       SET data = src.data_inicio,
           data_texto_legado = src.data_texto,
           updated_at = now()
      FROM src
     WHERE c.processo_id = p_processo_id
       AND c.deleted_at IS NULL
       AND c.m2a_contrato_id IS NOT NULL
       AND c.m2a_contrato_id = src.m2a_contrato_id
       AND (
         c.data IS DISTINCT FROM src.data_inicio
         OR c.data_texto_legado IS DISTINCT FROM src.data_texto
       )
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_updated FROM upd;

  RETURN coalesce(v_updated, 0);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_m2a_contract_dates_from_snapshot(uuid) TO authenticated, service_role;