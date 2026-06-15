
ALTER TABLE public.irp_jobs
  ADD COLUMN IF NOT EXISTS m2a_processo_id text,
  ADD COLUMN IF NOT EXISTS m2a_processo_numero text,
  ADD COLUMN IF NOT EXISTS objeto text,
  ADD COLUMN IF NOT EXISTS data_processo date,
  ADD COLUMN IF NOT EXISTS ano_orcamento integer,
  ADD COLUMN IF NOT EXISTS orgao_solicitante_id uuid REFERENCES public.m2a_unidades_gestoras(id_local) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unidade_orcamentaria_id uuid REFERENCES public.m2a_unidades_gestoras(id_local) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_dfd_id uuid REFERENCES public.m2a_servidores(id_local) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comissao_planejamento text,
  ADD COLUMN IF NOT EXISTS classificacao text,
  ADD COLUMN IF NOT EXISTS m2a_envio_status text NOT NULL DEFAULT 'nao_enviado',
  ADD COLUMN IF NOT EXISTS m2a_envio_etapa text,
  ADD COLUMN IF NOT EXISTS m2a_envio_mensagem text,
  ADD COLUMN IF NOT EXISTS m2a_envio_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS m2a_envio_completed_at timestamptz;

ALTER TABLE public.irp_job_secretarias
  ADD COLUMN IF NOT EXISTS dotacao_orgao text,
  ADD COLUMN IF NOT EXISTS dotacao_uo text,
  ADD COLUMN IF NOT EXISTS dotacao_projeto_atividade text,
  ADD COLUMN IF NOT EXISTS fiscal_servidor_id uuid REFERENCES public.m2a_servidores(id_local) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gestor_servidor_id uuid REFERENCES public.m2a_servidores(id_local) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS m2a_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS m2a_mensagem text,
  ADD COLUMN IF NOT EXISTS m2a_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS m2a_completed_at timestamptz;

ALTER TABLE public.irp_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.irp_job_secretarias REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.irp_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.irp_job_secretarias;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
