
-- Limpeza de órfãos (335 itens sem contrato)
DELETE FROM public.contrato_item_dotacoes
 WHERE item_id IN (
   SELECT ci.id FROM public.contrato_itens ci
    WHERE NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = ci.contrato_id)
 );
DELETE FROM public.contrato_itens ci
 WHERE NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.id = ci.contrato_id);

-- contrato_itens → contratos
ALTER TABLE public.contrato_itens
  ADD CONSTRAINT contrato_itens_contrato_id_fkey
  FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS contrato_itens_contrato_id_idx ON public.contrato_itens(contrato_id);

-- contrato_item_dotacoes → contrato_itens + secretarias
ALTER TABLE public.contrato_item_dotacoes
  ADD CONSTRAINT contrato_item_dotacoes_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.contrato_itens(id) ON DELETE CASCADE;
ALTER TABLE public.contrato_item_dotacoes
  ADD CONSTRAINT contrato_item_dotacoes_secretaria_id_fkey
  FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contrato_item_dotacoes_item_id_idx ON public.contrato_item_dotacoes(item_id);
CREATE INDEX IF NOT EXISTS contrato_item_dotacoes_secretaria_id_idx ON public.contrato_item_dotacoes(secretaria_id);

-- contrato_atores → contratos
ALTER TABLE public.contrato_atores
  ADD CONSTRAINT contrato_atores_contrato_id_fkey
  FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS contrato_atores_contrato_id_idx ON public.contrato_atores(contrato_id);

-- contrato_documentos → contratos
ALTER TABLE public.contrato_documentos
  ADD CONSTRAINT contrato_documentos_contrato_id_fkey
  FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS contrato_documentos_contrato_id_idx ON public.contrato_documentos(contrato_id);

-- contrato_import_itens → contrato_import_jobs
ALTER TABLE public.contrato_import_itens
  ADD CONSTRAINT contrato_import_itens_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.contrato_import_jobs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS contrato_import_itens_job_id_idx ON public.contrato_import_itens(job_id);

-- contrato_import_dotacoes → job + item
ALTER TABLE public.contrato_import_dotacoes
  ADD CONSTRAINT contrato_import_dotacoes_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.contrato_import_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.contrato_import_dotacoes
  ADD CONSTRAINT contrato_import_dotacoes_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.contrato_import_itens(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS contrato_import_dotacoes_job_id_idx ON public.contrato_import_dotacoes(job_id);
CREATE INDEX IF NOT EXISTS contrato_import_dotacoes_item_id_idx ON public.contrato_import_dotacoes(item_id);

-- m2a_atas → processos
ALTER TABLE public.m2a_atas
  ADD CONSTRAINT m2a_atas_processo_id_fkey
  FOREIGN KEY (processo_id) REFERENCES public.processos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS m2a_atas_processo_id_idx ON public.m2a_atas(processo_id);

-- m2a_itens → processos
ALTER TABLE public.m2a_itens
  ADD CONSTRAINT m2a_itens_processo_id_fkey
  FOREIGN KEY (processo_id) REFERENCES public.processos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS m2a_itens_processo_id_idx ON public.m2a_itens(processo_id);

-- m2a_contratos_snapshot → processos
ALTER TABLE public.m2a_contratos_snapshot
  ADD CONSTRAINT m2a_contratos_snapshot_processo_id_fkey
  FOREIGN KEY (processo_id) REFERENCES public.processos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS m2a_contratos_snapshot_processo_id_idx ON public.m2a_contratos_snapshot(processo_id);

-- m2a_envio_logs → contratos
ALTER TABLE public.m2a_envio_logs
  ADD CONSTRAINT m2a_envio_logs_contrato_id_fkey
  FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS m2a_envio_logs_contrato_id_idx ON public.m2a_envio_logs(contrato_id);
