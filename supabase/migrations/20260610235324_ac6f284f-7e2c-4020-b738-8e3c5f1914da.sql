
-- ============== 1) TRUSTED DEVICES ==============
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  device_label text,
  user_agent text,
  last_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON public.trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS trusted_devices_active_idx ON public.trusted_devices(expires_at) WHERE revoked_at IS NULL;

GRANT SELECT, UPDATE, DELETE ON public.trusted_devices TO authenticated;
GRANT ALL ON public.trusted_devices TO service_role;

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trusted_devices owner can read" ON public.trusted_devices;
CREATE POLICY "trusted_devices owner can read"
  ON public.trusted_devices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "trusted_devices owner can revoke" ON public.trusted_devices;
CREATE POLICY "trusted_devices owner can revoke"
  ON public.trusted_devices FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "trusted_devices owner can delete" ON public.trusted_devices;
CREATE POLICY "trusted_devices owner can delete"
  ON public.trusted_devices FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- consumo: valida hash, marca uso e devolve user_id se válido.
CREATE OR REPLACE FUNCTION public.consume_trusted_device(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE public.trusted_devices
     SET last_used_at = now()
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL
     AND expires_at > now()
  RETURNING user_id INTO v_user;
  RETURN v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_trusted_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_trusted_device(text) TO service_role;

-- ============== 2) DEDUPE M2A ITENS ==============
CREATE OR REPLACE FUNCTION public.dedupe_m2a_itens(p_processo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_removed integer;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY processo_id,
                          lower(coalesce(trim(numero_item), '')),
                          coalesce(m2a_item_id, '')
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.m2a_itens
     WHERE processo_id = p_processo_id
  ),
  del AS (
    DELETE FROM public.m2a_itens
     WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_removed FROM del;
  RETURN coalesce(v_removed, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_m2a_itens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dedupe_m2a_itens(uuid) TO authenticated, service_role;

-- ============== 3) ÍNDICES ==============
CREATE INDEX IF NOT EXISTS contrato_itens_contrato_idx ON public.contrato_itens(contrato_id);
CREATE INDEX IF NOT EXISTS contrato_item_dotacoes_item_idx ON public.contrato_item_dotacoes(item_id);
CREATE INDEX IF NOT EXISTS m2a_itens_processo_numero_idx ON public.m2a_itens(processo_id, numero_item);
CREATE INDEX IF NOT EXISTS contratos_processo_idx ON public.contratos(processo_id) WHERE deleted_at IS NULL;

-- ============== 4) PAUTA CONSOLIDADA FULL ==============
DROP FUNCTION IF EXISTS public.get_pauta_consolidada_full(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.get_pauta_consolidada_full(
  p_processo_id uuid,
  p_contrato_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  processo_id uuid,
  contrato_id uuid,
  contrato_numero text,
  item_id uuid,
  empresa text,
  item_codigo text,
  lote text,
  numero_item text,
  descricao text,
  especificacao text,
  unidade text,
  quantidade numeric,
  valor_unitario numeric,
  valor_total numeric,
  secretaria_sigla text,
  subcategoria text,
  no_contrato boolean
)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- A) linhas com dotação (item x secretaria) dos contratos SELECIONADOS
  SELECT
    c.processo_id,
    c.id,
    c.numero_contrato,
    ci.id,
    c.fornecedor_nome,
    ci.numero_item,
    ci.lote,
    ci.numero_item,
    COALESCE(ci.descricao, c.objeto),
    ci.especificacao,
    ci.unidade,
    cid.quantidade_alocada,
    ci.valor_unitario,
    ci.valor_total,
    cid.secretaria_sigla,
    cid.dotacao,
    false
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  JOIN public.contrato_item_dotacoes cid ON ci.id = cid.item_id
  WHERE c.processo_id = p_processo_id
    AND c.deleted_at IS NULL
    AND (p_contrato_ids IS NULL OR c.id = ANY(p_contrato_ids))

  UNION ALL

  -- B) TODOS os demais itens do processo (em qualquer contrato do processo)
  --    que NÃO estão entre os selecionados — entram com quantidade 0
  --    para sinalizar "sem contrato selecionado".
  SELECT
    c.processo_id,
    NULL::uuid,
    NULL::text,
    ci.id,
    c.fornecedor_nome,
    ci.numero_item,
    ci.lote,
    ci.numero_item,
    COALESCE(ci.descricao, c.objeto),
    ci.especificacao,
    ci.unidade,
    0::numeric,
    ci.valor_unitario,
    ci.valor_total,
    NULL::text,
    NULL::text,
    true
  FROM public.contratos c
  JOIN public.contrato_itens ci ON c.id = ci.contrato_id
  WHERE c.processo_id = p_processo_id
    AND c.deleted_at IS NULL
    AND p_contrato_ids IS NOT NULL
    AND NOT (c.id = ANY(p_contrato_ids))
    AND NOT EXISTS (
      SELECT 1
        FROM public.contrato_itens ci2
        JOIN public.contratos c2 ON c2.id = ci2.contrato_id
       WHERE c2.processo_id = p_processo_id
         AND c2.deleted_at IS NULL
         AND c2.id = ANY(p_contrato_ids)
         AND lower(coalesce(trim(ci2.lote), '')) = lower(coalesce(trim(ci.lote), ''))
         AND lower(coalesce(trim(ci2.numero_item), '')) = lower(coalesce(trim(ci.numero_item), ''))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_full(uuid, uuid[]) TO authenticated, service_role;
