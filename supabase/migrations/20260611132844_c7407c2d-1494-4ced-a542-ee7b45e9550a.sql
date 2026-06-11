CREATE OR REPLACE FUNCTION public.get_pauta_consolidada_full(p_processo_id uuid, p_contrato_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(processo_id uuid, contrato_id uuid, contrato_numero text, item_id uuid, empresa text, item_codigo text, lote text, numero_item text, descricao text, especificacao text, unidade text, quantidade numeric, valor_unitario numeric, valor_total numeric, secretaria_sigla text, subcategoria text, no_contrato boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- A) Linhas de dotação dos contratos SELECIONADOS (quantidade real por secretaria)
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
    cid.dotacao,
    false
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  JOIN public.contrato_item_dotacoes cid ON ci.id = cid.item_id
  WHERE c.processo_id = p_processo_id
    AND c.deleted_at IS NULL
    AND (p_contrato_ids IS NULL OR c.id = ANY(p_contrato_ids))

  UNION ALL

  -- B) Itens de contratos do mesmo processo que NÃO foram selecionados
  --    (entram com quantidade 0 para revelar o item na pauta, sem dedupe).
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
    0::numeric,
    ci.valor_unitario,
    ci.valor_total,
    NULL::text,
    NULL::text,
    true
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  WHERE c.processo_id = p_processo_id
    AND c.deleted_at IS NULL
    AND p_contrato_ids IS NOT NULL
    AND NOT (c.id = ANY(p_contrato_ids))

  UNION ALL

  -- C) Itens existentes no portal M2A (m2a_itens) ainda NÃO ligados a NENHUM
  --    contrato_item do processo — garantem que a pauta cubra 100% do edital.
  SELECT
    p_processo_id,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    ma.fornecedor_nome,
    mi.numero_item,
    NULL::text,
    mi.numero_item,
    mi.descricao,
    NULL::text,
    mi.unidade,
    0::numeric,
    mi.valor_unitario,
    0::numeric,
    NULL::text,
    NULL::text,
    true
  FROM public.m2a_itens mi
  LEFT JOIN public.m2a_atas ma
    ON ma.processo_id = mi.processo_id AND ma.m2a_ata_id = mi.m2a_ata_id
  WHERE mi.processo_id = p_processo_id
    AND NOT EXISTS (
      SELECT 1
        FROM public.contrato_itens ci3
        JOIN public.contratos c3 ON c3.id = ci3.contrato_id
       WHERE c3.processo_id = p_processo_id
         AND c3.deleted_at IS NULL
         AND ci3.m2a_item_id = mi.m2a_item_id
    );
END;
$function$;