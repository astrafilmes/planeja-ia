UPDATE public.contrato_import_jobs j
SET total_contratos_previstos = sub.cnt
FROM (
  SELECT i.job_id, COUNT(DISTINCT (COALESCE(i.empresa,'') || '|' || d.secretaria_sigla || '|' || d.dotacao)) AS cnt
  FROM public.contrato_import_itens i
  JOIN public.contrato_import_dotacoes d ON d.item_id = i.id
  WHERE i.excluido = false
  GROUP BY i.job_id
) sub
WHERE sub.job_id = j.id;