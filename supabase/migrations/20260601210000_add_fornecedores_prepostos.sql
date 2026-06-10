create table if not exists public.fornecedores_prepostos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_nome text not null,
  fornecedor_nome_norm text not null unique,
  fornecedor_cnpj text,
  preposto_nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fornecedores_prepostos_nome_norm_idx
  on public.fornecedores_prepostos (fornecedor_nome_norm);

grant select, insert, update, delete on public.fornecedores_prepostos to authenticated;
grant all on public.fornecedores_prepostos to service_role;

alter table public.fornecedores_prepostos enable row level security;

drop policy if exists fp_select on public.fornecedores_prepostos;
drop policy if exists fp_insert_operational on public.fornecedores_prepostos;
drop policy if exists fp_update_operational on public.fornecedores_prepostos;
drop policy if exists fp_delete_manager on public.fornecedores_prepostos;

create policy fp_select on public.fornecedores_prepostos
  for select to authenticated using (true);

create policy fp_insert_operational on public.fornecedores_prepostos
  for insert to authenticated
  with check (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'gestor'::public.app_role)
    or public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

create policy fp_update_operational on public.fornecedores_prepostos
  for update to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'gestor'::public.app_role)
    or public.has_role((select auth.uid()), 'operador'::public.app_role)
  )
  with check (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'gestor'::public.app_role)
    or public.has_role((select auth.uid()), 'operador'::public.app_role)
  );

create policy fp_delete_manager on public.fornecedores_prepostos
  for delete to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'gestor'::public.app_role)
  );

drop trigger if exists fornecedores_prepostos_touch on public.fornecedores_prepostos;
create trigger fornecedores_prepostos_touch
before update on public.fornecedores_prepostos
for each row execute function public.touch_updated_at();
