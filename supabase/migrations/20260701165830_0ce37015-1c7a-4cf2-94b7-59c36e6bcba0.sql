
ALTER TABLE public.contrato_import_itens
  ADD COLUMN IF NOT EXISTS m2a_fornecedor_cnpj text;

CREATE INDEX IF NOT EXISTS idx_contrato_import_itens_job_ata
  ON public.contrato_import_itens(job_id, m2a_ata_id);

-- Backfill CNPJ a partir de m2a_atas para itens já sincronizados
UPDATE public.contrato_import_itens ci
   SET m2a_fornecedor_cnpj = a.fornecedor_cnpj
  FROM public.m2a_atas a,
       public.contrato_import_jobs j
 WHERE ci.job_id = j.id
   AND ci.m2a_ata_id IS NOT NULL
   AND ci.m2a_fornecedor_cnpj IS NULL
   AND a.processo_id = j.processo_id
   AND a.m2a_ata_id = ci.m2a_ata_id
   AND a.fornecedor_cnpj IS NOT NULL;
