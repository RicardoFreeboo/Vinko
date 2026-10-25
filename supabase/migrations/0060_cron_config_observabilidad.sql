-- ============================================================================
-- VINKO — 0060: multi-entorno de crons (A1) + observabilidad de crons (C4).
--
-- A1 · Los jobs de pg_cron dejan de llevar hardcodeada la URL del proyecto de
--      producción. La base la da internal.functions_base_url() (0009), que cada
--      entorno rellena en internal.config('functions_base_url', …). Esta
--      migración es IDEMPOTENTE y reprograma los jobs existentes (prod, que
--      corrió los 0009/0022 antiguos con la URL literal) para despachar vía
--      internal.dispatch(), que construye la URL desde la config.
--
-- C4 · El despacho deja rastro: internal.cron_http_log guarda cada net.http_post
--      (fire-and-forget) con su request_id; internal.cron_http_reconcile() cruza
--      con net._http_response y registra los fallos (status ≥ 300) en
--      internal.cron_errors. Y cron_tick() deja de tragarse los errores con
--      `exception when others then null`: ahora cada sub-tarea que falla queda
--      en internal.cron_errors. Un cron que falla es VISIBLE (lo consume
--      /admin/health en 0061).
--
-- Config por entorno (NO en el repo): tras crear un proyecto, siémbrala con
--   insert into internal.config(key,value)
--     values('functions_base_url','https://<REF>.supabase.co/functions/v1')
--   on conflict (key) do update set value = excluded.value;
-- El workflow de deploy lo hace por entorno (ver .github/workflows). Sin esto,
-- los crons NO disparan (y lo registran) en vez de llamar a otro proyecto.
-- ============================================================================

-- internal.config / internal.functions_base_url() ya existen desde 0009; se
-- re-aseguran aquí por si un proyecto antiguo aplicó un 0009 previo sin ellas.
create table if not exists internal.config (
  key   text primary key,
  value text not null
);
revoke all on internal.config from public, anon, authenticated;

create or replace function internal.functions_base_url() returns text
language sql stable security definer set search_path = internal, public as $fn$
  select coalesce(
    (select value from internal.config where key = 'functions_base_url'),
    nullif(current_setting('app.functions_base_url', true), '')
  )
$fn$;
revoke all on function internal.functions_base_url() from public, anon, authenticated;

-- ---------- rastro de los crons (C4) ----------
create table if not exists internal.cron_errors (
  id         bigserial primary key,
  task       text not null,
  sqlstate   text,
  message    text,
  created_at timestamptz not null default now()
);
revoke all on internal.cron_errors from public, anon, authenticated;
create index if not exists cron_errors_created_idx on internal.cron_errors (created_at desc);

create table if not exists internal.cron_http_log (
  id            bigserial primary key,
  job           text not null,
  path          text not null,
  request_id    bigint,
  status        int,
  created_at    timestamptz not null default now(),
  reconciled_at timestamptz
);
revoke all on internal.cron_http_log from public, anon, authenticated;
create index if not exists cron_http_log_pending_idx on internal.cron_http_log (created_at desc) where status is null;

-- ---------- despacho con log (sustituye a los net.http_post inline) ----------
-- Construye la URL desde la config del entorno, adjunta el x-cron-secret y deja
-- el request_id en el log. Si falta la config o el secreto, lo registra en
-- cron_errors (visible) en vez de fallar en silencio con un 403.
create or replace function internal.dispatch(p_job text, p_path text, p_body jsonb)
returns bigint
language plpgsql security definer set search_path = internal, public as $fn$
declare
  v_base   text := internal.functions_base_url();
  v_secret text;
  v_req    bigint;
begin
  if v_base is null then
    insert into internal.cron_errors(task, sqlstate, message)
      values (p_job, 'CONFIG', 'internal.config.functions_base_url sin configurar: no se despacha ' || p_path);
    return null;
  end if;
  select value into v_secret from internal.secrets where key = 'cron_secret';
  if v_secret is null then
    insert into internal.cron_errors(task, sqlstate, message)
      values (p_job, 'CONFIG', 'internal.secrets.cron_secret ausente: la Edge Function responderá 403');
  end if;
  select net.http_post(
    url     := v_base || p_path,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := p_body
  ) into v_req;
  insert into internal.cron_http_log(job, path, request_id) values (p_job, p_path, v_req);
  return v_req;
end $fn$;
revoke all on function internal.dispatch(text, text, jsonb) from public, anon, authenticated;

-- Cruza los request_id pendientes con la respuesta de pg_net y registra los
-- fallos. net._http_response puede no existir (pg_net viejo / entorno de test):
-- se comprueba con to_regclass y, si no está, no hace nada.
create or replace function internal.cron_http_reconcile() returns void
language plpgsql security definer set search_path = internal, public as $fn$
begin
  if to_regclass('net._http_response') is null then return; end if;
  with upd as (
    update internal.cron_http_log l
       set status = r.status_code, reconciled_at = now()
      from net._http_response r
     where r.id = l.request_id and l.status is null
    returning l.job, l.path, l.status
  )
  insert into internal.cron_errors(task, sqlstate, message)
  select job, 'HTTP' || status, 'Edge ' || path || ' respondió ' || status
    from upd where status >= 300;
end $fn$;
revoke all on function internal.cron_http_reconcile() from public, anon, authenticated;

-- ---------- cron_tick deja de tragarse los errores (C4) ----------
-- Ejecuta una sub-tarea y, si revienta, lo DEJA ESCRITO en cron_errors en vez de
-- `when others then null`. Así un cron roto es visible y los demás siguen.
create or replace function internal.run_cron_task(p_task text) returns void
language plpgsql security definer set search_path = internal, public as $fn$
begin
  execute format('select public.%I()', p_task);
exception when others then
  insert into internal.cron_errors(task, sqlstate, message) values (p_task, sqlstate, left(sqlerrm, 500));
end $fn$;
revoke all on function internal.run_cron_task(text) from public, anon, authenticated;

create or replace function public.cron_tick() returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform internal.run_cron_task('cron_open_daily');
  perform internal.run_cron_task('cron_closure_reminders');
  perform internal.run_cron_task('cron_closed_pickers');
  perform internal.run_cron_task('cron_streak_risk');
  perform internal.run_cron_task('cron_league_sunday');
  perform internal.run_cron_task('cron_league_close');
  perform internal.run_cron_task('cron_reactivation');
end $fn$;

-- ---------- reprogramar los jobs: config + log, sin URL literal ----------
-- cron.schedule hace upsert por nombre: re-aplicar no duplica.
select cron.schedule('vinko-push-dispatch', '*/5 * * * *', $$
  select internal.dispatch('vinko-push-dispatch', '/push-dispatch', '{}'::jsonb)
  where exists (select 1 from public.push_queue where status = 'queued')
$$);
select cron.schedule('vinko-agent-sweep', '0 */3 * * *', $$
  select internal.dispatch('vinko-agent-sweep', '/trend-generate', '{"limit":6}'::jsonb)
$$);
select cron.schedule('vinko-cron-http-reconcile', '*/5 * * * *', $$select internal.cron_http_reconcile()$$);
