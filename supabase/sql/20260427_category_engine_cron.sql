create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_existing_job bigint;
begin
  select jobid
    into v_existing_job
  from cron.job
  where jobname = 'category-engine-tick-1d6e33e0'
  limit 1;

  if v_existing_job is not null then
    perform cron.unschedule(v_existing_job);
  end if;

  perform cron.schedule(
    'category-engine-tick-1d6e33e0',
    '*/5 * * * *',
    $job$
      select net.http_get(
        url := 'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/cron/category-engine/tick',
        headers := '{"Content-Type":"application/json","User-Agent":"toyoparts-category-engine-cron"}'::jsonb
      );
    $job$
  );
end;
$$;
