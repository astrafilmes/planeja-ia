CREATE OR REPLACE FUNCTION public.next_contrato_number_for_base(
  p_numero_base text,
  p_sec_sigla text,
  p_sec_num int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final int;
BEGIN
  SELECT public.next_contrato_numbers_batch_for_base(
    p_numero_base,
    p_sec_sigla,
    p_sec_num,
    1
  )
  INTO v_final;

  RETURN v_final;
END;
$$;

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

  v_base_norm := regexp_replace(upper(trim(coalesce(p_numero_base, ''))), '[^0-9/]', '', 'g');
  v_sigla_norm := regexp_replace(upper(trim(coalesce(p_sec_sigla, ''))), '[^A-Z0-9]', '', 'g');

  IF v_base_norm !~ '^[0-9]{1,4}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'número base inválido: %', p_numero_base;
  END IF;

  IF v_sigla_norm = '' THEN
    RAISE EXCEPTION 'sigla da secretaria inválida';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contrato-num:' || v_base_norm || ':' || v_sigla_norm));

  SELECT coalesce(max((m[1])::int), 0)
  INTO v_max
  FROM (
    SELECT regexp_match(
      regexp_replace(upper(numero_contrato), '[^0-9A-Z/]', '', 'g'),
      '^' || v_base_norm || v_sigla_norm || '0*([0-9]+)$'
    ) AS m
    FROM public.contratos
    WHERE deleted_at IS NULL
  ) parsed
  WHERE m IS NOT NULL;

  v_final := v_max + p_qtd;

  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, v_final, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = greatest(public.numeracao.contador, EXCLUDED.contador),
        updated_at = now();

  RETURN v_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) TO authenticated;
