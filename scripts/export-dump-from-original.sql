-- =====================================================================
-- EXPORTADOR DE DADOS — RODAR NO SQL EDITOR DO SUPABASE ORIGINAL
-- =====================================================================
-- Como usar:
-- 1) Abra o SQL Editor do Supabase ORIGINAL.
-- 2) Cole e rode ESTE arquivo inteiro (cria a função export_table_as_inserts).
-- 3) Rode o bloco "GERAR DUMP" no final — ele retorna 1 coluna de texto
--    com todos os INSERTs prontos, na ordem certa de FKs.
-- 4) Copie o resultado (use "Download as CSV" ou selecione tudo) e cole
--    no SQL Editor deste projeto Lovable Cloud para importar.
--
-- Os INSERTs usam ON CONFLICT (id) DO NOTHING — pode rodar várias vezes
-- sem duplicar.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.export_table_as_inserts(p_table text)
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  v_cols       text;
  v_select     text;
  v_conflict   text;
  v_has_id     boolean;
  v_sql        text;
BEGIN
  -- Lista de colunas na ordem do catálogo
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  IF v_cols IS NULL THEN
    RAISE NOTICE 'Tabela public.% não encontrada — pulando', p_table;
    RETURN;
  END IF;

  -- Expressão SELECT que formata cada valor como literal SQL seguro
  SELECT string_agg(
           'COALESCE(quote_nullable(' || quote_ident(column_name) || '::text), ''NULL'')',
           ' || '', '' || '
           ORDER BY ordinal_position
         )
    INTO v_select
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = p_table;

  -- Detecta se a tabela tem coluna id para usar ON CONFLICT
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'id'
  ) INTO v_has_id;

  v_conflict := CASE WHEN v_has_id THEN ' ON CONFLICT (id) DO NOTHING;' ELSE ' ON CONFLICT DO NOTHING;' END;

  -- Cabeçalho de seção
  RETURN NEXT '-- ============================================================';
  RETURN NEXT '-- ' || p_table;
  RETURN NEXT '-- ============================================================';

  -- Gera os INSERTs
  v_sql := format(
    'SELECT %L || %s || %L FROM public.%I',
    'INSERT INTO public.' || p_table || ' (' || v_cols || ') VALUES (',
    v_select,
    ')' || v_conflict,
    p_table
  );

  RETURN QUERY EXECUTE v_sql;
END;
$$;


-- =====================================================================
-- GERAR DUMP — rode este SELECT depois de criar a função acima
-- =====================================================================
-- A ordem das tabelas respeita as Foreign Keys (pais antes dos filhos).
-- Se alguma tabela do seu projeto não existe, ela é ignorada com NOTICE.

