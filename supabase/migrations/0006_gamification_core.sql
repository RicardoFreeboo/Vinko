-- ============================================================================
-- VINKO — 0006: núcleo de gamificación (spec Gamificación v1, 15-sep-2026,
-- orden de Ricardo: ejecutar el documento completo).
-- Tres monedas SEPARADAS (§3.1): PTS (profiles.points), XP (profiles.xp),
-- Marcador (pick_scores + profiles.marcador_total). Reglas duras:
--  · El marcador SOLO nace de aciertos (fórmula §3.2). Ningún anuncio lo toca.
--  · Los puntos jamás se compran ni se transfieren entre usuarios (L1/L2).
--  · Toda mutación de monedas es server-side (security definer / service role).
-- ============================================================================

-- ---------- remote config (L8: parámetros fuera del código) ----------
create table public.remote_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.remote_config enable row level security;
create policy config_read on public.remote_config for select using (true);
create policy config_admin_write on public.remote_config
  for all using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.remote_config from anon;

insert into public.remote_config (key, value) values
('economy', '{
  "signup_pts": 1000,
  "drip_amount": 100, "drip_interval_h": 4, "cap_pts": 7500,
  "daily_bonus": [50,75,100,150,200,300,500],
  "daily_pick_pts": 150, "daily_pick_hit_pts": 300,
  "daily_pick_xp": 10, "daily_pick_hit_xp": 25,
  "pick_xp": 15, "pick_xp_daily_cap": 5,
  "create_xp": 100, "create_xp_daily_cap": 3,
  "invite_pts": 200, "invite_daily_cap": 10,
  "ad_reward_pts": 200, "ad_reward_daily_cap": 3,
  "streak_multiplier_step": 0.02, "streak_multiplier_cap": 1.20,
  "streak_milestones": {"3": {"pts": 100, "xp": 20}, "7": {"pts": 500, "xp": 100},
    "14": {"pts": 800, "xp": 150}, "30": {"pts": 1500, "xp": 300},
    "60": {"pts": 2500, "xp": 500}, "100": {"pts": 4000, "xp": 800},
    "365": {"pts": 10000, "xp": 2000}},
  "score_base": 20, "score_range": 100
}'::jsonb),
('ads', '{
  "enabled": true, "programmatic_enabled": false,
  "provider_waterfall": ["sponsor","programmatic","house"],
  "rewarded_daily_offer_cap": 6, "rewarded_daily_complete_cap": 4,
  "rewarded_min_account_age_h": 48, "rewarded_min_sessions": 3,
  "interstitial_enabled": false, "interstitial_per_session": 1,
  "interstitial_daily_cap": 2, "interstitial_min_gap_s": 180,
  "interstitial_min_account_age_d": 3,
  "landing_ads_enabled": false,
  "slots": {
    "R1": {"reward": "streak_recover", "cap_per_break": 1, "cap_month": 2},
    "R2": {"reward": "pts", "value": 200, "cap_day": 3},
    "R3": {"reward": "shield", "value": 1, "cap_week": 1},
    "R4": {"reward": "xp", "value": 25, "cap_day": 1},
    "R5": {"reward": "analysis_24h", "cap_day": 2},
    "R6": {"reward": "xp_boost_2h", "cap_day": 1}
  }
}'::jsonb),
('push', '{
  "daily_cap": 2, "weekly_cap": 8, "non_personal_weekly_cap": 1,
  "quiet_hours_local": [23, 8],
  "low_engagement_downgrade_days": 14
}'::jsonb),
('misc', '{
  "streak_tz": "Europe/Madrid",
  "daily_open_hour_madrid": 9,
  "buffer_alert_threshold": 7,
  "league_size": 25, "league_promote": 5, "league_relegate": 5,
  "season_tiers": 40, "season_tier_xp": 1000, "season_weeks": 6,
  "season_catchup_mult": 1.5, "season_catchup_below": 0.6
}'::jsonb);

-- helper: día "local" del alfa (España). Un solo huso para racha y bonus.
create or replace function public.madrid_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create or replace function public.cfg(p_key text) returns jsonb
language sql stable security definer set search_path = public as
$$ select value from remote_config where key = p_key $$;

-- ---------- columnas nuevas de profiles ----------
alter table public.profiles
  add column xp               int  not null default 0 check (xp >= 0),
  add column marcador_total   int  not null default 0 check (marcador_total >= 0),
  add column division         text not null default 'bronce'
    check (division in ('bronce','plata','oro','diamante','leyenda')),
  add column streak_days      int  not null default 0,
  add column streak_best      int  not null default 0,
  add column streak_last      date,
  add column streak_shields   int  not null default 1 check (streak_shields between 0 and 2),
  add column shield_regen_week date,
  add column streak_broken_days int not null default 0,
  add column streak_recover_until timestamptz,
  add column daily_bonus_step smallint not null default 0,
  add column daily_bonus_last date,
  add column last_drip        timestamptz not null default now(),
  add column title            text,
  add column frame            text;

-- registro: 1000 PTS (spec §3.8) — el trigger existente inserta con default;
-- subimos el default y dejamos el histórico como está.
alter table public.profiles alter column points set default 1000;

-- ---------- marcador (§3.2): solo nace de aciertos ----------
create table public.pick_scores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  source     text not null check (source in ('porra','daily')),
  ref_id     uuid not null,
  score      int  not null check (score >= 0),
  week_start date not null,  -- lunes (UTC) de la semana de liga
  created_at timestamptz not null default now(),
  unique (user_id, source, ref_id)
);
alter table public.pick_scores enable row level security;
create policy scores_read on public.pick_scores for select using (true);
create index pick_scores_week_idx on public.pick_scores (week_start, user_id);

