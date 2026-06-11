
-- 1) Limpa os snapshots M2A da duplicata órfã (28f358df) — não há contratos vinculados
DELETE FROM public.m2a_itens              WHERE processo_id = '28f358df-b28f-4dbf-8780-3299fcdbaef3';
DELETE FROM public.m2a_atas               WHERE processo_id = '28f358df-b28f-4dbf-8780-3299fcdbaef3';
DELETE FROM public.m2a_contratos_snapshot WHERE processo_id = '28f358df-b28f-4dbf-8780-3299fcdbaef3';

-- 2) Soft-delete da duplicata
UPDATE public.processos
   SET deleted_at = now(), updated_at = now()
 WHERE id = '28f358df-b28f-4dbf-8780-3299fcdbaef3';

-- 3) Índice único para impedir duplicação futura de m2a_processo_id em processos ativos
CREATE UNIQUE INDEX IF NOT EXISTS uq_processos_m2a_processo_id_ativos
  ON public.processos (m2a_processo_id)
  WHERE deleted_at IS NULL AND m2a_processo_id IS NOT NULL;