SELECT line
FROM (
  SELECT 1 AS ord, '-- DUMP GERADO EM ' || now()::text AS line
  UNION ALL SELECT 2,  '-- Cole este conteúdo no SQL Editor do projeto destino'
  UNION ALL SELECT 3,  'BEGIN;'
  UNION ALL SELECT 4,  '-- SET session_replication_role = replica;  -- descomente se precisar pular triggers'

  UNION ALL SELECT 10,  l FROM public.export_table_as_inserts('profiles')                  WITH ORDINALITY t(l, n)
  UNION ALL SELECT 20,  l FROM public.export_table_as_inserts('user_roles')                WITH ORDINALITY t(l, n)
  UNION ALL SELECT 30,  l FROM public.export_table_as_inserts('secretarias')               WITH ORDINALITY t(l, n)
  UNION ALL SELECT 40,  l FROM public.export_table_as_inserts('numeracao')                 WITH ORDINALITY t(l, n)
  UNION ALL SELECT 50,  l FROM public.export_table_as_inserts('fornecedores_prepostos')    WITH ORDINALITY t(l, n)
  UNION ALL SELECT 60,  l FROM public.export_table_as_inserts('app_files')                 WITH ORDINALITY t(l, n)

  UNION ALL SELECT 110, l FROM public.export_table_as_inserts('m2a_unidades_gestoras')     WITH ORDINALITY t(l, n)
  UNION ALL SELECT 120, l FROM public.export_table_as_inserts('m2a_servidores')            WITH ORDINALITY t(l, n)
  UNION ALL SELECT 130, l FROM public.export_table_as_inserts('m2a_servidor_unidade')      WITH ORDINALITY t(l, n)
  UNION ALL SELECT 140, l FROM public.export_table_as_inserts('m2a_atas')                  WITH ORDINALITY t(l, n)
  UNION ALL SELECT 150, l FROM public.export_table_as_inserts('m2a_itens')                 WITH ORDINALITY t(l, n)
  UNION ALL SELECT 160, l FROM public.export_table_as_inserts('m2a_contratos_snapshot')    WITH ORDINALITY t(l, n)
  UNION ALL SELECT 170, l FROM public.export_table_as_inserts('m2a_envio_preferencias')    WITH ORDINALITY t(l, n)
  UNION ALL SELECT 180, l FROM public.export_table_as_inserts('m2a_envio_logs')            WITH ORDINALITY t(l, n)

  UNION ALL SELECT 210, l FROM public.export_table_as_inserts('processos')                 WITH ORDINALITY t(l, n)
  UNION ALL SELECT 220, l FROM public.export_table_as_inserts('contratos')                 WITH ORDINALITY t(l, n)
  UNION ALL SELECT 230, l FROM public.export_table_as_inserts('contrato_itens')            WITH ORDINALITY t(l, n)
  UNION ALL SELECT 240, l FROM public.export_table_as_inserts('contrato_item_dotacoes')    WITH ORDINALITY t(l, n)
  UNION ALL SELECT 250, l FROM public.export_table_as_inserts('contrato_atores')           WITH ORDINALITY t(l, n)
  UNION ALL SELECT 260, l FROM public.export_table_as_inserts('contrato_documentos')       WITH ORDINALITY t(l, n)

  UNION ALL SELECT 310, l FROM public.export_table_as_inserts('contrato_import_jobs')      WITH ORDINALITY t(l, n)
  UNION ALL SELECT 320, l FROM public.export_table_as_inserts('contrato_import_itens')     WITH ORDINALITY t(l, n)
  UNION ALL SELECT 330, l FROM public.export_table_as_inserts('contrato_import_dotacoes')  WITH ORDINALITY t(l, n)

  UNION ALL SELECT 410, l FROM public.export_table_as_inserts('irp_jobs')                  WITH ORDINALITY t(l, n)
  UNION ALL SELECT 420, l FROM public.export_table_as_inserts('irp_job_secretarias')       WITH ORDINALITY t(l, n)
  UNION ALL SELECT 430, l FROM public.export_table_as_inserts('irp_unidades_processamento') WITH ORDINALITY t(l, n)

  UNION ALL SELECT 510, l FROM public.export_table_as_inserts('audit_logs')                WITH ORDINALITY t(l, n)

  UNION ALL SELECT 9998, '-- SET session_replication_role = DEFAULT;'
  UNION ALL SELECT 9999, 'COMMIT;'
) s
ORDER BY ord, line;

-- =====================================================================
-- DICAS
-- =====================================================================
-- • No SQL Editor do Supabase, clique em "Download CSV" no resultado para
--   salvar o dump completo. Abra o CSV, remova as aspas externas do CSV
--   (ou use o botão "View as raw") e cole no editor do destino.
-- • Se o resultado for muito grande, exporte por seções: comente as
--   tabelas que não quer e rode o SELECT novamente.
-- • Atenção: profiles.id e user_roles.user_id referenciam auth.users.
--   Os usuários precisam existir no destino ANTES desses INSERTs, senão
--   vai dar erro de FK. Migre auth (via "Migrate project" do Supabase)
--   ou recrie os usuários primeiro.
-- =====================================================================
