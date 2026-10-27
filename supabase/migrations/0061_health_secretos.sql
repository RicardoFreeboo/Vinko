-- ============================================================================
-- VINKO — 0061: salud de secretos y config (C3). system_health() deja de ser un
-- proxy opaco ('anthropic' = ¿existe cron_secret?) y expone señales que GRITAN
-- cuando algo falta o está descuadrado, para que /admin/health lo pinte en rojo
-- en vez de un 403 silencioso:
--   · functions_base_url_set → internal.config tiene la URL de las Edge Functions
--   · cron_secret_set        → internal.secrets.cron_secret está sembrado
--   · cron_errors_24h        → nº de errores de cron registrados en 24 h (0060)
-- No expone NINGÚN valor secreto, solo booleanos y conteos (sigue siendo legible
-- por anon tras el Gate, como en 0015).
-- ============================================================================
create or replace function public.system_health()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'cron_jobs',              (select count(*) from cron.job),
    'buffer_days',            (select count(*) from daily_picks where status='scheduled' and scheduled_for >= madrid_today()),
    'last_agent_run',         (select max(created_at) from agent_runs),
    -- compat: 'anthropic' seguía siendo "hay secretos server" = cron_secret
    'anthropic',              (select exists (select 1 from internal.secrets where key='cron_secret')),
    -- nuevas señales de salud (C3)
    'cron_secret_set',        (select exists (select 1 from internal.secrets where key='cron_secret')),
    'functions_base_url_set', (select exists (select 1 from internal.config  where key='functions_base_url')),
    'cron_errors_24h',        (select count(*) from internal.cron_errors where created_at > now() - interval '24 hours')
  );
$$;
grant execute on function public.system_health() to authenticated, anon;
