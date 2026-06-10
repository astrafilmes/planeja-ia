-- =====================================================================
-- IMPORTAÇÃO DE DADOS DO SUPABASE ORIGINAL -> PROJETO ATUAL
-- =====================================================================
-- Este script copia os dados de todas as tabelas do schema public.
-- Estrutura (tabelas, RLS, funções) já deve existir nos dois lados.
--
-- ⚠️ Ordem das tabelas respeita as Foreign Keys.
-- ⚠️ Rode em uma TRANSACTION. Se algo falhar, ROLLBACK.
-- ⚠️ Faça BACKUP antes.
-- =====================================================================


-- =====================================================================
-- OPÇÃO A — IMPORTAR VIA dblink (mais rápido, 1 comando)
-- =====================================================================
-- Pré-requisitos:
--   1) Habilitar a extensão no projeto destino (este):
--        CREATE EXTENSION IF NOT EXISTS dblink;
--   2) Ter a connection string do Supabase ORIGINAL:
--        host=db.<ref>.supabase.co port=5432 dbname=postgres
--        user=postgres password=<SENHA>
--   3) Substitua <CONN> abaixo pela string acima.
--
-- Dica: rode UMA tabela por vez, valide o COUNT(*), depois passe para a próxima.

-- CREATE EXTENSION IF NOT EXISTS dblink;

BEGIN;

-- (Opcional) Desabilita gatilhos durante a carga para evitar handle_new_user etc.
-- SET session_replication_role = replica;

-- ---------- 1. Tabelas base (sem dependências internas) ----------
INSERT INTO public.profiles
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.profiles')
AS t(id uuid, nome text, email text, avatar_url text, created_at timestamptz, updated_at timestamptz)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.user_roles')
AS t(id uuid, user_id uuid, role app_role, created_at timestamptz)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.secretarias
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.secretarias') AS t(LIKE public.secretarias)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.numeracao
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.numeracao') AS t(LIKE public.numeracao)
ON CONFLICT (secretaria_num) DO NOTHING;

INSERT INTO public.fornecedores_prepostos
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.fornecedores_prepostos') AS t(LIKE public.fornecedores_prepostos)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_files
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.app_files') AS t(LIKE public.app_files)
ON CONFLICT (id) DO NOTHING;

-- ---------- 2. M2A (catálogo) ----------
INSERT INTO public.m2a_unidades_gestoras
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_unidades_gestoras') AS t(LIKE public.m2a_unidades_gestoras)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_servidores
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_servidores') AS t(LIKE public.m2a_servidores)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_servidor_unidade
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_servidor_unidade') AS t(LIKE public.m2a_servidor_unidade)
ON CONFLICT DO NOTHING;

INSERT INTO public.m2a_atas
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_atas') AS t(LIKE public.m2a_atas)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_itens
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_itens') AS t(LIKE public.m2a_itens)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_contratos_snapshot
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_contratos_snapshot') AS t(LIKE public.m2a_contratos_snapshot)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_envio_preferencias
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_envio_preferencias') AS t(LIKE public.m2a_envio_preferencias)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.m2a_envio_logs
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.m2a_envio_logs') AS t(LIKE public.m2a_envio_logs)
ON CONFLICT (id) DO NOTHING;

-- ---------- 3. Processos / Contratos ----------
INSERT INTO public.processos
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.processos') AS t(LIKE public.processos)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contratos
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contratos') AS t(LIKE public.contratos)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_itens
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_itens') AS t(LIKE public.contrato_itens)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_item_dotacoes
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_item_dotacoes') AS t(LIKE public.contrato_item_dotacoes)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_atores
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_atores') AS t(LIKE public.contrato_atores)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_documentos
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_documentos') AS t(LIKE public.contrato_documentos)
ON CONFLICT (id) DO NOTHING;

