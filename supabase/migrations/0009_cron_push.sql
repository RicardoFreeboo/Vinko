-- ============================================================================
-- VINKO — 0009: cron (pg_cron) + disparadores de notificación (§5.3) y cierre
-- semanal de liga. La entrega web-push la hace la Edge Function push-dispatch,
-- invocada por pg_net con un secreto que NO vive en este repo (se inserta por
-- API en internal.secrets tras aplicar la migración).
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists internal;
create table if not exists internal.secrets (
  key   text primary key,
  value text not null
);
revoke all on schema internal from public, anon, authenticated;
revoke all on internal.secrets from public, anon, authenticated;

alter table public.profiles
  add column reactivation_sent smallint not null default 0,
  add column reactivation_last date;

-- ---------- abrir el pronóstico del día + alerta de buffer (§3.3) ----------
create or replace function public.cron_open_daily() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hour int := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  v_open_h int := coalesce((cfg('misc')->>'daily_open_hour_madrid')::int, 9);
  v_buffer int;
  v_thr int := coalesce((cfg('misc')->>'buffer_alert_threshold')::int, 7);
  r record;
begin
  if v_hour >= v_open_h then
    update daily_picks set status = 'open'
      where scheduled_for = madrid_today() and status = 'scheduled';
  end if;
  -- alerta de buffer bajo (1/día a admins, al buzón)
  select count(*) into v_buffer from daily_picks
    where status = 'scheduled' and scheduled_for > madrid_today();
  if v_buffer < v_thr then
    for r in select id from profiles where role = 'admin' loop
      if not exists (select 1 from notifications
          where user_id = r.id and class = 'sistema'
            and title like 'Buffer de pronósticos bajo%'
            and created_at::date = current_date) then
        insert into notifications (user_id, class, title, body, url)
          values (r.id, 'sistema', 'Buffer de pronósticos bajo: ' || v_buffer || ' días',
            'Quedan menos de ' || v_thr || ' preguntas programadas. Aprueba más en el panel.',
            '/admin/hoy');
      end if;
    end loop;
  end if;
end $$;

-- ---------- cierre en 1 h: aviso a compañeros de grupo sin pick (clase 1) ----------
create or replace function public.cron_closure_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct po.id, po.slug, po.title, gm2.user_id
    from porras po
    join group_members gm1 on gm1.user_id = po.created_by
    join group_members gm2 on gm2.group_id = gm1.group_id and gm2.user_id <> po.created_by
    where po.status = 'open' and po.source = 'user'
      and po.closes_at between now() and now() + interval '60 minutes'
      and not exists (select 1 from picks k where k.porra_id = po.id and k.user_id = gm2.user_id)
      and not exists (select 1 from notifications n
        where n.user_id = gm2.user_id and n.class = 'evento'
          and n.url = '/p/' || po.slug and n.created_at > now() - interval '3 hours')
  loop
    perform notify_user(r.user_id, 'evento',
      'Cierra en 1 h: ' || left(r.title, 60),
      'Aún no has hecho tu pronóstico.', '/p/' || r.slug);
  end loop;
end $$;

-- ---------- racha en riesgo T-3h (clase 3, solo racha ≥3) ----------
create or replace function public.cron_streak_risk() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hour int := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  r record;
begin
  if v_hour <> 21 then return; end if;
  for r in
    select id, streak_days from profiles
    where streak_days >= 3 and streak_last = madrid_today() - 1
      and not exists (select 1 from notifications n
        where n.user_id = profiles.id and n.class = 'racha'
          and n.created_at::date = current_date and n.title like 'Tu racha%acaba%')
  loop
    perform notify_user(r.id, 'racha',
      'Tu racha de ' || r.streak_days || ' días acaba en 3 h',
      'Haz el pronóstico del día y sigue sumando.', '/hoy');
  end loop;
end $$;

-- ---------- liga: aviso de domingo en zona (clase 4) ----------
create or replace function public.cron_league_sunday() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dow int := extract(isodow from (now() at time zone 'UTC'))::int;
  v_size int := coalesce((cfg('misc')->>'league_size')::int, 25);
  v_zone int := coalesce((cfg('misc')->>'league_promote')::int, 5);
  r record;
