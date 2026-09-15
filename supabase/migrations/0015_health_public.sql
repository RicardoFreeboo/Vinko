-- ============================================================================
-- VINKO — 0015: system_health legible tras el Gate (datos inocuos: conteo de
-- crons, buffer, último barrido) para que el panel Estado sea veraz aunque el
-- que mira no tenga sesión (p. ej. incógnito con el código del día).
-- ============================================================================
create or replace function public.system_health()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'cron_jobs',      (select count(*) from cron.job),
    'buffer_days',    (select count(*) from daily_picks where status='scheduled' and scheduled_for >= madrid_today()),
    'last_agent_run', (select max(created_at) from agent_runs),
    'anthropic',      (select exists (select 1 from internal.secrets where key='cron_secret'))
  );
$$;
grant execute on function public.system_health() to authenticated, anon;