-- ---------- 4. Importação de contratos (jobs) ----------
INSERT INTO public.contrato_import_jobs
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_import_jobs') AS t(LIKE public.contrato_import_jobs)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_import_itens
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_import_itens') AS t(LIKE public.contrato_import_itens)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contrato_import_dotacoes
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.contrato_import_dotacoes') AS t(LIKE public.contrato_import_dotacoes)
ON CONFLICT (id) DO NOTHING;

-- ---------- 5. IRP ----------
INSERT INTO public.irp_jobs
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.irp_jobs') AS t(LIKE public.irp_jobs)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.irp_job_secretarias
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.irp_job_secretarias') AS t(LIKE public.irp_job_secretarias)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.irp_unidades_processamento
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.irp_unidades_processamento') AS t(LIKE public.irp_unidades_processamento)
ON CONFLICT (id) DO NOTHING;

-- ---------- 6. Auditoria ----------
INSERT INTO public.audit_logs
SELECT * FROM dblink('<CONN>', 'SELECT * FROM public.audit_logs') AS t(LIKE public.audit_logs)
ON CONFLICT (id) DO NOTHING;

-- SET session_replication_role = DEFAULT;

-- Confira os totais antes de confirmar:
-- SELECT 'contratos' AS t, count(*) FROM public.contratos
-- UNION ALL SELECT 'processos', count(*) FROM public.processos
-- UNION ALL SELECT 'contrato_itens', count(*) FROM public.contrato_itens;

COMMIT;
-- ROLLBACK;  -- use se algo der errado


