CREATE OR REPLACE FUNCTION public.next_contrato_numbers_batch_for_base(
  p_numero_base text,
  p_sec_sigla text,
  p_sec_num int,
  p_qtd int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_norm text;
  v_sigla_norm text;
  v_max int;
  v_final int;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'quantidade deve ser > 0';
  END IF;

  v_base_norm := substring(
    regexp_replace(upper(trim(coalesce(p_numero_base, ''))), '\s+', '', 'g')
    from '([0-9]{1,4}/[0-9]{4})'
  );
  v_sigla_norm := regexp_replace(upper(trim(coalesce(p_sec_sigla, ''))), '[^A-Z0-9]', '', 'g');

  IF v_base_norm IS NULL OR v_base_norm !~ '^[0-9]{1,4}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'número base inválido: %', p_numero_base;
  END IF;

  IF v_sigla_norm = '' THEN
    RAISE EXCEPTION 'sigla da secretaria inválida';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contrato-num:' || v_base_norm || ':' || v_sigla_norm));

  WITH candidatos AS (
    SELECT (m[1])::int AS sequencia
    FROM (
      SELECT regexp_match(
        regexp_replace(upper(numero_contrato), '[^0-9A-Z/]', '', 'g'),
        '^' || v_base_norm || v_sigla_norm || '0*([0-9]+)$'
      ) AS m
      FROM public.contratos
      WHERE deleted_at IS NULL
    ) local_rows
    WHERE m IS NOT NULL

    UNION ALL

    SELECT coalesce(snapshot_rows.sequencia, (snapshot_rows.m[1])::int) AS sequencia
    FROM (
      SELECT
        sequencia,
        regexp_match(
          regexp_replace(upper(numero_contrato), '[^0-9A-Z/]', '', 'g'),
          '^' || v_base_norm || v_sigla_norm || '0*([0-9]+)$'
        ) AS m
      FROM public.m2a_contratos_snapshot
      WHERE upper(coalesce(sigla_secretaria, v_sigla_norm)) = v_sigla_norm
        AND (ano IS NULL OR ano = substring(v_base_norm from '/([0-9]{4})$')::int)
    ) snapshot_rows
    WHERE snapshot_rows.m IS NOT NULL
  )
  SELECT coalesce(max(sequencia), 0)
  INTO v_max
  FROM candidatos;

  v_final := v_max + p_qtd;

  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, v_final, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = greatest(public.numeracao.contador, EXCLUDED.contador),
        updated_at = now();

  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) TO authenticated;
