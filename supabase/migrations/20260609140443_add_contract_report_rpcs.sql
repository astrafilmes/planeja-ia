
-- Function to get details for a single contract report
CREATE OR REPLACE FUNCTION public.get_contract_report_data(p_contract_id uuid)
RETURNS TABLE (
    contract_id uuid,
    numero_contrato text,
    secretaria_nome text,
    secretaria_sigla text,
    preposto text,
    fiscal text,
    objeto text,
    dotacao text,
    m2a_ata_numero text,
    fornecedor_nome text,
    processo_id uuid,
    created_at timestamptz,
    item_id uuid,
    item_ordem integer,
    item_numero text,
    item_lote text,
    item_descricao text,
    item_especificacao text,
    item_unidade text,
    item_quantidade numeric,
    item_valor_unitario numeric,
    item_valor_total numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS contract_id,
        c.numero_contrato,
        c.secretaria_nome,
        c.secretaria_sigla,
        c.preposto,
        c.fiscal,
        c.objeto,
        c.dotacao,
        c.m2a_ata_numero,
        c.fornecedor_nome,
        c.processo_id,
        c.created_at,
        ci.id AS item_id,
        ci.ordem_item,
        ci.numero_item,
        ci.lote,
        ci.descricao AS item_descricao,
        ci.especificacao AS item_especificacao,
        ci.unidade AS item_unidade,
        ci.quantidade AS item_quantidade,
        ci.valor_unitario AS item_valor_unitario,
        ci.valor_total AS item_valor_total
    FROM
        public.contratos c
    LEFT JOIN
        public.contrato_itens ci ON c.id = ci.contrato_id
    WHERE
        c.id = p_contract_id
    ORDER BY
        ci.ordem_item ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_contract_report_data(uuid) TO authenticated;

-- Function to get details for multiple contracts report
CREATE OR REPLACE FUNCTION public.get_multiple_contracts_report_data(p_contract_ids uuid[])
RETURNS TABLE (
    contract_id uuid,
    numero_contrato text,
    secretaria_nome text,
    secretaria_sigla text,
    preposto text,
    fiscal text,
    objeto text,
    dotacao text,
    m2a_ata_numero text,
    fornecedor_nome text,
    processo_id uuid,
    created_at timestamptz,
    item_id uuid,
    item_ordem integer,
    item_numero text,
    item_lote text,
    item_descricao text,
    item_especificacao text,
    item_unidade text,
    item_quantidade numeric,
    item_valor_unitario numeric,
    item_valor_total numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id AS contract_id,
        c.numero_contrato,
        c.secretaria_nome,
        c.secretaria_sigla,
        c.preposto,
        c.fiscal,
        c.objeto,
        c.dotacao,
        c.m2a_ata_numero,
        c.fornecedor_nome,
        c.processo_id,
        c.created_at,
        ci.id AS item_id,
        ci.ordem_item,
        ci.numero_item,
        ci.lote,
        ci.descricao AS item_descricao,
        ci.especificacao AS item_especificacao,
        ci.unidade AS item_unidade,
        ci.quantidade AS item_quantidade,
        ci.valor_unitario AS item_valor_unitario,
        ci.valor_total AS item_valor_total
    FROM
        public.contratos c
    LEFT JOIN
        public.contrato_itens ci ON c.id = ci.contrato_id
    WHERE
        c.id = ANY(p_contract_ids)
    ORDER BY
        c.numero_contrato ASC, ci.ordem_item ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_multiple_contracts_report_data(uuid[]) TO authenticated;