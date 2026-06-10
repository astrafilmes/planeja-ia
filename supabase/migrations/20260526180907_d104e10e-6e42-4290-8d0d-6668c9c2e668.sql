
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin','gestor','operador','consulta');

-- USER ROLES (criada antes de profiles porque has_role é usada nas políticas)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create policy "user_roles_select_own" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "user_roles_admin_all" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());

-- Auto profile + role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email);
  if (select count(*) from public.user_roles) = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'operador');
  end if;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- SECRETARIAS
create table public.secretarias (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  nome text not null,
  sigla text not null,
  ativa boolean not null default true,
  origem_legada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index secretarias_numero_idx on public.secretarias(numero);
create index secretarias_sigla_idx on public.secretarias(sigla);
grant select, insert, update, delete on public.secretarias to authenticated;
grant all on public.secretarias to service_role;
alter table public.secretarias enable row level security;
create policy "sec_select_auth" on public.secretarias for select to authenticated using (true);
create policy "sec_modify_gestor" on public.secretarias for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'));
create trigger sec_touch before update on public.secretarias for each row execute function public.touch_updated_at();

create table public.numeracao (
  secretaria_num integer primary key,
  contador integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.numeracao to authenticated;
grant all on public.numeracao to service_role;
alter table public.numeracao enable row level security;
create policy "num_select" on public.numeracao for select to authenticated using (true);
create policy "num_update" on public.numeracao for all to authenticated using (true) with check (true);

create table public.irp_unidades_processamento (
  id uuid primary key default gen_random_uuid(),
  secretaria_id uuid references public.secretarias(id) on delete set null,
  nome text not null,
  numero integer not null,
  ref_coluna integer not null,
  ordem integer not null default 0,
  ativa boolean not null default true,
  origem_legada boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index irp_unidades_ref_coluna_idx on public.irp_unidades_processamento(ref_coluna);
grant select, insert, update, delete on public.irp_unidades_processamento to authenticated;
grant all on public.irp_unidades_processamento to service_role;
alter table public.irp_unidades_processamento enable row level security;
create policy "uni_select" on public.irp_unidades_processamento for select to authenticated using (true);
create policy "uni_modify" on public.irp_unidades_processamento for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'));

create table public.processos (
  id uuid primary key default gen_random_uuid(),
  numero_processo text,
  ano integer,
  modalidade text,
  objeto text not null,
  status text not null default 'rascunho' check (status in ('rascunho','em_andamento','concluido','cancelado','arquivado')),
  data_abertura date,
  secretaria_id uuid references public.secretarias(id) on delete set null,
  observacoes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index processos_numero_idx on public.processos(numero_processo);
create index processos_status_idx on public.processos(status);
grant select, insert, update, delete on public.processos to authenticated;
grant all on public.processos to service_role;
alter table public.processos enable row level security;
create policy "proc_select" on public.processos for select to authenticated using (true);
create policy "proc_insert" on public.processos for insert to authenticated with check (true);
create policy "proc_update" on public.processos for update to authenticated using (true);
create policy "proc_delete" on public.processos for delete to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'));
create trigger proc_touch before update on public.processos for each row execute function public.touch_updated_at();

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  processo_id uuid references public.processos(id) on delete set null,
  numero_contrato text not null,
  secretaria_num integer not null,
  secretaria_id uuid references public.secretarias(id) on delete set null,
  secretaria_nome text not null,
  secretaria_sigla text not null,
  preposto text not null,
  objeto text not null,
  data date,
  data_texto_legado text,
  fiscal text not null,
  link_contrato text not null,
  status text not null default 'ativo' check (status in ('ativo','encerrado','cancelado','rascunho')),
  data_criacao_legada text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contratos_numero_idx on public.contratos(numero_contrato);
create index contratos_secretaria_num_idx on public.contratos(secretaria_num);
create index contratos_link_idx on public.contratos(link_contrato);
grant select, insert, update, delete on public.contratos to authenticated;
grant all on public.contratos to service_role;
alter table public.contratos enable row level security;
create policy "con_select" on public.contratos for select to authenticated using (true);
create policy "con_insert" on public.contratos for insert to authenticated with check (true);
create policy "con_update" on public.contratos for update to authenticated using (true);
create policy "con_delete" on public.contratos for delete to authenticated using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'));
create trigger con_touch before update on public.contratos for each row execute function public.touch_updated_at();

create table public.app_files (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  storage_path text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  file_kind text not null check (file_kind in ('irp_upload','irp_template','irp_export','portal_export','pdf_contrato','pdf_convocacao','zip_export','outro')),
  checksum text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index app_files_kind_idx on public.app_files(file_kind);
grant select, insert, update, delete on public.app_files to authenticated;
grant all on public.app_files to service_role;
alter table public.app_files enable row level security;
create policy "files_select" on public.app_files for select to authenticated using (true);
create policy "files_insert" on public.app_files for insert to authenticated with check (true);
create policy "files_delete" on public.app_files for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.irp_jobs (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references public.processos(id) on delete set null,
  upload_file_id uuid references public.app_files(id) on delete set null,
  status text not null default 'uploaded' check (status in ('uploaded','analyzing','analyzed','generating','completed','failed','cancelled')),
  original_filename text not null,
  linha_cabecalho integer,
  idx_natureza integer,
  idx_descricao integer,
  idx_especificacao integer,
  idx_unidade integer,
  total_secretarias integer not null default 0,
  secretarias_com_itens integer not null default 0,
  secretarias_sem_itens integer not null default 0,
  total_linhas integer not null default 0,
  total_valor numeric(14,2) not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index irp_jobs_status_idx on public.irp_jobs(status);
create index irp_jobs_created_at_idx on public.irp_jobs(created_at desc);
grant select, insert, update, delete on public.irp_jobs to authenticated;
grant all on public.irp_jobs to service_role;
alter table public.irp_jobs enable row level security;
create policy "jobs_all" on public.irp_jobs for all to authenticated using (true) with check (true);
create trigger jobs_touch before update on public.irp_jobs for each row execute function public.touch_updated_at();

create table public.irp_job_secretarias (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.irp_jobs(id) on delete cascade,
  unidade_id uuid references public.irp_unidades_processamento(id) on delete set null,
  numero integer not null,
  nome text not null,
  ref_coluna integer not null,
  cabecalho_coluna text not null,
  itens_validos integer not null default 0,
  soma_valor numeric(14,2) not null default 0,
  status text not null default 'pendente' check (status in ('pendente','sem_itens','exportado','erro')),
  erro text,
  output_file_id uuid references public.app_files(id) on delete set null,
  output_filename text,
  created_at timestamptz not null default now()
);
create index irp_job_secretarias_job_idx on public.irp_job_secretarias(job_id);
grant select, insert, update, delete on public.irp_job_secretarias to authenticated;
grant all on public.irp_job_secretarias to service_role;
alter table public.irp_job_secretarias enable row level security;
create policy "jobs_sec_all" on public.irp_job_secretarias for all to authenticated using (true) with check (true);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_payload jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "audit_insert" on public.audit_logs for insert to authenticated with check (true);
create policy "audit_select_admin" on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'gestor'));

insert into public.secretarias (numero, nome, sigla, origem_legada) values
(1,'GABINETE DO PREFEITO','GAB',true),
(2,'CONTROLADORIA GERAL DO MUNICIPIO','CGM',true),
(3,'SECRETARIA DE ADMINISTRACAO, FINANCAS E PLANEJAMENTO','ADM',true),
(4,'SECRETARIA DE INFRAESTRUTURA, MOBILIDADE E SERV. PUBLICOS','INF',true),
(5,'SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA','DES',true),
(6,'SECRETARIA DE ESPORTE, JUVENTUDE E LAZER','EJL',true),
(7,'SECRETARIA MUNICIPAL DE EDUCACAO','SME',true),
(8,'SECRETARIA MUNICIPAL DE SAUDE','SMS',true),
(9,'SECRETARIA MUNICIPAL DE PROTECAO SOCIAL E CIDADANIA','SPS',true),
(10,'SECRETARIA DE MEIO AMBIENTE, TURISMO E CULTURA','MAT',true),
(90,'PREVIDENCIA','PREV',true);

insert into public.numeracao (secretaria_num, contador) values
(1,3),(2,2),(3,6),(4,3),(5,3),(6,3),(7,9),(8,16),(9,15),(10,3),(90,0);

insert into public.irp_unidades_processamento (nome, numero, ref_coluna, ordem, origem_legada) values
('GABINETE DO PREFEITO',2,21,1,true),
('CONTROLADORIA GERAL DO MUNICIPIO',1,11,2,true),
('SECRETARIA MUNICIPAL DE ADMINISTRACAO, FINANCAS, E PLANEJAMENTO',3,9,3,true),
('SECRETARIA MUNICIPAL DE INFRAESTRUTURA, MOBILIDADE E SERVICOS PUBLICOS',4,23,4,true),
('SECRETARIA MUNICIPAL DE DESENVOLVIMENTO RURAL E PESCA (SDRP)',5,15,5,true),
('SECRETARIA MUNICIPAL DE ESPORTE, JUVENTUDE E LAZER',6,17,6,true),
('SECRETARIA MUNICIPAL DA EDUCACAO - FUNDEB',7,30,7,true),
('SECRETARIA MUNICIPAL DA EDUCACAO - SEC',7,27,8,true),
('SECRETARIA MUNICIPAL DA SAUDE - HOSPITAL',8,35,9,true),
('SECRETARIA MUNICIPAL DA SAUDE - FMS',8,40,10,true),
('SECRETARIA MUNICIPAL DA SAUDE - SEC',8,33,11,true),
('SECRETARIA MUNICIPAL DE PROTECAO SOCIAL E CIDADANIA - FUNDO ASSISTENCIA',9,49,12,true),
('SECRETARIA MUNICIPAL DE PROTECAO SOCIAL E CIDADANIA - SEC',9,43,13,true),
('SECRETARIA MUNICIPAL DE TURISMO E CULTURA',11,13,14,true),
('SECRETARIA MUNICIPAL DE MEIO AMBIENTE',10,25,15,true),
('PREVIDENCIA',90,19,16,true);

insert into storage.buckets (id, name, public) values ('irp-files','irp-files', false)
on conflict (id) do nothing;

create policy "irp_files_auth_select" on storage.objects for select to authenticated
  using (bucket_id = 'irp-files');
create policy "irp_files_auth_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'irp-files');
create policy "irp_files_auth_update" on storage.objects for update to authenticated
  using (bucket_id = 'irp-files');
create policy "irp_files_auth_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'irp-files');
