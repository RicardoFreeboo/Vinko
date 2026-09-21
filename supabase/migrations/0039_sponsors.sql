-- ============================================================================
-- VINKO — 0039: infraestructura de patrocinio (spec de lanzamiento, M-01/M-02).
--   sponsors · sponsorships · sponsor_prizes · prize_awards · sponsor_metrics_daily
--   vista sponsorships_public  → solo campañas en vivo y dentro de su ventana
--   RPC sponsor_report(id, token) → informe de marca agregado, sin PII
--   RPC award_prizes(sponsorship) → admin; idempotente; SOLO ranking de Puntería
--   RPC record_sponsor_metric(…)  → admin/servicio; contadores del día
-- Reglas (§1.2.3 y M-01): premios solo por ranking de Puntería (jamás por
-- Monedas, Nivel ni sorteo); «Patrocinado por» siempre visible; nunca en
-- /p/[slug] ni en el flujo de pronóstico; budget_cents y contact_email son
-- internos (no salen ni por la vista ni por el informe). Idempotente.
-- DEPENDENCIA (0038): award_prizes excluye profiles.is_internal y
-- profiles.suspect. Esas columnas las añade la migración 0038; aquí se
-- detectan en tiempo de ejecución para no romper si cambia el orden de
-- aplicación. Si aún no existen, solo se excluye a role='admin' (el equipo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------------
create table if not exists public.sponsors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 80),
  logo_url      text,
  url           text,
  country       text not null default 'ES' check (country ~ '^[A-Z]{2}$'),
  contact_email text,                       -- interno: nunca sale al público
  created_at    timestamptz not null default now()
);

create table if not exists public.sponsorships (
  id               uuid primary key default gen_random_uuid(),
  sponsor_id       uuid not null references public.sponsors(id) on delete restrict,
  target_type      text not null
    check (target_type in ('porra','league','season','daily_gift','recap','rewarded')),
  target_id        uuid,                    -- porras.id · league_groups.id · seasons.id; null si el formato no tiene objetivo
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  status           text not null default 'draft' check (status in ('draft','live','ended')),
  banner_url       text,
  cta_text_es      text check (cta_text_es is null or char_length(cta_text_es) <= 60),
  cta_text_en      text check (cta_text_en is null or char_length(cta_text_en) <= 60),
  cta_url          text,
  disclosure_label text not null default 'Patrocinado por',
  budget_cents     int check (budget_cents is null or budget_cents >= 0),  -- interno, jamás visible al usuario
  report_token     text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sponsorships_window check (ends_at > starts_at),
  constraint sponsorships_target_needed
    check (target_type not in ('porra','league') or target_id is not null)
);

create table if not exists public.sponsor_prizes (
  id             uuid primary key default gen_random_uuid(),
  sponsorship_id uuid not null references public.sponsorships(id) on delete cascade,
  rank_from      int not null check (rank_from >= 1),
  rank_to        int not null,
  description_es text not null check (char_length(description_es) between 2 and 200),
  description_en text,
  fulfillment    text not null default 'manual' check (fulfillment in ('code','manual')),
  quantity       int not null default 1 check (quantity >= 1),
  terms_url      text,
  created_at     timestamptz not null default now(),
  constraint sponsor_prizes_range check (rank_to >= rank_from)
);

create table if not exists public.prize_awards (
  id         uuid primary key default gen_random_uuid(),
  prize_id   uuid not null references public.sponsor_prizes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rank       int not null check (rank >= 1),
  awarded_at timestamptz not null default now(),
  status     text not null default 'pending' check (status in ('pending','delivered','declined')),
  unique (prize_id, rank),     -- un puesto, un ganador (idempotencia de award_prizes)
  unique (prize_id, user_id)
);

create table if not exists public.sponsor_metrics_daily (
  sponsorship_id uuid not null references public.sponsorships(id) on delete cascade,
  day            date not null,
  impressions    int not null default 0,
  unique_reach   int not null default 0,   -- usuarios NUEVOS ese día (lo decide quien registra)
  participants   int not null default 0,   -- solo formatos sin porra/liga; en esos se cuenta de picks/league_members
  cta_clicks     int not null default 0,
  shares         int not null default 0,
  picks          int not null default 0,
  primary key (sponsorship_id, day)
);

create index if not exists sponsorships_sponsor_idx on public.sponsorships (sponsor_id);
create index if not exists sponsorships_target_idx  on public.sponsorships (target_type, target_id);
create index if not exists sponsorships_live_idx    on public.sponsorships (status, starts_at, ends_at);
create index if not exists sponsor_prizes_sponsorship_idx on public.sponsor_prizes (sponsorship_id, rank_from);
create index if not exists prize_awards_user_idx on public.prize_awards (user_id);

