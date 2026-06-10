-- Corrige a separação entre Unidade Gestora usada na criação do contrato
-- e Órgão usado no formulário de dotação. A M2A usa códigos diferentes.

update public.m2a_unidades_gestoras
set
  m2a_id = '7771',
  sigla = coalesce(sigla, 'SEJUV'),
  updated_at = now()
where upper(nome) = upper('SECRETARIA DE ESPORTE, JUVENTUDE E LAZER')
  and m2a_id = '10026';

insert into public.m2a_unidades_gestoras (m2a_id, nome, sigla)
select '7771', 'SECRETARIA DE ESPORTE, JUVENTUDE E LAZER', 'SEJUV'
where not exists (
  select 1
  from public.m2a_unidades_gestoras
  where m2a_id = '7771'
     or upper(nome) = upper('SECRETARIA DE ESPORTE, JUVENTUDE E LAZER')
);

update public.secretarias
set
  m2a_dot_orgao_id = case
    when m2a_dot_orgao_id is null or m2a_dot_orgao_id = '' then '10026'
    else m2a_dot_orgao_id
  end,
  m2a_orgao_id = '7771'
where sigla = 'EJL'
   or upper(nome) = upper('SECRETARIA DE ESPORTE, JUVENTUDE E LAZER');
