-- ============================================================================
-- VINKO — 0033: métricas auditables para /admin/metricas y el mando (21-sep-2026)
--
-- Un comprador o inversor en 2026 compra tracción y datos limpios. Estas RPCs
-- (solo admin) calculan retención, DAU/WAU/MAU, embudo, K-factor y economía de
-- Vinkos a partir de las TABLAS REALES, sin estimar nada:
--   · plantillas (is_template) fuera SIEMPRE;
--   · editorial fuera en todo lo que mida a creadores (solo source='user');
--   · p_exclude_admins=true deja fuera a las cuentas role='admin' (el equipo);
--   · si n=0 devuelve 0, nunca rellena.
-- "Activo el día D" = escribió algo en la base ese día (hora de Madrid):
--   pick · respuesta al pronóstico del día · porra creada · share recompensado
--   · anuncio recompensado concedido · bonus diario (SOLO el último día: el
--   perfil guarda daily_bonus_last, no hay histórico). No hay registro de
--   sesiones en la base: "abrió la app" vive en GA4/PostHog, no aquí.
-- Sin libro mayor de Vinkos: la economía se reconstruye desde las filas que
-- guardan importe (picks, tienda, anuncios, vídeo, pronóstico del día) y desde
-- reglas deterministas sobre filas reales (alta, compartir, invitaciones, loop
-- del creador, reparto parimutuel 0027). Lo que no deja fila (bonus diario,
-- goteo, hitos de racha) se declara como no reconstruible.
-- ============================================================================

-- 0) Fecha real de resolución/anulación. Antes no existía: solo status.
alter table public.porras add column if not exists resolved_at timestamptz;

create or replace function public.porras_stamp_resolved() returns trigger
language plpgsql as $$
begin
  if old.status = 'open' and new.status in ('resolved', 'taken_down') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end $$;
drop trigger if exists porras_stamp_resolved on public.porras;
create trigger porras_stamp_resolved before update of status on public.porras
  for each row execute function public.porras_stamp_resolved();

-- Índices por usuario+fecha: los usan make_pick (tope diario), el perfil y
-- estas métricas. Idempotentes y baratos.
create index if not exists picks_user_created_idx on public.picks (user_id, created_at);
create index if not exists porras_creator_created_idx on public.porras (created_by, created_at);

-- 1) Helpers internos (no expuestos al cliente).
create or replace function public.metrics_day(p timestamptz) returns date
language sql stable as $$ select (p at time zone 'Europe/Madrid')::date $$;
revoke execute on function public.metrics_day(timestamptz) from public, anon, authenticated;

-- (usuario, día) con actividad real. UNION deduplica.
create or replace function public.metrics_activity(p_exclude_admins boolean default false)
returns table (act_user uuid, act_day date)
language sql stable security definer set search_path = public as $$
  with acts as (
    select k.user_id as u, metrics_day(k.created_at) as d
      from picks k join porras po on po.id = k.porra_id
     where not po.is_template
    union
    select a.user_id, metrics_day(a.created_at) from daily_pick_answers a
    union
    select po.created_by, metrics_day(po.created_at) from porras po
     where po.created_by is not null and po.source = 'user' and not po.is_template
    union
    select s.user_id, metrics_day(s.created_at) from share_rewards s
    union
    select ai.user_id, metrics_day(ai.created_at) from ad_impressions ai where ai.status = 'granted'
    union
    select pr.id, pr.daily_bonus_last from profiles pr where pr.daily_bonus_last is not null
  )
  select a.u, a.d from acts a
  join profiles pr on pr.id = a.u
  where not (p_exclude_admins and pr.role = 'admin');
$$;
revoke execute on function public.metrics_activity(boolean) from public, anon, authenticated;