-- updated_at automático en sponsorships
create or replace function public.sponsorships_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sponsorships_touch on public.sponsorships;
create trigger sponsorships_touch before update on public.sponsorships
  for each row execute function public.sponsorships_touch();

-- ---------------------------------------------------------------------------
-- 2) RLS: admin todo; el público solo ve la vista sponsorships_public.
--    prize_awards: además cada usuario lee sus propios premios.
-- ---------------------------------------------------------------------------
alter table public.sponsors              enable row level security;
alter table public.sponsorships          enable row level security;
alter table public.sponsor_prizes        enable row level security;
alter table public.prize_awards          enable row level security;
alter table public.sponsor_metrics_daily enable row level security;

drop policy if exists sponsors_admin on public.sponsors;
create policy sponsors_admin on public.sponsors
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsorships_admin on public.sponsorships;
create policy sponsorships_admin on public.sponsorships
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sponsor_prizes_admin on public.sponsor_prizes;
create policy sponsor_prizes_admin on public.sponsor_prizes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists prize_awards_admin on public.prize_awards;
create policy prize_awards_admin on public.prize_awards
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists prize_awards_read_own on public.prize_awards;
create policy prize_awards_read_own on public.prize_awards
  for select using (user_id = auth.uid());

drop policy if exists sponsor_metrics_admin on public.sponsor_metrics_daily;
create policy sponsor_metrics_admin on public.sponsor_metrics_daily
  for all using (public.is_admin()) with check (public.is_admin());

-- Defensa extra: el anónimo no escribe en estas tablas ni con RLS abierta.
revoke insert, update, delete on public.sponsors, public.sponsorships, public.sponsor_prizes,
  public.prize_awards, public.sponsor_metrics_daily from anon;

-- ---------------------------------------------------------------------------
-- 3) Vista pública: SOLO campañas en vivo dentro de su ventana. Sin budget,
--    sin token, sin email. La vista corre con los permisos de su dueño
--    (postgres) a propósito: es la única puerta pública a estas tablas y el
--    filtro del where es la regla.
-- ---------------------------------------------------------------------------
create or replace view public.sponsorships_public as
  select s.id, s.target_type, s.target_id,
         sp.name     as sponsor_name,
         sp.logo_url as sponsor_logo_url,
         sp.url      as sponsor_url,
         s.cta_text_es, s.cta_text_en, s.cta_url,
         s.disclosure_label, s.banner_url,
         s.starts_at, s.ends_at
  from public.sponsorships s
  join public.sponsors sp on sp.id = s.sponsor_id
  where s.status = 'live' and now() between s.starts_at and s.ends_at;
