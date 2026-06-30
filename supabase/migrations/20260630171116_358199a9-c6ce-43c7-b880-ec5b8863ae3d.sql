
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.setup_daily_backup_cron(p_secret text, p_function_url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job_name text := 'daily-system-backup';
  v_existing bigint;
  v_cmd text;
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Apenas administradores podem configurar o backup diário.';
  end if;

  select jobid into v_existing from cron.job where jobname = v_job_name;
  if v_existing is not null then
    perform cron.unschedule(v_existing);
  end if;

  v_cmd := format($cmd$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', %L
      ),
      body := jsonb_build_object('action', 'store-backup')
    );
  $cmd$, p_function_url, p_secret);

  perform cron.schedule(v_job_name, '55 23 * * *', v_cmd);
  return v_job_name;
end;
$$;

revoke all on function public.setup_daily_backup_cron(text, text) from public;
grant execute on function public.setup_daily_backup_cron(text, text) to authenticated;