-- 2) Retención por cohorte de semana de alta. D-N = activo EXACTAMENTE N días
--    después del alta (día natural). 'elig' = personas cuya alta ya cumple N
--    días (una cohorte de esta semana no puede tener D30 todavía).
create or replace function public.kpi_retention(p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := madrid_today();
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  with users as (
    select pr.id, metrics_day(pr.created_at) as d0,
           date_trunc('week', metrics_day(pr.created_at))::date as wk
      from profiles pr
     where not (p_exclude_admins and pr.role = 'admin')
  ),
  act as (select * from metrics_activity(p_exclude_admins)),
  per_user as (
    select u.id, u.wk,
      (u.d0 + 1  <= v_today) as e1, (u.d0 + 7 <= v_today) as e7, (u.d0 + 30 <= v_today) as e30,
      exists (select 1 from act a where a.act_user = u.id and a.act_day = u.d0 + 1)  as r1,
      exists (select 1 from act a where a.act_user = u.id and a.act_day = u.d0 + 7)  as r7,
      exists (select 1 from act a where a.act_user = u.id and a.act_day = u.d0 + 30) as r30
    from users u
  ),
  cohorts as (
    select wk, count(*) as n,
      count(*) filter (where e1)  as n_e1,  count(*) filter (where e1  and r1)  as n_r1,
      count(*) filter (where e7)  as n_e7,  count(*) filter (where e7  and r7)  as n_r7,
      count(*) filter (where e30) as n_e30, count(*) filter (where e30 and r30) as n_r30
    from per_user group by wk
  )
  select jsonb_build_object(
    'today', v_today,
    'cohorts', coalesce((select jsonb_agg(jsonb_build_object(
        'week', wk, 'n', n,
        'd1',  jsonb_build_object('n', n_r1,  'elig', n_e1),
        'd7',  jsonb_build_object('n', n_r7,  'elig', n_e7),
        'd30', jsonb_build_object('n', n_r30, 'elig', n_e30)) order by wk desc) from cohorts), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'n', count(*),
        'd1',  jsonb_build_object('n', count(*) filter (where e1  and r1),  'elig', count(*) filter (where e1)),
        'd7',  jsonb_build_object('n', count(*) filter (where e7  and r7),  'elig', count(*) filter (where e7)),
        'd30', jsonb_build_object('n', count(*) filter (where e30 and r30), 'elig', count(*) filter (where e30)))
      from per_user)
  ) into v;
  return v;
end $$;
revoke execute on function public.kpi_retention(boolean) from public, anon;
grant execute on function public.kpi_retention(boolean) to authenticated;