grant select on public.sponsorships_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Informe de marca: válido solo con el token de la campaña. Agregados y
--    serie diaria rellenada a cero (nunca se inventan datos: lo que no se
--    registró es 0). Participantes y pronósticos de porra/liga salen de las
--    tablas reales (picks, league_members). Sin PII: ni handles ni ids.
-- ---------------------------------------------------------------------------
create or replace function public.sponsor_report(p_id uuid, p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s  sponsorships%rowtype;
  sp sponsors%rowtype;
  v_from date; v_to date;
  v_participants int := 0; v_picks int;
  v_label text; v_url text;
  v_days jsonb; v_tot jsonb; v_prizes jsonb;
begin
  if p_token is null or char_length(p_token) < 8 then raise exception 'VINKO_BAD_TOKEN'; end if;
  select * into s from sponsorships where id = p_id and report_token = p_token;
  if not found then raise exception 'VINKO_BAD_TOKEN'; end if;
  select * into sp from sponsors where id = s.sponsor_id;

  v_from := (s.starts_at at time zone 'Europe/Madrid')::date;
  v_to   := least((s.ends_at at time zone 'Europe/Madrid')::date, madrid_today());
  if v_to < v_from then v_to := v_from; end if;
  if v_to - v_from > 120 then v_from := v_to - 120; end if;   -- tope de la serie

  if s.target_type = 'porra' then
    select left(p.title, 120), '/p/' || p.slug into v_label, v_url from porras p where p.id = s.target_id;
    select count(distinct k.user_id), count(*) into v_participants, v_picks from picks k where k.porra_id = s.target_id;
  elsif s.target_type = 'league' then
    select 'Liga ' || initcap(lg.division) || ' · semana del ' || to_char(lg.week_start, 'DD/MM/YYYY'), '/liga'
      into v_label, v_url from league_groups lg where lg.id = s.target_id;
    select count(*) into v_participants from league_members lm where lm.group_id = s.target_id;
  else
    select coalesce(sum(m.participants), 0) into v_participants
      from sponsor_metrics_daily m where m.sponsorship_id = s.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d.day::date,
           'impressions',  coalesce(m.impressions, 0),
           'unique_reach', coalesce(m.unique_reach, 0),
           'participants', coalesce(m.participants, 0),
           'cta_clicks',   coalesce(m.cta_clicks, 0),
           'shares',       coalesce(m.shares, 0),
           'picks',        coalesce(m.picks, 0)) order by d.day), '[]'::jsonb)
    into v_days
  from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as d(day)
  left join sponsor_metrics_daily m on m.sponsorship_id = s.id and m.day = d.day::date;

  select jsonb_build_object(
    'impressions',  coalesce(sum(impressions), 0),
    'unique_reach', coalesce(sum(unique_reach), 0),
    'cta_clicks',   coalesce(sum(cta_clicks), 0),
    'shares',       coalesce(sum(shares), 0),
    'picks',        coalesce(sum(picks), 0))
    into v_tot from sponsor_metrics_daily where sponsorship_id = s.id;
  -- en una porra los pronósticos reales mandan sobre el contador
  if s.target_type = 'porra' then
    v_tot := v_tot || jsonb_build_object('picks', coalesce(v_picks, 0));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'rank_from', p.rank_from, 'rank_to', p.rank_to,
           'description_es', p.description_es, 'description_en', p.description_en,
           'quantity', p.quantity,
           'awarded',   (select count(*) from prize_awards a where a.prize_id = p.id),
           'delivered', (select count(*) from prize_awards a where a.prize_id = p.id and a.status = 'delivered'))
           order by p.rank_from), '[]'::jsonb)
    into v_prizes from sponsor_prizes p where p.sponsorship_id = s.id;

  return jsonb_build_object(
    'id', s.id, 'status', s.status,
    'target_type', s.target_type, 'target_label', v_label, 'target_url', v_url,
    'starts_at', s.starts_at, 'ends_at', s.ends_at,
    'sponsor', jsonb_build_object('name', sp.name, 'logo_url', sp.logo_url, 'url', sp.url),
    'disclosure_label', s.disclosure_label,
    'cta_text_es', s.cta_text_es, 'cta_text_en', s.cta_text_en, 'cta_url', s.cta_url,
    'banner_url', s.banner_url,
    'totals', v_tot || jsonb_build_object('participants', v_participants),
    'days', v_days,
    'prizes', v_prizes,
    'generated_at', now());
