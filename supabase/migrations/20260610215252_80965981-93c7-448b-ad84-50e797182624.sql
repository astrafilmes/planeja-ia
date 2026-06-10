DROP FUNCTION IF EXISTS public.get_pauta_consolidada_data(uuid);

CREATE OR REPLACE FUNCTION public.get_pauta_consolidada_data(p_processo_id uuid)
 RETURNS TABLE(processo_id uuid, contrato_id uuid, contrato_numero text, item_id uuid, empresa text, item_codigo text, lote text, numero_item text, descricao text, especificacao text, unidade text, quantidade numeric, valor_unitario numeric, valor_total numeric, secretaria_sigla text, subcategoria text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.processo_id,
    c.id,
    c.numero_contrato,
    ci.id,
    c.fornecedor_nome,
    ci.numero_item,
    ci.lote,
    ci.numero_item,
    COALESCE(ci.descricao, c.objeto),
    ci.especificacao,
    ci.unidade,
    cid.quantidade_alocada,
    ci.valor_unitario,
    ci.valor_total,
    cid.secretaria_sigla,
    cid.dotacao
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  JOIN public.contrato_item_dotacoes cid ON ci.id = cid.item_id
  WHERE c.processo_id = p_processo_id
    AND c.deleted_at IS NULL;
END;
$function$;