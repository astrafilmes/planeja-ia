REVOKE ALL ON FUNCTION public.next_contrato_number_for_base(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, int, int) TO authenticated;
