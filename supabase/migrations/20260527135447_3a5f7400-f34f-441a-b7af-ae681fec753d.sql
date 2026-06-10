
CREATE OR REPLACE FUNCTION public.next_contrato_number(p_sec_num int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo int;
BEGIN
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, 1, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + 1,
        updated_at = now()
  RETURNING contador INTO v_novo;
  RETURN v_novo;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_contrato_numbers_batch(p_sec_num int, p_qtd int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_final int;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'quantidade deve ser > 0';
  END IF;
  INSERT INTO public.numeracao (secretaria_num, contador, updated_at)
  VALUES (p_sec_num, p_qtd, now())
  ON CONFLICT (secretaria_num) DO UPDATE
    SET contador = public.numeracao.contador + p_qtd,
        updated_at = now()
  RETURNING contador INTO v_final;
  RETURN v_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_contrato_number(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch(int, int) TO authenticated;
