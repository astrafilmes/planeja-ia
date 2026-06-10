-- Evolui o fluxo de importação para trabalhar com múltiplas atas por processo.
-- O job passa a guardar o processo/M2A usados na varredura e cada item importado
-- recebe o vínculo de ata/item M2A detectado ou selecionado manualmente.

ALTER TABLE public.contrato_import_jobs
  ADD COLUMN IF NOT EXISTS processo_id uuid REFERENCES public.processos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS m2a_url text,
  ADD COLUMN IF NOT EXISTS m2a_processo_id text,
  ADD COLUMN IF NOT EXISTS m2a_sync_at timestamptz;

ALTER TABLE public.contrato_import_itens
  ADD COLUMN IF NOT EXISTS m2a_ata_id text,
  ADD COLUMN IF NOT EXISTS m2a_item_id text,
  ADD COLUMN IF NOT EXISTS m2a_ata_numero text,
  ADD COLUMN IF NOT EXISTS m2a_fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS m2a_match_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS m2a_match_score numeric NOT NULL DEFAULT 0;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS m2a_ata_numero text,
  ADD COLUMN IF NOT EXISTS fornecedor_nome text;

CREATE INDEX IF NOT EXISTS idx_cij_processo ON public.contrato_import_jobs(processo_id);
CREATE INDEX IF NOT EXISTS idx_cij_m2a_processo ON public.contrato_import_jobs(m2a_processo_id);
CREATE INDEX IF NOT EXISTS idx_cii_m2a_ata ON public.contrato_import_itens(m2a_ata_id);
CREATE INDEX IF NOT EXISTS idx_contratos_m2a_ata ON public.contratos(m2a_ata_id);