-- 3) DAU / WAU / MAU de los últimos 30 días (misma definición de actividad).
create or replace function public.kpi_dau_mau(p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := madrid_today();
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  with act as (select * from metrics_activity(p_exclude_admins)),
  days as (select (v_today - g)::date as d from generate_series(29, 0, -1) g),
  series as (
    select d.d,
      (select count(distinct a.act_user) from act a where a.act_day = d.d) as dau,
      (select count(distinct a.act_user) from act a where a.act_day between d.d - 6 and d.d) as wau,
      (select count(distinct a.act_user) from act a where a.act_day between d.d - 29 and d.d) as mau
    from days d
  )
  select jsonb_build_object(
    'today', v_today,
    'series', (select jsonb_agg(jsonb_build_object('day', d, 'dau', dau, 'wau', wau, 'mau', mau) order by d) from series),
    'dau', (select dau from series where d = v_today),
    'wau', (select wau from series where d = v_today),
    'mau', (select mau from series where d = v_today),
    'users', (select count(*) from profiles pr where not (p_exclude_admins and pr.role = 'admin')),
    'active_ever', (select count(distinct act_user) from act)
  ) into v;
  return v;
end $$;
revoke execute on function public.kpi_dau_mau(boolean) from public, anon;
grant execute on function public.kpi_dau_mau(boolean) to authenticated;

-- 4) Embudo: alta → primer pick → crea porra → comparte → invitado validado
--    → creador que repite (2ª porra de usuario dentro de 7 días de la 1ª).
--    Medianas en horas desde el alta. "Comparte" = fila en share_rewards:
--    solo cuenta el share recompensado (1/día); un share fuera del tope no
--    deja fila, así que este paso puede quedar corto.
create or replace function public.kpi_funnel(p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  with users as (
    select pr.id, pr.created_at, pr.referral_paid_at from profiles pr
     where not (p_exclude_admins and pr.role = 'admin')
  ),
  first_pick as (
    select k.user_id, min(k.created_at) as at
      from picks k join porras po on po.id = k.porra_id and not po.is_template
     group by k.user_id
  ),
  first_porra as (
    select po.created_by as user_id, min(po.created_at) as at
      from porras po
     where po.source = 'user' and not po.is_template and po.created_by is not null
     group by po.created_by
  ),
  second_porra as (
    select f.user_id from first_porra f
     where exists (select 1 from porras po
                    where po.created_by = f.user_id and po.source = 'user' and not po.is_template
                      and po.created_at > f.at and po.created_at <= f.at + interval '7 days')
  ),
  shared as (select distinct s.user_id from share_rewards s),
  agg as (
    select
      count(*) as signups,
      count(*) filter (where fp.user_id is not null) as picked,
      percentile_cont(0.5) within group (order by extract(epoch from (fp.at - u.created_at)) / 3600.0)
        filter (where fp.user_id is not null) as pick_med_h,
      count(*) filter (where fc.user_id is not null) as created,
      percentile_cont(0.5) within group (order by extract(epoch from (fc.at - u.created_at)) / 3600.0)
        filter (where fc.user_id is not null) as create_med_h,
      count(*) filter (where sh.user_id is not null) as shared,
      count(*) filter (where u.referral_paid_at is not null) as invitees,
      count(*) filter (where sp.user_id is not null) as repeat_creators
    from users u
    left join first_pick fp on fp.user_id = u.id
    left join first_porra fc on fc.user_id = u.id
    left join shared sh on sh.user_id = u.id
    left join second_porra sp on sp.user_id = u.id
  )
  select jsonb_build_object(
    'signups', signups,
    'first_pick',        jsonb_build_object('n', picked,  'median_h', round(pick_med_h::numeric, 1)),
    'created',           jsonb_build_object('n', created, 'median_h', round(create_med_h::numeric, 1)),
    'shared',            jsonb_build_object('n', shared),
    'invitee_validated', jsonb_build_object('n', invitees),
    'repeat_creator',    jsonb_build_object('n', repeat_creators, 'of', created)
  ) into v from agg;
  return v;
end $$;
revoke execute on function public.kpi_funnel(boolean) from public, anon;
grant execute on function public.kpi_funnel(boolean) to authenticated;

-- 5) Viralidad: invitados validados por usuario (K), participantes por porra
--    de usuario, shares, y tiempo del creador hasta compartir su porra.
--    OJO: el enlace de invitación lleva el handle, no la porra: no existe
--    atribución invitado→porra; "invitados / porra" es un cociente global.
create or replace function public.kpi_kfactor(p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  with users as (
    select pr.id, pr.referred_by, pr.referral_paid_at from profiles pr
     where not (p_exclude_admins and pr.role = 'admin')
  ),
  uporras as (
    select po.id, po.created_by, po.created_at from porras po
      join users u on u.id = po.created_by
     where po.source = 'user' and not po.is_template
  ),
  parts as (
    select up.id, count(distinct k.user_id) filter (where k.user_id <> up.created_by) as n
      from uporras up left join picks k on k.porra_id = up.id
     group by up.id
  ),
  shares as (
    select s.porra_id, s.user_id, s.created_at from share_rewards s join users u on u.id = s.user_id
  ),
  tts as (
    select extract(epoch from (s.created_at - up.created_at)) / 3600.0 as h
      from shares s join uporras up on up.id = s.porra_id and up.created_by = s.user_id
  ),
  referrals as (
    select u.id, u.referred_by from users u
     where u.referral_paid_at is not null and u.referred_by is not null
  )
  select jsonb_build_object(
    'users',                    (select count(*) from users),
    'invitees_validated',       (select count(*) from referrals),
    'invitees_pending',         (select count(*) from users where referred_by is not null and referral_paid_at is null),
    'inviters',                 (select count(distinct referred_by) from referrals),
    'user_porras',              (select count(*) from uporras),
    'porras_with_participants', (select count(*) from parts where n > 0),
    'participants_total',       (select coalesce(sum(n), 0) from parts),
    'participants_avg',         (select round(avg(n)::numeric, 2) from parts),
    'participants_median',      (select round((percentile_cont(0.5) within group (order by n))::numeric, 1) from parts),
    'shares',                   (select count(*) from shares),
    'sharers',                  (select count(distinct user_id) from shares),
    'porras_shared',            (select count(distinct porra_id) from shares),
    'time_to_share', jsonb_build_object(
      'n',        (select count(*) from tts),
      'median_h', (select round((percentile_cont(0.5) within group (order by h))::numeric, 1) from tts))
  ) into v;
  return v;
end $$;
revoke execute on function public.kpi_kfactor(boolean) from public, anon;
grant execute on function public.kpi_kfactor(boolean) to authenticated;

-- 6) Economía de Vinkos en una ventana (p_from null = desde siempre).
--    method='rows'  → suma de importes guardados en filas.
--    method='rule'  → filas reales × regla vigente (alta: signup_pts de la
--                     config; compartir: 50; invitación: invitee_pts + invite_pts
--                     con tope diario + hitos 5/10; loop creador: 25 × pick
--                     ajeno hasta 20 por porra, regla 0030; reparto: fórmula
--                     parimutuel 0027; devolución: lo puesto, en anuladas con
--                     motivo y en resueltas sin acertantes).
create or replace function public.metrics_economy_window(p_from timestamptz, p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_eco jsonb := cfg('economy');
  v_signup int := coalesce((v_eco->>'signup_pts')::int, 1000);
  v_inv int := coalesce((v_eco->>'invite_pts')::int, 200);
  v_new int := coalesce((v_eco->>'invitee_pts')::int, 200);
  v_cap int := coalesce((v_eco->>'invite_daily_cap')::int, 10);
  v_from timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  n_signup bigint; n_daily bigint; f_daily bigint; n_share bigint;
  n_ref bigint; n_ref_inviter bigint; f_ref_mile bigint;
  n_ads bigint; f_ads bigint; n_video bigint; f_video bigint; n_creator bigint;
  n_resolved bigint; f_payout bigint; n_refund bigint; f_refund bigint;
  n_picks bigint; s_picks bigint; n_buy bigint; s_buy bigint;
  f_faucets bigint; f_returns bigint; f_sinks bigint;
begin
  -- Alta: el importe no queda en ninguna fila → registros × regla actual.
  select count(*) into n_signup from profiles pr
   where pr.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');

  -- Pronóstico del día: la fila guarda lo pagado (respuesta + acierto), fechada
  -- por la respuesta (el acierto se paga al resolver, normalmente el mismo día).
  select count(*), coalesce(sum(a.pts), 0) into n_daily, f_daily
    from daily_pick_answers a join profiles pr on pr.id = a.user_id
   where a.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');

  -- Compartir: 50 fijos por fila.
  select count(*) into n_share from share_rewards s join profiles pr on pr.id = s.user_id
   where s.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');

  -- Invitaciones validadas: invitado + invitador (si entra en el tope del día)
  -- + hitos del invitador cuando el 5º / 10º validado cae en la ventana.
  with r as (
    select u.referral_paid_at,
           row_number() over (partition by u.referred_by, metrics_day(u.referral_paid_at) order by u.referral_paid_at) as day_rank,
           row_number() over (partition by u.referred_by order by u.referral_paid_at) as total_rank
      from profiles u
     where u.referral_paid_at is not null and u.referred_by is not null
       and not (p_exclude_admins and u.role = 'admin')
  )
  select count(*) filter (where referral_paid_at >= v_from),
         count(*) filter (where referral_paid_at >= v_from and day_rank <= v_cap),
         coalesce(sum(case when total_rank = 5 then 1000 when total_rank = 10 then 2500 else 0 end)
                  filter (where referral_paid_at >= v_from), 0)
    into n_ref, n_ref_inviter, f_ref_mile from r;

  -- Anuncio recompensado (solo los que pagan Vinkos) y vídeo aprobado: filas con importe.
  select count(*), coalesce(sum(ai.amount), 0) into n_ads, f_ads
    from ad_impressions ai join profiles pr on pr.id = ai.user_id
   where ai.status = 'granted' and ai.reward_type = 'pts' and ai.created_at >= v_from
     and not (p_exclude_admins and pr.role = 'admin');
  select count(*), coalesce(sum(vr.amount), 0) into n_video, f_video
    from video_rewards vr join profiles pr on pr.id = vr.user_id
   where vr.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');

  -- Loop del creador (regla 0030): 25 por cada pick ajeno en su porra, hasta 20.
  with cp as (
    select k.created_at, row_number() over (partition by k.porra_id order by k.created_at) as rn
      from picks k join porras po on po.id = k.porra_id join profiles pr on pr.id = po.created_by
     where po.source = 'user' and not po.is_template and k.user_id <> po.created_by
       and not (p_exclude_admins and pr.role = 'admin')
  )
  select count(*) into n_creator from cp where rn <= 20 and created_at >= v_from;

  -- Reparto (0027) y devoluciones, fechados por resolved_at (existe desde 0033:
  -- lo resuelto antes solo entra en el total, no en las ventanas).
  with rp as (
    select po.id, po.status, po.void_reason, po.winning_option_id,
           coalesce(sum(k.points_spent), 0) as pot,
           coalesce(sum(k.points_spent) filter (where k.option_id = po.winning_option_id), 0) as win_stake
      from porras po join picks k on k.porra_id = po.id
     where not po.is_template and po.status in ('resolved', 'taken_down')
       and (p_from is null or po.resolved_at >= p_from)
     group by po.id
  ),
  per_pick as (
    select
      case when rp.status = 'resolved' and rp.win_stake > 0 and k.option_id = rp.winning_option_id
           then floor(k.points_spent::numeric * rp.pot / rp.win_stake) else 0 end as paid,
      case when (rp.status = 'resolved' and rp.win_stake = 0) or (rp.status = 'taken_down' and rp.void_reason is not null)
           then k.points_spent else 0 end as refund
      from rp join picks k on k.porra_id = rp.id join profiles pr on pr.id = k.user_id
     where not (p_exclude_admins and pr.role = 'admin')
  )
  select (select count(*) from rp where status = 'resolved' and win_stake > 0),
         coalesce(sum(paid), 0),
         (select count(*) from rp where (status = 'resolved' and win_stake = 0) or (status = 'taken_down' and void_reason is not null)),
         coalesce(sum(refund), 0)
    into n_resolved, f_payout, n_refund, f_refund from per_pick;

  -- Sumideros: picks y tienda (filas con importe).
  select count(*), coalesce(sum(k.points_spent), 0) into n_picks, s_picks
    from picks k join porras po on po.id = k.porra_id join profiles pr on pr.id = k.user_id
   where not po.is_template and k.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');
  select count(*), coalesce(sum(p.cost), 0) into n_buy, s_buy
    from purchases p join profiles pr on pr.id = p.user_id
   where p.created_at >= v_from and not (p_exclude_admins and pr.role = 'admin');

  f_faucets := n_signup * v_signup + f_daily + n_share * 50 + n_ref * v_new + n_ref_inviter * v_inv + f_ref_mile
             + f_ads + f_video + n_creator * 25;
  f_returns := f_payout + f_refund;
  f_sinks   := s_picks + s_buy;

  return jsonb_build_object(
    'faucets', jsonb_build_object(
      'signup',   jsonb_build_object('n', n_signup,  'pts', n_signup * v_signup, 'method', 'rule'),
      'daily',    jsonb_build_object('n', n_daily,   'pts', f_daily,             'method', 'rows'),
      'share',    jsonb_build_object('n', n_share,   'pts', n_share * 50,        'method', 'rule'),
      'referral', jsonb_build_object('n', n_ref,     'pts', n_ref * v_new + n_ref_inviter * v_inv + f_ref_mile, 'method', 'rule'),
      'ads',      jsonb_build_object('n', n_ads,     'pts', f_ads,               'method', 'rows'),
      'video',    jsonb_build_object('n', n_video,   'pts', f_video,             'method', 'rows'),
      'creator',  jsonb_build_object('n', n_creator, 'pts', n_creator * 25,      'method', 'rule')),
    'returns', jsonb_build_object(
      'payout',   jsonb_build_object('n', n_resolved, 'pts', f_payout, 'method', 'rule'),
      'refund',   jsonb_build_object('n', n_refund,   'pts', f_refund, 'method', 'rule')),
    'sinks', jsonb_build_object(
      'picks',    jsonb_build_object('n', n_picks, 'pts', s_picks, 'method', 'rows'),
      'store',    jsonb_build_object('n', n_buy,   'pts', s_buy,   'method', 'rows')),
    'faucets_total', f_faucets,
    'returns_total', f_returns,
    'sinks_total',   f_sinks,
    'net',           f_faucets + f_returns - f_sinks
  );
end $$;
revoke execute on function public.metrics_economy_window(timestamptz, boolean) from public, anon, authenticated;

create or replace function public.kpi_economy(p_exclude_admins boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  return jsonb_build_object(
    -- Foto exacta: suma de saldos. Es el único número de economía sin reconstruir.
    'supply',  (select coalesce(sum(pr.points), 0) from profiles pr where not (p_exclude_admins and pr.role = 'admin')),
    'holders', (select count(*) from profiles pr where not (p_exclude_admins and pr.role = 'admin')),
    'd7',  metrics_economy_window(now() - interval '7 days',  p_exclude_admins),
    'd30', metrics_economy_window(now() - interval '30 days', p_exclude_admins),
    'all', metrics_economy_window(null::timestamptz, p_exclude_admins),
    -- Sin fila con importe ni fecha: no se puede reconstruir, y no se estima.
    'not_reconstructible', jsonb_build_array('daily_bonus', 'drip', 'streak_milestones', 'signup_historic')
  );
end $$;
revoke execute on function public.kpi_economy(boolean) from public, anon;
grant execute on function public.kpi_economy(boolean) to authenticated;

notify pgrst, 'reload schema';
