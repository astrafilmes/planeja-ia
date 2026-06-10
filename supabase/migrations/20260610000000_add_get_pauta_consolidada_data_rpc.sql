-- RPC function to retrieve data for the consolidated pauta export
CREATE OR REPLACE FUNCTION public.get_pauta_consolidada_data(p_processo_id uuid)
RETURNS TABLE (
    processo_id uuid,
    contrato_numero text,
    item_id uuid,
    empresa text,
    item_codigo text,
    lote text,
    numero_item text,
    descricao text,
    unidade text,
    quantidade numeric,
    valor_unitario numeric,
    valor_total numeric,
    secretaria_sigla text,
    subcategoria text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.processo_id,
        c.numero_contrato,
        ci.id AS item_id,
        c.fornecedor_nome AS empresa,
        ci.numero_item AS item_codigo, -- Assuming item_codigo maps to ci.numero_item
        ci.lote,
        ci.numero_item,
        COALESCE(ci.descricao, c.objeto) AS descricao, -- Prioritize item description, fallback to contract object
        ci.unidade,
        cid.quantidade_alocada AS quantidade,
        ci.valor_unitario,
        ci.valor_total,
        cid.secretaria_sigla,
        cid.dotacao AS subcategoria
    FROM
        public.contratos c
    JOIN
        public.contrato_itens ci ON c.id = ci.contrato_id
    JOIN
        public.contrato_item_dotacoes cid ON ci.id = cid.item_id
    WHERE
        c.processo_id = p_processo_id;
END;
$$;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_pauta_consolidada_data(uuid) TO authenticated;