end $$;
grant execute on function public.sponsor_report(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Asignar premios: admin; SOLO por ranking de Puntería dentro del objetivo.
--    porra  → pick_scores (source='porra', ref_id=porra), porra resuelta.
--    league → league_members.score del grupo, grupo cerrado.
--    Empates: quien puntuó antes va delante (determinista). Excluye al equipo
--    (role=admin) y, si 0038 ya está aplicada, is_internal/suspect.
--    Idempotente: unique(prize_id, rank) + on conflict do nothing; repetirlo no
--    duplica ni vuelve a avisar. Si hay menos clasificados que puestos, sobran
--    puestos: nunca se inventa un ganador.
-- ---------------------------------------------------------------------------
create or replace function public.award_prizes(p_sponsorship uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s  sponsorships%rowtype;
  sp sponsors%rowtype;
  v_pred text := 'role = ''admin''';
  v_excluded uuid[] := '{}';
  v_users uuid[] := '{}';
  v_status text; v_closed boolean; v_week date; v_slug text;
  v_label text; v_url text;
  v_ranked int := 0; v_new int := 0; v_total int := 0;
  pz record; v_rank int; v_last int;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into s from sponsorships where id = p_sponsorship for update;
  if not found then raise exception 'VINKO_NO_SPONSORSHIP'; end if;
  if s.target_type not in ('porra','league') or s.target_id is null then
    raise exception 'VINKO_BAD_TARGET';
  end if;
  select * into sp from sponsors where id = s.sponsor_id;

  -- exclusiones (columnas de 0038 detectadas en caliente)
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_internal') then
    v_pred := v_pred || ' or coalesce(is_internal::text, '''') not in ('''', ''false'', ''f'')';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'suspect') then
    v_pred := v_pred || ' or coalesce(suspect::text, '''') not in ('''', ''false'', ''f'')';
  end if;
  execute 'select coalesce(array_agg(id), ''{}''::uuid[]) from public.profiles where ' || v_pred
    into v_excluded;

  if s.target_type = 'porra' then
    select p.status, left(p.title, 60), p.slug into v_status, v_label, v_slug
      from porras p where p.id = s.target_id;
    if not found then raise exception 'VINKO_NO_PORRA'; end if;
    if v_status <> 'resolved' then raise exception 'VINKO_NOT_RESOLVED'; end if;
    v_url := '/p/' || v_slug;
    select coalesce(array_agg(ps.user_id order by ps.score desc, ps.created_at asc), '{}'::uuid[])
      into v_users
      from pick_scores ps
      where ps.source = 'porra' and ps.ref_id = s.target_id
        and not (ps.user_id = any (v_excluded));
  else
    select lg.closed, lg.week_start,
           'Liga ' || initcap(lg.division) || ' · semana del ' || to_char(lg.week_start, 'DD/MM/YYYY')
      into v_closed, v_week, v_label
      from league_groups lg where lg.id = s.target_id;
    if not found then raise exception 'VINKO_NO_LEAGUE'; end if;
    if not v_closed then raise exception 'VINKO_NOT_CLOSED'; end if;
    v_url := '/liga';
    select coalesce(array_agg(x.user_id order by x.score desc, x.first_at asc nulls last, x.user_id), '{}'::uuid[])
      into v_users
      from (
        select lm.user_id, lm.score,
               (select min(ps.created_at) from pick_scores ps
                 where ps.user_id = lm.user_id and ps.week_start = v_week) as first_at
        from league_members lm
        where lm.group_id = s.target_id and lm.score > 0
          and not (lm.user_id = any (v_excluded))
      ) x;
  end if;
  v_ranked := coalesce(array_length(v_users, 1), 0);

  for pz in select * from sponsor_prizes where sponsorship_id = s.id order by rank_from, rank_to loop
    v_last := least(pz.rank_to, pz.rank_from + pz.quantity - 1, v_ranked);
    v_rank := pz.rank_from;
    while v_rank <= v_last loop
      insert into prize_awards (prize_id, user_id, rank)
        values (pz.id, v_users[v_rank], v_rank)
        on conflict do nothing;
      if found then
        v_new := v_new + 1;
        perform notify_user(v_users[v_rank], 'sistema',
          'Has ganado un premio por Puntería',
          'Puesto ' || v_rank || ' en ' || v_label || '. Premio: ' || pz.description_es || '. '
            || s.disclosure_label || ' ' || sp.name || '.',
          v_url);
      end if;
      v_rank := v_rank + 1;
    end loop;
  end loop;

  select count(*) into v_total
    from prize_awards a join sponsor_prizes p on p.id = a.prize_id
    where p.sponsorship_id = s.id;

  return jsonb_build_object(
    'awarded_now', v_new, 'awarded_total', v_total,
    'ranked', v_ranked, 'excluded', coalesce(array_length(v_excluded, 1), 0));
end $$;
revoke execute on function public.award_prizes(uuid) from public, anon;
grant execute on function public.award_prizes(uuid) to authenticated;   -- dentro: solo admin

-- ---------------------------------------------------------------------------
-- 6) Contadores del día. Lo llama el servidor (service role → auth.uid() nulo)
--    o un admin. kinds: impression · reach · participant · cta_click · share · pick.
--    'reach' lo registra quien sabe que ese usuario es nuevo en la campaña.
-- ---------------------------------------------------------------------------
create or replace function public.record_sponsor_metric(p_sponsorship uuid, p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_day date := madrid_today();
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if p_kind not in ('impression','reach','participant','cta_click','share','pick') then
    raise exception 'VINKO_BAD_KIND';
  end if;
  if not exists (select 1 from sponsorships where id = p_sponsorship) then
    raise exception 'VINKO_NO_SPONSORSHIP';
  end if;
  insert into sponsor_metrics_daily (sponsorship_id, day) values (p_sponsorship, v_day)
    on conflict do nothing;
  update sponsor_metrics_daily set
    impressions  = impressions  + (p_kind = 'impression')::int,
    unique_reach = unique_reach + (p_kind = 'reach')::int,
    participants = participants + (p_kind = 'participant')::int,
    cta_clicks   = cta_clicks   + (p_kind = 'cta_click')::int,
    shares       = shares       + (p_kind = 'share')::int,
    picks        = picks        + (p_kind = 'pick')::int
  where sponsorship_id = p_sponsorship and day = v_day;
end $$;
revoke execute on function public.record_sponsor_metric(uuid, text) from public, anon;
grant execute on function public.record_sponsor_metric(uuid, text) to authenticated;

notify pgrst, 'reload schema';
