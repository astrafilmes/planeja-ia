UPDATE public.contrato_itens ci
SET lote = sub.lote,
    especificacao = COALESCE(NULLIF(ci.especificacao,''), sub.especificacao),
    updated_at = now()
FROM (
  SELECT DISTINCT ON (descricao) descricao, lote, especificacao
  FROM public.contrato_import_itens
  WHERE lote IS NOT NULL AND lote <> ''
  ORDER BY descricao, created_at DESC
) sub
WHERE sub.descricao = ci.descricao
  AND (ci.lote IS NULL OR ci.lote = '');