alter table public.secretarias
  add column if not exists m2a_dot_orgao_id text;

comment on column public.secretarias.m2a_dot_orgao_id is
  'ID do órgão usado no formulário de dotação orçamentária da M2A. Este código é diferente da unidade gestora usada para criar o contrato.';
