-- Remove servidores M2A descontinuados do catálogo operacional.
-- A limpeza também desvincula secretarias que apontavam para esses códigos,
-- evitando envio acidental de fiscal/gestor inválido para a automação.

WITH removed_fiscais(m2a_id) AS (
  VALUES
    ('38072'), ('40497'), ('41008'), ('41010'), ('41011'), -- LARA FELIX
    ('38039'), -- RENATO
    ('47524'), -- CRISTIANO
    ('38034'), -- ELIANE
    ('38051'), -- TICIANA
    ('38049')  -- EVILANIA
)
UPDATE public.secretarias s
SET
  m2a_fiscal_codigo = NULL,
  m2a_fiscal_nome = NULL,
  m2a_fiscal_cpf = NULL
FROM removed_fiscais rf
WHERE s.m2a_fiscal_codigo = rf.m2a_id;

WITH removed_gestores(m2a_id) AS (
  VALUES ('38021') -- FRANCISCO FONTENELE FILHO
)
UPDATE public.secretarias s
SET
  m2a_gestor_codigo = NULL,
  m2a_gestor_nome = NULL,
  m2a_gestor_cpf = NULL
FROM removed_gestores rg
WHERE s.m2a_gestor_codigo = rg.m2a_id;

DELETE FROM public.m2a_servidores
WHERE cargo = 'FISCAL'
  AND (
    m2a_id IN ('38072', '40497', '41008', '41010', '41011', '38039', '47524', '38034', '38051', '38049')
    OR upper(nome) IN (
      'LARA FÉLIX HENRIQUE DE OLIVEIRA',
      'RENATO DA GUIA OLIVEIRA',
      'CRISTIANO JOSE DOS SANTOS',
      'ELIANE CARNEIRO DO NASCIMENTO',
      'MARIA TICIANA SANTOS ANDRADE',
      'MARIA EVILANIA MARQUES SANTANA'
    )
  );

DELETE FROM public.m2a_servidores
WHERE cargo = 'GESTOR'
  AND (
    m2a_id = '38021'
    OR upper(nome) = 'FRANCISCO FONTENELE FILHO'
  );