begin
  if v_dow <> 7 then return; end if;
  for r in
    select lm.user_id, rk.rank, lg.division
    from league_groups lg
    join lateral (
      select m.user_id, rank() over (order by m.score desc) as rank
      from league_members m where m.group_id = lg.id
    ) rk on true
    join league_members lm on lm.group_id = lg.id and lm.user_id = rk.user_id
    where lg.week_start = league_week_start() and not lg.closed
      and (rk.rank <= v_zone or rk.rank > v_size - v_zone)
      and not exists (select 1 from notifications n
        where n.user_id = lm.user_id and n.class = 'liga'
          and n.created_at::date = current_date)
  loop
    perform notify_user(r.user_id, 'liga',
      case when r.rank <= v_zone then 'Estás en zona de ascenso'
        else 'Estás en zona de descenso' end,
      'La semana de liga cierra esta noche (23:59 UTC).', '/liga');
  end loop;
end $$;

-- ---------- cierre semanal de liga: ascensos/descensos + premio ----------
create or replace function public.league_next(p_div text) returns text
language sql immutable as $$
  select case p_div when 'bronce' then 'plata' when 'plata' then 'oro'
    when 'oro' then 'diamante' when 'diamante' then 'leyenda' else 'leyenda' end $$;
create or replace function public.league_prev(p_div text) returns text
language sql immutable as $$
  select case p_div when 'leyenda' then 'diamante' when 'diamante' then 'oro'
    when 'oro' then 'plata' else 'bronce' end $$;

create or replace function public.cron_league_close() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev date := league_week_start() - 7;
  v_zone int := coalesce((cfg('misc')->>'league_promote')::int, 5);
  g record; r record; v_n int;
begin
  if league_week_start() = league_week_start(now() - interval '7 days') then return; end if;
  for g in select * from league_groups where week_start = v_prev and not closed loop
    select count(*) into v_n from league_members where group_id = g.id;
    for r in
      select m.user_id, rank() over (order by m.score desc) as rank, m.score
      from league_members m where m.group_id = g.id
    loop
      if r.rank <= v_zone and r.score > 0 then
        if g.division <> 'leyenda' then
          update profiles set division = league_next(g.division) where id = r.user_id;
        end if;
        perform award_xp(r.user_id, 200);
        insert into user_cosmetics (user_id, code, kind)
          values (r.user_id, 'liga_' || g.division || '_' || v_prev, 'emblem')
          on conflict do nothing;
        perform notify_user(r.user_id, 'liga', '¡Asciendes de división!',
          'Acabaste ' || r.rank || 'º de tu grupo. +200 XP.', '/liga');
      elsif r.rank > v_n - v_zone and v_n > v_zone and g.division <> 'bronce'
            and g.division <> 'leyenda' then
        update profiles set division = league_prev(g.division) where id = r.user_id;
        perform notify_user(r.user_id, 'liga', 'Desciendes de división',
          'La próxima semana se sube de nuevo.', '/liga');
      end if;
    end loop;
    update league_groups set closed = true where id = g.id;
  end loop;
end $$;

-- ---------- reactivación D3/D7/D14/D30, máx 4 en total (clase 6) ----------
create or replace function public.cron_reactivation() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_days int;
begin
  for r in
    select id, streak_last, reactivation_sent, reactivation_last from profiles
    where streak_last is not null
      and reactivation_sent < 4
      and madrid_today() - streak_last in (3, 7, 14, 30)
      and (reactivation_last is null or reactivation_last < madrid_today())
  loop
    v_days := madrid_today() - r.streak_last;
    update profiles set reactivation_sent = reactivation_sent + 1,
      reactivation_last = madrid_today() where id = r.id;
    perform notify_user(r.id, 'reactivacion',
      'Tus porras siguen sin ti',
      'Llevas ' || v_days || ' días fuera. Hay pronóstico del día esperándote.', '/hoy');
  end loop;
end $$;

-- ---------- tick maestro (cada 15 min) ----------
create or replace function public.cron_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  begin perform cron_open_daily();        exception when others then null; end;
  begin perform cron_closure_reminders(); exception when others then null; end;
  begin perform cron_streak_risk();       exception when others then null; end;
  begin perform cron_league_sunday();     exception when others then null; end;
  begin perform cron_league_close();      exception when others then null; end;
  begin perform cron_reactivation();      exception when others then null; end;
end $$;

select cron.schedule('vinko-tick', '*/15 * * * *', $$select public.cron_tick()$$);

-- despacho de web-push cada 5 min (la función comprueba el secreto)
select cron.schedule('vinko-push-dispatch', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://uarnpxjdccbidgzhhavc.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from internal.secrets where key = 'cron_secret')),
    body := '{}'::jsonb
  ) where exists (select 1 from public.push_queue where status = 'queued')
$$);