-- ---------- pronóstico del día (§3.3 ancla 1) + buffer ----------
create table public.daily_picks (
  id            uuid primary key default gen_random_uuid(),
  scheduled_for date not null,
  lang          text not null default 'es' check (lang in ('es','en')),
  question      text not null check (char_length(question) between 5 and 160),
  options       jsonb not null,           -- ["sí","no",...] 2–3 opciones
  correct_idx   smallint,
  status        text not null default 'scheduled'
    check (status in ('scheduled','open','resolved','skipped')),
  source_url    text,
  created_at    timestamptz not null default now(),
  unique (scheduled_for, lang)
);
alter table public.daily_picks enable row level security;
create policy daily_read on public.daily_picks
  for select using (status in ('open','resolved') or public.is_admin());
create policy daily_admin on public.daily_picks
  for all using (public.is_admin()) with check (public.is_admin());

create table public.daily_pick_answers (
  day_id     uuid not null references public.daily_picks(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  option_idx smallint not null,
  correct    boolean,
  pts        int not null default 0,
  xp         int not null default 0,
  score      int not null default 0,
  created_at timestamptz not null default now(),
  primary key (day_id, user_id)
);
alter table public.daily_pick_answers enable row level security;
create policy dpa_read_own on public.daily_pick_answers for select using (user_id = auth.uid());
create policy dpa_read_resolved on public.daily_pick_answers for select using (
  exists (select 1 from public.daily_picks d where d.id = day_id and d.status = 'resolved')
);
-- escrituras solo por RPC

-- ---------- buzón interno (§5.1.4) ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  class      text not null check (class in
    ('evento','resolucion','social','racha','liga','contenido','reactivacion','sistema')),
  title      text not null,
  body       text,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
alter table public.notifications enable row level security;
create policy notif_read_own on public.notifications for select using (user_id = auth.uid());
create policy notif_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
create index notif_user_idx on public.notifications (user_id, read_at, created_at desc);

-- ---------- push (§5): suscripciones + preferencias + tope EN BASE DE DATOS ----------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy pushsub_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.push_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  class   text not null,
  enabled boolean not null default true,
  primary key (user_id, class)
);
alter table public.push_prefs enable row level security;
create policy pushprefs_own on public.push_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ledger de envíos. El TOPE vive aquí (pregunta 7 del spec): try_reserve_push
-- es transaccional — dos jobs concurrentes no pueden pasarlo a la vez.
create table public.push_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  class      text not null,
  day        date not null default (now() at time zone 'Europe/Madrid')::date,
  created_at timestamptz not null default now()
);
alter table public.push_sent enable row level security;
create policy pushsent_read_own on public.push_sent for select using (user_id = auth.uid());
create index push_sent_user_day_idx on public.push_sent (user_id, day);

-- Cola de entrega (la despacha la Edge Function push-dispatch)
create table public.push_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  class      text not null,
  title      text not null,
  body       text,
  url        text,
  status     text not null default 'queued' check (status in ('queued','sent','failed','dropped')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table public.push_queue enable row level security;
-- sin policies: solo service role / funciones definer

-- Reserva transaccional bajo topes (2/día, 8/semana, 1 no-personal/semana,
-- horas de silencio 23–08 local). Devuelve true si se puede enviar.
create or replace function public.try_reserve_push(p_user uuid, p_class text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := cfg('push');
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_hour int := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  v_daily int; v_weekly int; v_nonp int;
  v_quiet_from int := coalesce((v_cfg->'quiet_hours_local'->>0)::int, 23);
  v_quiet_to   int := coalesce((v_cfg->'quiet_hours_local'->>1)::int, 8);
begin
  -- horas de silencio
  if v_hour >= v_quiet_from or v_hour < v_quiet_to then return false; end if;
  -- preferencia de clase
  if exists (select 1 from push_prefs where user_id = p_user and class = p_class and not enabled) then
    return false;
  end if;
  -- bloqueo por fila del usuario+día: serializa reservas concurrentes
  perform pg_advisory_xact_lock(hashtext(p_user::text || v_day::text));
  select count(*) into v_daily  from push_sent where user_id = p_user and day = v_day;
  select count(*) into v_weekly from push_sent where user_id = p_user and day >= v_day - 6;
  if v_daily  >= coalesce((v_cfg->>'daily_cap')::int, 2)  then return false; end if;
  if v_weekly >= coalesce((v_cfg->>'weekly_cap')::int, 8) then return false; end if;
  if p_class in ('contenido','reactivacion') then
    select count(*) into v_nonp from push_sent
      where user_id = p_user and day >= v_day - 6 and class in ('contenido','reactivacion');
    if v_nonp >= coalesce((v_cfg->>'non_personal_weekly_cap')::int, 1) then return false; end if;
  end if;
  insert into push_sent (user_id, class, day) values (p_user, p_class, v_day);
  return true;
end $$;
revoke execute on function public.try_reserve_push(uuid, text) from public, anon, authenticated;

-- Notificar: SIEMPRE al buzón; a push solo si pasa la reserva (entonces encola).
create or replace function public.notify_user(
  p_user uuid, p_class text, p_title text, p_body text, p_url text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, class, title, body, url)
  values (p_user, p_class, p_title, p_body, p_url);
  if public.try_reserve_push(p_user, p_class) then
    insert into push_queue (user_id, class, title, body, url)
    values (p_user, p_class, p_title, p_body, p_url);
  end if;
end $$;
revoke execute on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
