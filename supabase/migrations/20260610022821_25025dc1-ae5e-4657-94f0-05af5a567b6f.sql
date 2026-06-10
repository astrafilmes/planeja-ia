
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_number_for_base(text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_contrato_numbers_batch_for_base(text, text, integer, integer) FROM PUBLIC;