-- =====================================================================
-- OPÇÃO B — IMPORTAR VIA CSV (sem dblink)
-- =====================================================================
-- 1) No projeto ORIGINAL, exporte cada tabela (rodando no psql do original):
--
--    \copy public.profiles                  TO 'profiles.csv'                  CSV HEADER
--    \copy public.user_roles                TO 'user_roles.csv'                CSV HEADER
--    \copy public.secretarias               TO 'secretarias.csv'               CSV HEADER
--    \copy public.numeracao                 TO 'numeracao.csv'                 CSV HEADER
--    \copy public.fornecedores_prepostos    TO 'fornecedores_prepostos.csv'    CSV HEADER
--    \copy public.app_files                 TO 'app_files.csv'                 CSV HEADER
--    \copy public.m2a_unidades_gestoras     TO 'm2a_unidades_gestoras.csv'     CSV HEADER
--    \copy public.m2a_servidores            TO 'm2a_servidores.csv'            CSV HEADER
--    \copy public.m2a_servidor_unidade      TO 'm2a_servidor_unidade.csv'      CSV HEADER
--    \copy public.m2a_atas                  TO 'm2a_atas.csv'                  CSV HEADER
--    \copy public.m2a_itens                 TO 'm2a_itens.csv'                 CSV HEADER
--    \copy public.m2a_contratos_snapshot    TO 'm2a_contratos_snapshot.csv'    CSV HEADER
--    \copy public.m2a_envio_preferencias    TO 'm2a_envio_preferencias.csv'    CSV HEADER
--    \copy public.m2a_envio_logs            TO 'm2a_envio_logs.csv'            CSV HEADER
--    \copy public.processos                 TO 'processos.csv'                 CSV HEADER
--    \copy public.contratos                 TO 'contratos.csv'                 CSV HEADER
--    \copy public.contrato_itens            TO 'contrato_itens.csv'            CSV HEADER
--    \copy public.contrato_item_dotacoes    TO 'contrato_item_dotacoes.csv'    CSV HEADER
--    \copy public.contrato_atores           TO 'contrato_atores.csv'           CSV HEADER
--    \copy public.contrato_documentos       TO 'contrato_documentos.csv'       CSV HEADER
--    \copy public.contrato_import_jobs      TO 'contrato_import_jobs.csv'      CSV HEADER
--    \copy public.contrato_import_itens     TO 'contrato_import_itens.csv'     CSV HEADER
--    \copy public.contrato_import_dotacoes  TO 'contrato_import_dotacoes.csv'  CSV HEADER
--    \copy public.irp_jobs                  TO 'irp_jobs.csv'                  CSV HEADER
--    \copy public.irp_job_secretarias       TO 'irp_job_secretarias.csv'       CSV HEADER
--    \copy public.irp_unidades_processamento TO 'irp_unidades_processamento.csv' CSV HEADER
--    \copy public.audit_logs                TO 'audit_logs.csv'                CSV HEADER
--
-- 2) No projeto DESTINO (este), importe na MESMA ordem do bloco acima
--    (de cima para baixo — respeita FKs):
--
--    BEGIN;
--    -- SET session_replication_role = replica;
--    \copy public.profiles                  FROM 'profiles.csv'                  CSV HEADER
--    \copy public.user_roles                FROM 'user_roles.csv'                CSV HEADER
--    \copy public.secretarias               FROM 'secretarias.csv'               CSV HEADER
--    \copy public.numeracao                 FROM 'numeracao.csv'                 CSV HEADER
--    \copy public.fornecedores_prepostos    FROM 'fornecedores_prepostos.csv'    CSV HEADER
--    \copy public.app_files                 FROM 'app_files.csv'                 CSV HEADER
--    \copy public.m2a_unidades_gestoras     FROM 'm2a_unidades_gestoras.csv'     CSV HEADER
--    \copy public.m2a_servidores            FROM 'm2a_servidores.csv'            CSV HEADER
--    \copy public.m2a_servidor_unidade      FROM 'm2a_servidor_unidade.csv'      CSV HEADER
--    \copy public.m2a_atas                  FROM 'm2a_atas.csv'                  CSV HEADER
--    \copy public.m2a_itens                 FROM 'm2a_itens.csv'                 CSV HEADER
--    \copy public.m2a_contratos_snapshot    FROM 'm2a_contratos_snapshot.csv'    CSV HEADER
--    \copy public.m2a_envio_preferencias    FROM 'm2a_envio_preferencias.csv'    CSV HEADER
--    \copy public.m2a_envio_logs            FROM 'm2a_envio_logs.csv'            CSV HEADER
--    \copy public.processos                 FROM 'processos.csv'                 CSV HEADER
--    \copy public.contratos                 FROM 'contratos.csv'                 CSV HEADER
--    \copy public.contrato_itens            FROM 'contrato_itens.csv'            CSV HEADER
--    \copy public.contrato_item_dotacoes    FROM 'contrato_item_dotacoes.csv'    CSV HEADER
--    \copy public.contrato_atores           FROM 'contrato_atores.csv'           CSV HEADER
--    \copy public.contrato_documentos       FROM 'contrato_documentos.csv'       CSV HEADER
--    \copy public.contrato_import_jobs      FROM 'contrato_import_jobs.csv'      CSV HEADER
--    \copy public.contrato_import_itens     FROM 'contrato_import_itens.csv'     CSV HEADER
--    \copy public.contrato_import_dotacoes  FROM 'contrato_import_dotacoes.csv'  CSV HEADER
--    \copy public.irp_jobs                  FROM 'irp_jobs.csv'                  CSV HEADER
--    \copy public.irp_job_secretarias       FROM 'irp_job_secretarias.csv'       CSV HEADER
--    \copy public.irp_unidades_processamento FROM 'irp_unidades_processamento.csv' CSV HEADER
--    \copy public.audit_logs                FROM 'audit_logs.csv'                CSV HEADER
--    -- SET session_replication_role = DEFAULT;
--    COMMIT;
--
-- ⚠️ Atenção: linhas de profiles/user_roles dependem de IDs existentes em
--    auth.users. Se os usuários do projeto original NÃO existem aqui, esses
--    INSERTs vão falhar por FK. Migre auth.users primeiro (via Supabase
--    "Migrate project") ou recrie os usuários antes.
-- =====================================================================
