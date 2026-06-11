CREATE OR REPLACE FUNCTION public.normalize_m2a_text(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(lower(coalesce(s, '')), '[^[:alnum:]]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.sync_m2a_snapshot(p_processo_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atas_upserted int := 0;
  v_atas_removed int := 0;
  v_itens_inserted int := 0;
  v_itens_updated int := 0;
  v_itens_removed int := 0;
  v_snapshot_upserted int := 0;
  v_snapshot_orfaos int := 0;
  v_contratos_atualizados int := 0;
  v_relinkados int := 0;
  v_relinkados_pass3 int := 0;
  v_orfaos_limpos int := 0;
  v_ambiguous jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_atas jsonb := coalesce(p_payload->'atas', '[]'::jsonb);
  v_itens jsonb := coalesce(p_payload->'itens', '[]'::jsonb);
  v_contratos jsonb := coalesce(p_payload->'contratos_existentes', '[]'::jsonb);
  v_payload_m2a_processo_id text := nullif(trim(coalesce(p_payload->>'processo_id', '')), '');
  v_expected_m2a_processo_id text := nullif(trim(coalesce(p_payload->>'expected_m2a_processo_id', '')), '');
  v_db_m2a_processo_id text;
  v_payload_item_count int := 0;
  v_local_distinct_items int := 0;
BEGIN
  SELECT m2a_processo_id INTO v_db_m2a_processo_id
    FROM public.processos
   WHERE id = p_processo_id
     AND deleted_at IS NULL;

  IF v_db_m2a_processo_id IS NULL THEN
    RAISE EXCEPTION 'Processo local não encontrado ou excluído: %', p_processo_id;
  END IF;

  v_expected_m2a_processo_id := coalesce(v_expected_m2a_processo_id, v_db_m2a_processo_id);

  IF v_payload_m2a_processo_id IS NOT NULL
     AND v_expected_m2a_processo_id IS NOT NULL
     AND v_payload_m2a_processo_id <> v_expected_m2a_processo_id THEN
    RAISE EXCEPTION 'Snapshot M2A recusado: portal retornou processo %, mas o processo local está configurado para %.', v_payload_m2a_processo_id, v_expected_m2a_processo_id;
  END IF;

  IF v_db_m2a_processo_id IS NOT NULL
     AND v_expected_m2a_processo_id IS NOT NULL
     AND v_db_m2a_processo_id <> v_expected_m2a_processo_id THEN
    RAISE EXCEPTION 'Snapshot M2A recusado: o processo local está configurado para %, mas a sincronização esperava %.', v_db_m2a_processo_id, v_expected_m2a_processo_id;
  END IF;

  SELECT count(*) INTO v_payload_item_count
    FROM jsonb_array_elements(v_itens) i
   WHERE nullif(i->>'id_item', '') IS NOT NULL;

  SELECT count(DISTINCT
           coalesce(co.m2a_ata_id, '') || '|' ||
           coalesce(ci.numero_item, '') || '|' ||
           left(public.normalize_m2a_text(ci.descricao), 48)
         ) INTO v_local_distinct_items
    FROM public.contratos co
    JOIN public.contrato_itens ci ON ci.contrato_id = co.id
   WHERE co.processo_id = p_processo_id
     AND co.deleted_at IS NULL
     AND (coalesce(ci.numero_item, '') <> '' OR coalesce(ci.descricao, '') <> '');

  IF v_local_distinct_items >= 10
     AND v_payload_item_count > 0
     AND v_payload_item_count < greatest(5, floor(v_local_distinct_items * 0.80)::int) THEN
    RAISE EXCEPTION 'Snapshot M2A recusado: o portal retornou apenas % item(ns), mas o processo local possui % item(ns) distintos. Sincronização cancelada para evitar itens incorretos.', v_payload_item_count, v_local_distinct_items;
  END IF;

  WITH src AS (
    SELECT (a->>'id_ata') AS m2a_ata_id,
           (a->>'numero_ata') AS numero_ata,
           (a->'fornecedor'->>'nome') AS fornecedor_nome,
           (a->'fornecedor'->>'cnpj') AS fornecedor_cnpj
      FROM jsonb_array_elements(v_atas) a
     WHERE (a->>'id_ata') IS NOT NULL
  ),
  ups AS (
    INSERT INTO public.m2a_atas
      (processo_id, m2a_ata_id, numero_ata, fornecedor_nome, fornecedor_cnpj, synced_at)
    SELECT p_processo_id, m2a_ata_id, numero_ata, fornecedor_nome, fornecedor_cnpj, now()
      FROM src
    ON CONFLICT (processo_id, m2a_ata_id) DO UPDATE
      SET numero_ata = EXCLUDED.numero_ata,
          fornecedor_nome = EXCLUDED.fornecedor_nome,
          fornecedor_cnpj = EXCLUDED.fornecedor_cnpj,
          synced_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_atas_upserted FROM ups;

  WITH del AS (
    DELETE FROM public.m2a_atas
     WHERE processo_id = p_processo_id
       AND m2a_ata_id NOT IN (
         SELECT (a->>'id_ata')
           FROM jsonb_array_elements(v_atas) a
          WHERE (a->>'id_ata') IS NOT NULL
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_atas_removed FROM del;

  WITH src AS (
    SELECT DISTINCT ON (i->>'id_item')
           (i->>'id_ata') AS m2a_ata_id,
           (i->>'id_item') AS m2a_item_id,
           coalesce(i->>'numero_item', '') AS numero_item,
           coalesce(i->>'descricao', '') AS descricao,
           coalesce(i->>'unidade', '') AS unidade,
           coalesce(NULLIF(i->>'valor_unitario','')::numeric, 0) AS valor_unitario
      FROM jsonb_array_elements(v_itens) i
     WHERE (i->>'id_item') IS NOT NULL
  ),
  ups AS (
    INSERT INTO public.m2a_itens
      (processo_id, m2a_ata_id, m2a_item_id, numero_item, descricao, unidade, valor_unitario)
    SELECT p_processo_id, m2a_ata_id, m2a_item_id, numero_item, descricao, unidade, valor_unitario
      FROM src
    ON CONFLICT (processo_id, m2a_item_id) DO UPDATE
      SET m2a_ata_id = EXCLUDED.m2a_ata_id,
          numero_item = EXCLUDED.numero_item,
          descricao = EXCLUDED.descricao,
          unidade = EXCLUDED.unidade,
          valor_unitario = EXCLUDED.valor_unitario
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
    INTO v_itens_inserted, v_itens_updated
    FROM ups;

  WITH del AS (
    DELETE FROM public.m2a_itens
     WHERE processo_id = p_processo_id
       AND m2a_item_id NOT IN (
         SELECT (i->>'id_item')
           FROM jsonb_array_elements(v_itens) i
          WHERE (i->>'id_item') IS NOT NULL
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_itens_removed FROM del;

  DELETE FROM public.m2a_itens mi
   WHERE mi.processo_id = p_processo_id
     AND NOT EXISTS (
       SELECT 1 FROM public.m2a_atas ma
        WHERE ma.processo_id = mi.processo_id AND ma.m2a_ata_id = mi.m2a_ata_id
     );

  WITH src AS (
    SELECT DISTINCT ON (c->>'id_contrato_m2a')
           (c->>'id_contrato_m2a') AS m2a_contrato_id,
           (c->>'numero_contrato') AS numero_contrato,
           (c->>'id_ata') AS m2a_ata_id,
           (c->>'sigla_secretaria') AS sigla_secretaria,
           NULLIF(c->>'ano','')::int AS ano,
           NULLIF(c->>'sequencia','')::int AS sequencia,
           c AS raw
      FROM jsonb_array_elements(v_contratos) c
     WHERE (c->>'id_contrato_m2a') IS NOT NULL
  ),
  ups AS (
    INSERT INTO public.m2a_contratos_snapshot
      (processo_id, m2a_contrato_id, numero_contrato, m2a_ata_id, sigla_secretaria, ano, sequencia, raw)
    SELECT p_processo_id, m2a_contrato_id, numero_contrato, m2a_ata_id, sigla_secretaria, ano, sequencia, raw
      FROM src
    ON CONFLICT (processo_id, m2a_contrato_id) DO UPDATE
      SET numero_contrato = EXCLUDED.numero_contrato,
          m2a_ata_id = EXCLUDED.m2a_ata_id,
          sigla_secretaria = EXCLUDED.sigla_secretaria,
          ano = EXCLUDED.ano,
          sequencia = EXCLUDED.sequencia,
          raw = EXCLUDED.raw
    RETURNING 1
  )
  SELECT count(*) INTO v_snapshot_upserted FROM ups;

  DELETE FROM public.m2a_contratos_snapshot
   WHERE processo_id = p_processo_id
     AND m2a_contrato_id NOT IN (
       SELECT (c->>'id_contrato_m2a')
         FROM jsonb_array_elements(v_contratos) c
        WHERE (c->>'id_contrato_m2a') IS NOT NULL
     );

  WITH del AS (
    DELETE FROM public.m2a_contratos_snapshot s
     WHERE s.processo_id = p_processo_id
       AND s.m2a_ata_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.m2a_atas ma
          WHERE ma.processo_id = s.processo_id AND ma.m2a_ata_id = s.m2a_ata_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_snapshot_orfaos FROM del;

  WITH cleared AS (
    UPDATE public.contrato_itens ci
       SET m2a_item_id = NULL
      FROM public.contratos co
     WHERE co.id = ci.contrato_id
       AND co.processo_id = p_processo_id
       AND co.deleted_at IS NULL
       AND ci.m2a_item_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.m2a_itens mi
          WHERE mi.processo_id = p_processo_id
            AND mi.m2a_item_id = ci.m2a_item_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_orfaos_limpos FROM cleared;

  WITH ata_info AS (
    SELECT m2a_ata_id, numero_ata, fornecedor_nome
      FROM public.m2a_atas
     WHERE processo_id = p_processo_id
  ),
  src AS (
    SELECT (c->>'id_contrato_m2a') AS m2a_contrato_id,
           (c->>'numero_contrato') AS numero_contrato,
           (c->>'id_ata') AS id_ata
      FROM jsonb_array_elements(v_contratos) c
  ),
  joined AS (
    SELECT co.id, s.id_ata, ai.numero_ata, ai.fornecedor_nome
      FROM src s
      LEFT JOIN ata_info ai ON ai.m2a_ata_id = s.id_ata
      JOIN public.contratos co
        ON co.processo_id = p_processo_id
       AND co.deleted_at IS NULL
       AND (co.m2a_contrato_id = s.m2a_contrato_id OR lower(trim(coalesce(co.numero_contrato,''))) = lower(trim(coalesce(s.numero_contrato,''))))
  ),
  upd AS (
    UPDATE public.contratos co
       SET m2a_ata_numero = coalesce(j.numero_ata, co.m2a_ata_numero),
           fornecedor_nome = coalesce(j.fornecedor_nome, co.fornecedor_nome),
           m2a_ata_id = coalesce(j.id_ata, co.m2a_ata_id)
      FROM joined j
     WHERE co.id = j.id
       AND ((j.numero_ata IS NOT NULL AND co.m2a_ata_numero IS DISTINCT FROM j.numero_ata)
         OR (j.fornecedor_nome IS NOT NULL AND co.fornecedor_nome IS DISTINCT FROM j.fornecedor_nome)
         OR (j.id_ata IS NOT NULL AND co.m2a_ata_id IS DISTINCT FROM j.id_ata))
    RETURNING 1
  )
  SELECT count(*) INTO v_contratos_atualizados FROM upd;

  UPDATE public.contrato_itens ci
     SET valor_unitario = mi.valor_unitario,
         valor_total = round((ci.quantidade * mi.valor_unitario)::numeric, 4),
         descricao = CASE WHEN coalesce(ci.descricao,'') = '' AND mi.descricao <> '' THEN mi.descricao ELSE ci.descricao END,
         unidade = CASE WHEN coalesce(ci.unidade,'') = '' AND mi.unidade <> '' THEN mi.unidade ELSE ci.unidade END,
         numero_item = CASE WHEN coalesce(ci.numero_item,'') = '' AND mi.numero_item <> '' THEN mi.numero_item ELSE ci.numero_item END
    FROM public.m2a_itens mi,
         public.contratos co
   WHERE mi.processo_id = p_processo_id
     AND co.id = ci.contrato_id
     AND co.processo_id = p_processo_id
     AND co.deleted_at IS NULL
     AND ci.m2a_item_id IS NOT NULL
     AND ci.m2a_item_id = mi.m2a_item_id
     AND (ci.valor_unitario IS DISTINCT FROM mi.valor_unitario
       OR (coalesce(ci.descricao,'') = '' AND mi.descricao <> '')
       OR (coalesce(ci.unidade,'') = '' AND mi.unidade <> '')
       OR (coalesce(ci.numero_item,'') = '' AND mi.numero_item <> ''));

  WITH legacy AS (
    SELECT ci.id AS ci_id, ci.quantidade, public.normalize_numero_item(ci.numero_item) AS norm_num, lower(trim(coalesce(co.fornecedor_nome,''))) AS forn
      FROM public.contrato_itens ci
      JOIN public.contratos co ON co.id = ci.contrato_id
     WHERE co.processo_id = p_processo_id
       AND co.deleted_at IS NULL
       AND ci.m2a_item_id IS NULL
       AND public.normalize_numero_item(ci.numero_item) IS NOT NULL
  ),
  candidates AS (
    SELECT mi.m2a_item_id, mi.numero_item, mi.descricao, mi.unidade, mi.valor_unitario, public.normalize_numero_item(mi.numero_item) AS norm_num, lower(trim(coalesce(ma.fornecedor_nome,''))) AS forn
      FROM public.m2a_itens mi
      JOIN public.m2a_atas ma ON ma.processo_id = mi.processo_id AND ma.m2a_ata_id = mi.m2a_ata_id
     WHERE mi.processo_id = p_processo_id
  ),
  matched AS (
    SELECT l.ci_id, l.quantidade, c.m2a_item_id, c.numero_item, c.descricao, c.unidade, c.valor_unitario, count(*) OVER (PARTITION BY l.ci_id) AS n
      FROM legacy l
      JOIN candidates c ON c.norm_num = l.norm_num AND c.forn = l.forn AND l.forn <> ''
  ),
  unique_match AS (
    SELECT DISTINCT ci_id, quantidade, m2a_item_id, numero_item, descricao, unidade, valor_unitario FROM matched WHERE n = 1
  ),
  upd2 AS (
    UPDATE public.contrato_itens ci
       SET m2a_item_id = um.m2a_item_id,
           numero_item = CASE WHEN coalesce(ci.numero_item,'') = '' THEN um.numero_item ELSE ci.numero_item END,
           descricao = CASE WHEN coalesce(ci.descricao,'') = '' AND um.descricao <> '' THEN um.descricao ELSE ci.descricao END,
           unidade = CASE WHEN coalesce(ci.unidade,'') = '' AND um.unidade <> '' THEN um.unidade ELSE ci.unidade END,
           valor_unitario = um.valor_unitario,
           valor_total = round((um.quantidade * um.valor_unitario)::numeric, 4)
      FROM unique_match um
     WHERE ci.id = um.ci_id
    RETURNING 1
  )
  SELECT count(*) INTO v_relinkados FROM upd2;

  WITH legacy AS (
    SELECT ci.id AS ci_id, ci.quantidade, public.normalize_numero_item(ci.numero_item) AS norm_num
      FROM public.contrato_itens ci
      JOIN public.contratos co ON co.id = ci.contrato_id
     WHERE co.processo_id = p_processo_id
       AND co.deleted_at IS NULL
       AND ci.m2a_item_id IS NULL
       AND public.normalize_numero_item(ci.numero_item) IS NOT NULL
  ),
  candidates AS (
    SELECT mi.m2a_item_id, mi.numero_item, mi.descricao, mi.unidade, mi.valor_unitario, public.normalize_numero_item(mi.numero_item) AS norm_num
      FROM public.m2a_itens mi
     WHERE mi.processo_id = p_processo_id
  ),
  matched AS (
    SELECT l.ci_id, l.quantidade, c.m2a_item_id, c.numero_item, c.descricao, c.unidade, c.valor_unitario, count(*) OVER (PARTITION BY l.ci_id) AS n_ci
      FROM legacy l
      JOIN candidates c ON c.norm_num = l.norm_num
  ),
  unique_match AS (
    SELECT DISTINCT ci_id, quantidade, m2a_item_id, numero_item, descricao, unidade, valor_unitario FROM matched WHERE n_ci = 1
  ),
  upd3 AS (
    UPDATE public.contrato_itens ci
       SET m2a_item_id = um.m2a_item_id,
           numero_item = CASE WHEN coalesce(ci.numero_item,'') = '' THEN um.numero_item ELSE ci.numero_item END,
           descricao = CASE WHEN coalesce(ci.descricao,'') = '' AND um.descricao <> '' THEN um.descricao ELSE ci.descricao END,
           unidade = CASE WHEN coalesce(ci.unidade,'') = '' AND um.unidade <> '' THEN um.unidade ELSE ci.unidade END,
           valor_unitario = um.valor_unitario,
           valor_total = round((um.quantidade * um.valor_unitario)::numeric, 4)
      FROM unique_match um
     WHERE ci.id = um.ci_id
    RETURNING 1
  )
  SELECT count(*) INTO v_relinkados_pass3 FROM upd3;

  v_relinkados := v_relinkados + v_relinkados_pass3;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'contrato_item_id', ci.id,
    'contrato_id', ci.contrato_id,
    'numero_contrato', co.numero_contrato,
    'numero_item', ci.numero_item,
    'descricao', ci.descricao
  )), '[]'::jsonb) INTO v_ambiguous
    FROM public.contrato_itens ci
    JOIN public.contratos co ON co.id = ci.contrato_id
   WHERE co.processo_id = p_processo_id
     AND co.deleted_at IS NULL
     AND ci.m2a_item_id IS NULL;

  UPDATE public.processos
     SET m2a_sync_at = now(), updated_at = now()
   WHERE id = p_processo_id;

  RETURN jsonb_build_object(
    'atas_upserted', v_atas_upserted,
    'atas_removed', v_atas_removed,
    'itens_inserted', v_itens_inserted,
    'itens_updated', v_itens_updated,
    'itens_removed', v_itens_removed,
    'contratos_snapshot', v_snapshot_upserted,
    'snapshots_orfaos_removidos', v_snapshot_orfaos,
    'contratos_atualizados', v_contratos_atualizados,
    'orfaos_limpos', v_orfaos_limpos,
    'itens_relinkados', v_relinkados,
    'itens_ambiguos', v_ambiguous,
    'warnings', v_warnings
  );
END;
$function$;