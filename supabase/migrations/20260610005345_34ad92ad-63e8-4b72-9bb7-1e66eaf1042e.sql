CREATE TABLE public.contrato_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text NOT NULL,
  upload_file_id uuid,
  status text NOT NULL DEFAULT 'preview',
  empresa text,
  linha_cabecalho integer,
  total_itens integer NOT NULL DEFAULT 0,
  total_contratos_previstos integer NOT NULL DEFAULT 0,
  total_valor numeric NOT NULL DEFAULT 0,
  error_message text,
  authorized_at timestamptz,
  authorized_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_import_jobs TO authenticated;
GRANT ALL ON public.contrato_import_jobs TO service_role;

ALTER TABLE public.contrato_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cij_all ON public.contrato_import_jobs FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_cij_updated_at BEFORE UPDATE ON public.contrato_import_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.contrato_import_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  source_row integer NOT NULL,
  empresa text,
  lote text,
  numero_item text,
  ordem_item integer,
  descricao text NOT NULL,
  especificacao text,
  unidade text,
  valor_unitario numeric NOT NULL DEFAULT 0,
  excluido boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_import_itens TO authenticated;
GRANT ALL ON public.contrato_import_itens TO service_role;

ALTER TABLE public.contrato_import_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY cii_all ON public.contrato_import_itens FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_cii_job ON public.contrato_import_itens(job_id);

CREATE TRIGGER trg_cii_updated_at BEFORE UPDATE ON public.contrato_import_itens
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.contrato_import_dotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  item_id uuid NOT NULL,
  secretaria_sigla text NOT NULL,
  dotacao text NOT NULL,
  ref_coluna integer NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  ignorado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contrato_import_dotacoes TO authenticated;
GRANT ALL ON public.contrato_import_dotacoes TO service_role;

ALTER TABLE public.contrato_import_dotacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY cid_all ON public.contrato_import_dotacoes FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_cid_job ON public.contrato_import_dotacoes(job_id);
CREATE INDEX idx_cid_item ON public.contrato_import_dotacoes(item_id);

CREATE TRIGGER trg_cid_updated_at BEFORE UPDATE ON public.contrato_import_dotacoes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS import_job_id uuid;
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS dotacao text;