-- ============================================================================
-- VINKO — 0014: health real, ingresos de anuncios en KPIs, y estado del sistema.
-- ============================================================================

-- kpi_counts: añade anuncios mostrados + ingresos (honesto: 0 € hasta que haya
-- proveedor programático que pague; las house-ads y el rewarded no facturan).
create or replace function public.kpi_counts()
returns jsonb
language sql security definer set search_path = public as $$
  select case when not public.is_admin() then '{}'::jsonb else jsonb_build_object(
    'users',        (select count(*) from profiles),
    'pools',        (select count(*) from porras where source = 'user'),
    'picks',        (select count(*) from picks),
    'points_out',   (select coalesce(sum(amount),0) from ad_impressions where status='granted'),
    'points_burn',  (select count(*) * 10 from picks),
    'daily_answers',(select count(*) from daily_pick_answers),
    'groups',       (select count(*) from groups),
    'signals',      (select count(*) from signals),
    'queue',        (select count(*) from topic_proposals where status = 'pending_review'),
    'buffer_days',  (select count(*) from daily_picks where status = 'scheduled' and scheduled_for >= madrid_today()),
    'ads_shown',    (select count(*) from ad_impressions where status='granted'),
    'ad_revenue_eur', 0,
    'editorial',    (select count(*) from porras where source='editorial')
  ) end;
$$;

-- estado del sistema (health): señales reales de la BD.
create or replace function public.system_health()
returns jsonb
language sql security definer set search_path = public as $$
  select case when not public.is_admin() then '{}'::jsonb else jsonb_build_object(
    'cron_jobs',      (select count(*) from cron.job),
    'buffer_days',    (select count(*) from daily_picks where status='scheduled' and scheduled_for >= madrid_today()),
    'last_agent_run', (select max(created_at) from agent_runs),
    'anthropic',      (select exists (select 1 from internal.secrets where key='cron_secret')) -- proxy: secretos server activos
  ) end;
$$;
revoke execute on function public.system_health() from public, anon;
grant execute on function public.system_health() to authenticated;
