-- ============================================================================
-- VINKO — 0072: Vinko Ads · Fase 2 · «los gustos» (VINKO_ADS_PARA_CODE.md B·2,
-- spec §14, §15.3, §18). Perfil publicitario por usuario, siempre agregado
-- hacia fuera (≥ 50 por celda, público ≥ 1.000) y nunca con política,
-- religión ni salud (A7). Encaja con REGLAS-LEGALES.md: solo +18 (0062),
-- segmentación solo en el mercado del usuario (0064) y sin publicidad de
-- operadores de juego (la preferencia existe, apagada y fuera de la UI).
--
--   · profiles.birth_date + set_birth_date(): fecha completa, 18 años exactos
--     (0062 lo hace con el año). birth_year sigue a la fecha para no romper nada.
--   · ads_user_flags: grupo de control del 5 % (estable por uid, invitados
--     incluidos), «Anuncios según mis intereses» y ads_no_gambling (spec §14).
--   · ads_user_profile: ciudad aproximada (cabeceras de Vercel, nunca la IP),
--     país por IP, franja de edad, intereses (onboarding + afinidad por votos).
--   · ads_sides / ads_user_sides: bandos según lo que votan.
--   · ads_user_freq, ads_hides: contadores y marcas ocultas (se usan en la Fase 7).
--   · ads_job_runs: registro de cada trabajo programado (§20.2).
--   · ads_profile_refresh() y ads_sides_refresh(): diarios, 05:10/05:20 UTC
--     (00:10/00:20 en Bogotá).
--   · ads_estimate_reach(): personas que encajan con una segmentación. Solo
--     admin hasta que existan los anunciantes (Fase 3). Por debajo del mínimo
--     no devuelve la cifra exacta.
--   · export_me()/delete_me() incluyen estos datos (se envuelven las de 0037).
--
-- Escrituras SOLO por RPC security definer; RLS en todas las tablas ads_*
-- (lectura directa solo admin). Ninguna RPC expuesta acepta un user_id: la
-- identidad sale de auth.uid().
-- IDEMPOTENTE: el workflow re-ejecuta las migraciones ≥ 0055 en cada deploy.
-- ============================================================================

-- ---------- 0) Vocabulario: intereses publicitarios y categorías sensibles ----------
create or replace function public.ads_sensitive_categories() returns text[]
language sql immutable as $$ select array['politica','religion','salud','sensible'] $$;

create or replace function public.ads_interest_ids() returns text[]
language sql immutable as $$
  select array['futbol','deportes','realities','musica','farandula','series','tecnologia','gastronomia','memes']
$$;

-- minúsculas y sin tildes (no dependemos de la extensión unaccent)
create or replace function public.ads_norm(p text) returns text
language sql immutable as $$
  select translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
$$;

-- Categoría publicitaria de una porra a partir de su category (texto libre del
-- agente) y su título. Lo sensible se detecta PRIMERO y nunca se usa.
create or replace function public.ads_category_of(p_category text, p_title text default null) returns text
language sql immutable as $$
  with x as (select public.ads_norm(coalesce(p_category, '') || ' ' || coalesce(p_title, '')) as s)
  select case
    when s ~ '(politic|eleccion|presidenc|presidente|gobierno|congreso|senado|alcald|gobernad|partido politico|referendo|religi|iglesia|\mpapa\M|\mdios\M|\msalud\M|enfermedad|covid|vacuna|hospital|medicamento|medicina|cancer)' then 'sensible'
    when s ~ '(streamer|internet|influencer|twitch|youtube|tiktok|farandula|famos|celebrid)' then 'farandula'
    when s ~ '(realit|isla de las tentaciones|supervivientes|gran hermano|masterchef|casa de los famosos|desafio)' then 'realities'
    when s ~ '(futbol|liga|champions|mundial|seleccion|clasico|\mgol|millonarios|america de cali|junior|kings league|\mcopa\M)' then 'futbol'
    when s ~ '(tenis|formula 1|\mf1\M|motogp|\mnba\M|baloncesto|basket|ciclismo|boxeo|\mufc\M|deporte|\mmotor)' then 'deportes'
    when s ~ '(musica|cancion|concierto|festival|\mdisco\M|eurovision|reggaeton|\malbum)' then 'musica'
    when s ~ '(\mserie|pelicula|\mcine\M|television|\mtv\M|netflix|telenovela)' then 'series'
    when s ~ '(tecnolog|iphone|\mapple\M|android|inteligencia artificial|videojuego|gaming)' then 'tecnologia'
    when s ~ '(comida|gastronom|restaurante|receta|arepa|empanada)' then 'gastronomia'
    when s ~ '(\mmeme)' then 'memes'
    else null end
  from x
$$;

-- Intereses del onboarding (0036) que valen para anuncios: fuera politica y mi_vida.
create or replace function public.ads_declared_interests(p text[]) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}')
    from unnest(coalesce(p, '{}')) as u(x)
   where x = any (public.ads_interest_ids())
$$;

-- ---------- 1) Fecha de nacimiento completa ----------
alter table public.profiles add column if not exists birth_date date;

-- birth_year = año de birth_date (si hay fecha); 18 años exactos como mínimo
-- (REGLAS-LEGALES R6). Va después de profiles_age_guard (orden alfabético).
create or replace function public.profiles_birth_date_sync() returns trigger
language plpgsql as $$
begin
  if new.birth_date is not null then
    if new.birth_date > current_date or new.birth_date < date '1900-01-01' then
      raise exception 'VINKO_BAD_BIRTH_DATE';
    end if;
    if new.birth_date > (current_date - interval '18 years')::date then
      raise exception 'VINKO_TOO_YOUNG';
    end if;
    new.birth_year := extract(year from new.birth_date)::int;
  end if;
  return new;
end $$;
drop trigger if exists profiles_birth_date_sync on public.profiles;
create trigger profiles_birth_date_sync before insert or update of birth_date, birth_year on public.profiles
  for each row execute function public.profiles_birth_date_sync();

-- 18+ con certeza: con fecha, exacto; con solo el año, únicamente si ya los
-- cumplió seguro (año ≤ actual − 19). Sin dato: no.
create or replace function public.ads_is_adult(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when p.birth_date is not null then p.birth_date <= (current_date - interval '18 years')::date
      when p.birth_year is not null then p.birth_year <= extract(year from current_date)::int - 19
      else false end
    from profiles p where p.id = p_uid), false)
$$;

create or replace function public.ads_age_band(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not public.ads_is_adult(p.id) then null
    when a < 25 then '18-24'
    when a < 35 then '25-34'
    else '35+' end
  from profiles p
  cross join lateral (select case
    when p.birth_date is not null then extract(year from age(current_date, p.birth_date))::int
    else extract(year from current_date)::int - p.birth_year end as a) x
  where p.id = p_uid
$$;

create or replace function public.set_birth_date(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_date is null then raise exception 'VINKO_BAD_BIRTH_DATE'; end if;
  update profiles set birth_date = p_date where id = auth.uid();
  if not found then raise exception 'VINKO_NO_PROFILE'; end if;
  return jsonb_build_object('ok', true, 'adult', public.ads_is_adult(auth.uid()));
end $$;

-- ---------- 2) Tablas ----------
create table if not exists public.ads_job_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists ads_job_runs_job_idx on public.ads_job_runs (job, started_at desc);

create table if not exists public.ads_user_flags (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  ads_holdout       boolean not null,                 -- grupo de control del 5 % (§15.3)
  ads_personalized  boolean not null default true,    -- «Anuncios según mis intereses»
  ads_no_gambling   boolean not null default false,   -- «No ver publicidad de juego»
  age_verified_at   timestamptz,                      -- por si el abogado pide verificación adicional
  age_verify_method text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.ads_user_profile (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  last_city          text check (last_city is null or last_city ~ '^[a-z0-9-]{1,80}$'),
  city_at            timestamptz,
  ip_country         char(2) check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  age_band           text check (age_band in ('18-24','25-34','35+')),
  declared_interests text[] not null default '{}',
  interests          text[] not null default '{}',
  affinities         jsonb not null default '{}'::jsonb,
  votes_30d          int not null default 0,
  updated_at         timestamptz not null default now(),
  -- A7: jamás política, religión ni salud, ni declarado ni derivado.
  constraint ads_user_profile_no_sensitive check (
    not (interests && array['politica','religion','salud','sensible']::text[])
    and not (declared_interests && array['politica','religion','salud','sensible']::text[])
    and not (affinities ?| array['politica','religion','salud','sensible']))
);

create table if not exists public.ads_sides (
  id         uuid primary key default gen_random_uuid(),
  market     char(2) not null default 'CO',
  label      text not null check (char_length(label) between 3 and 60),
  topic      text not null,
  rule       jsonb not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (market, label)
);

create table if not exists public.ads_user_sides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  side_id uuid not null references public.ads_sides(id) on delete cascade,
  since   timestamptz not null default now(),
  primary key (user_id, side_id)
);

create table if not exists public.ads_user_freq (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  key     text not null,
  count   int not null default 0,
  primary key (user_id, day, key)
);

create table if not exists public.ads_hides (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,  -- 0067
  created_at    timestamptz not null default now(),
  primary key (user_id, advertiser_id)
);

-- Un bando nunca es político, religioso ni de salud, y su regla es completa.
create or replace function public.ads_sides_guard() returns trigger
language plpgsql as $$
begin
  if new.topic = any (public.ads_sensitive_categories())
     or not (new.topic = any (public.ads_interest_ids()))
     or coalesce(new.rule->>'category', '') <> new.topic
     or jsonb_typeof(new.rule->'option_any') is distinct from 'array'
     or jsonb_array_length(new.rule->'option_any') = 0
     or coalesce((new.rule->>'min_votes')::int, 0) not between 1 and 20
     or coalesce((new.rule->>'window_days')::int, 0) not between 1 and 365 then
    raise exception 'VINKO_ADS_BAD_SIDE';
  end if;
  return new;
end $$;
drop trigger if exists ads_sides_guard on public.ads_sides;
create trigger ads_sides_guard before insert or update on public.ads_sides
  for each row execute function public.ads_sides_guard();

-- Bandos iniciales de Colombia («hinchas de X» = eligieron X en ≥ 2 pollas de
-- fútbol en 60 días). El admin añade o apaga más.
insert into public.ads_sides (market, label, topic, rule) values
  ('CO', 'Hinchas de Nacional',     'futbol', '{"category":"futbol","option_any":["nacional"],"min_votes":2,"window_days":60}'),
  ('CO', 'Hinchas de Millonarios',  'futbol', '{"category":"futbol","option_any":["millonarios"],"min_votes":2,"window_days":60}'),
  ('CO', 'Hinchas del América',     'futbol', '{"category":"futbol","option_any":["america"],"min_votes":2,"window_days":60}'),
  ('CO', 'Hinchas del Junior',      'futbol', '{"category":"futbol","option_any":["junior"],"min_votes":2,"window_days":60}')
on conflict (market, label) do nothing;

-- ---------- 3) RLS: lectura directa solo admin; escrituras solo por RPC ----------
do $$
declare t text;
begin
  foreach t in array array['ads_job_runs','ads_user_flags','ads_user_profile','ads_sides',
                           'ads_user_sides','ads_user_freq','ads_hides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())',
                   t || '_admin_read', t);
  end loop;
end $$;

-- ---------- 4) Grupo de control del 5 % (estable por uid) ----------
create or replace function public.ads_holdout_bucket(p_uid uuid) returns int
language sql immutable as $$
  select (('x' || substr(md5(p_uid::text), 1, 7))::bit(28)::int) % 100
$$;

-- Primera sesión = nace el perfil (invitados incluidos). Al convertir el
-- invitado en cuenta el uid no cambia, así que el grupo se conserva.
create or replace function public.ads_flags_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ads_user_flags (user_id, ads_holdout)
  values (new.id, public.ads_holdout_bucket(new.id) < 5)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists ads_flags_on_profile on public.profiles;
create trigger ads_flags_on_profile after insert on public.profiles
  for each row execute function public.ads_flags_on_profile();

insert into public.ads_user_flags (user_id, ads_holdout)
select p.id, public.ads_holdout_bucket(p.id) < 5 from public.profiles p
on conflict (user_id) do nothing;

-- ---------- 5) RPC del usuario ----------
-- Ciudad aproximada y país por IP. Los manda el servidor de Next al iniciar
-- sesión desde las cabeceras de Vercel (x-vercel-ip-city / -country); la IP
-- nunca llega aquí. Solo cuentas registradas. Un usuario solo puede tocar lo
-- suyo; la comprobación de país para servir piezas de juego se hará con la
-- cabecera de cada petición (Fase 7), no con este dato.
create or replace function public.ads_touch_location(p_city text, p_country text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_city text;
  v_cc   text := upper(nullif(trim(coalesce(p_country, '')), ''));
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from profiles where id = auth.uid()
                  and not coalesce(is_anonymous, false) and deleted_at is null) then
    return;
  end if;
  v_city := nullif(regexp_replace(regexp_replace(public.ads_norm(left(coalesce(p_city, ''), 80)),
                   '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), '');
  if v_cc is not null and (v_cc !~ '^[A-Z]{2}$' or v_cc in ('XX','T1','ZZ')) then v_cc := null; end if;
  insert into ads_user_profile as up (user_id, last_city, city_at, ip_country)
  values (auth.uid(), v_city, case when v_city is not null then now() end, v_cc)
  on conflict (user_id) do update set
    last_city  = coalesce(excluded.last_city, up.last_city),
    city_at    = case when excluded.last_city is not null then now() else up.city_at end,
    ip_country = coalesce(excluded.ip_country, up.ip_country),
    updated_at = now();
end $$;

create or replace function public.ads_get_preferences() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'personalized', coalesce((select ads_personalized from ads_user_flags where user_id = auth.uid()), true),
    'no_gambling',  coalesce((select ads_no_gambling  from ads_user_flags where user_id = auth.uid()), false),
    'hidden', coalesce((select jsonb_agg(advertiser_id order by created_at) from ads_hides
                         where user_id = auth.uid()), '[]'::jsonb)
  ) end
$$;

create or replace function public.ads_set_preferences(p_personalized boolean default null,
                                                     p_no_gambling boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  insert into ads_user_flags (user_id, ads_holdout)
  values (auth.uid(), public.ads_holdout_bucket(auth.uid()) < 5)
  on conflict (user_id) do nothing;
  update ads_user_flags set
    ads_personalized = coalesce(p_personalized, ads_personalized),
    ads_no_gambling  = coalesce(p_no_gambling, ads_no_gambling),
    updated_at       = now()
  where user_id = auth.uid();
  return public.ads_get_preferences();
end $$;

-- ---------- 6) Derivación diaria ----------
create or replace function public.ads_profile_refresh() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_run bigint;
  v_n   int := 0;
begin
  insert into ads_job_runs (job) values ('ads_profile_refresh') returning id into v_run;
  begin
    with users as (
      select p.id, p.interests as onb from profiles p
       where not coalesce(p.is_anonymous, false) and p.deleted_at is null
    ), votes as (
      select k.user_id, public.ads_category_of(po.category, po.title) as cat, count(*)::int as n
        from picks k join porras po on po.id = k.porra_id
       where k.created_at >= now() - interval '30 days'
         and k.user_id in (select id from users)
       group by 1, 2
    ), tot as (
      select user_id, sum(n)::int as total from votes group by 1
    ), aff as (
      -- afinidad = votos de la categoría ÷ votos totales en 30 días (A7: sin sensibles)
      select v.user_id,
             jsonb_object_agg(v.cat, round(v.n::numeric / t.total, 3)) as affinities,
             array_agg(v.cat order by v.cat) filter (where v.n >= 2 and v.n::numeric / t.total >= 0.2) as strong
        from votes v join tot t using (user_id)
       where v.cat is not null and not (v.cat = any (public.ads_sensitive_categories()))
       group by v.user_id
    )
    insert into ads_user_profile as up (user_id, age_band, declared_interests, interests, affinities, votes_30d, updated_at)
    select u.id,
           public.ads_age_band(u.id),
           public.ads_declared_interests(u.onb),
           (select coalesce(array_agg(distinct x order by x), '{}')
              from unnest(public.ads_declared_interests(u.onb) || coalesce(a.strong, '{}')) as z(x)),
           coalesce(a.affinities, '{}'::jsonb),
           coalesce(t.total, 0),
           now()
      from users u
      left join aff a on a.user_id = u.id
      left join tot t on t.user_id = u.id
    on conflict (user_id) do update set
      age_band = excluded.age_band, declared_interests = excluded.declared_interests,
      interests = excluded.interests, affinities = excluded.affinities,
      votes_30d = excluded.votes_30d, updated_at = now();
    get diagnostics v_n = row_count;
    update ads_job_runs set finished_at = now(), ok = true, detail = jsonb_build_object('users', v_n) where id = v_run;
  exception when others then
    update ads_job_runs set finished_at = now(), ok = false,
      detail = jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm) where id = v_run;
  end;
  return v_n;
end $$;

create or replace function public.ads_sides_refresh() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_run bigint;
  s     record;
  n     int := 0;
  m     int;
begin
  insert into ads_job_runs (job) values ('ads_sides_refresh') returning id into v_run;
  begin
    -- bandos apagados: fuera sus miembros
    delete from ads_user_sides us using ads_sides sd where sd.id = us.side_id and not sd.active;
    for s in select * from ads_sides where active loop
      create temp table if not exists _ads_side_members (user_id uuid primary key) on commit drop;
      truncate _ads_side_members;
      insert into _ads_side_members (user_id)
      select k.user_id
        from picks k
        join porras po        on po.id = k.porra_id
        join porra_options o  on o.id = k.option_id
        join profiles p       on p.id = k.user_id
       where k.created_at >= now() - make_interval(days => (s.rule->>'window_days')::int)
         and not coalesce(p.is_anonymous, false) and p.deleted_at is null
         and public.ads_category_of(po.category, po.title) = s.rule->>'category'
         and exists (select 1 from jsonb_array_elements_text(s.rule->'option_any') as w(x)
                      where public.ads_norm(o.label) like '%' || public.ads_norm(w.x) || '%')
       group by k.user_id
      having count(*) >= (s.rule->>'min_votes')::int;
      delete from ads_user_sides us where us.side_id = s.id
         and not exists (select 1 from _ads_side_members x where x.user_id = us.user_id);
      insert into ads_user_sides (user_id, side_id) select user_id, s.id from _ads_side_members
      on conflict (user_id, side_id) do nothing;
      select count(*) into m from _ads_side_members;
      n := n + m;
    end loop;
    update ads_job_runs set finished_at = now(), ok = true, detail = jsonb_build_object('memberships', n) where id = v_run;
  exception when others then
    update ads_job_runs set finished_at = now(), ok = false,
      detail = jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm) where id = v_run;
  end;
  return n;
end $$;

-- ---------- 7) Personas que encajan (A4, A12) ----------
-- p_targeting: {"market":"CO","cities":[…],"age_bands":[…],"interests":[…],"sides":[uuid…],"live":bool}
-- Cuenta solo usuarios que podrían recibir la pieza: registrados, 18+, del
-- mercado (declarado o por IP), fuera del grupo de control, no internos ni
-- sospechosos; si la segmentación no es solo de mercado, además con
-- «Anuncios según mis intereses» activado (§14). Por debajo del mínimo
-- (ads.min_audience) NO devuelve la cifra: evita deducir grupos pequeños.
create or replace function public.ads_estimate_reach(p_targeting jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_t         jsonb := coalesce(p_targeting, '{}'::jsonb);
  v_market    text := upper(coalesce(v_t->>'market', 'CO'));
  v_cities    text[] := array(select jsonb_array_elements_text(coalesce(v_t->'cities', '[]')));
  v_ages      text[] := array(select jsonb_array_elements_text(coalesce(v_t->'age_bands', '[]')));
  v_interests text[] := array(select jsonb_array_elements_text(coalesce(v_t->'interests', '[]')));
  v_sides     uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(v_t->'sides', '[]')) as w(x));
  v_live      boolean := coalesce((v_t->>'live')::boolean, false);
  v_only_mkt  boolean;
  v_min       int := coalesce((public.cfg('ads')->>'min_audience')::int, 1000);
  v_reach     numeric := coalesce((public.cfg('ads')->'est'->>'reach_rate')::numeric, 0.5);
  v_vote      numeric := coalesce((public.cfg('ads')->'est'->>'vote_rate')::numeric, 0.12);
  v_people    int;
  v_tier      text;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;  -- Fase 3: miembros del anunciante
  if v_interests && public.ads_sensitive_categories() then raise exception 'VINKO_ADS_SENSITIVE'; end if;
  if not (v_interests <@ public.ads_interest_ids()) then raise exception 'VINKO_ADS_BAD_INTEREST'; end if;
  if not (v_ages <@ array['18-24','25-34','35+']) then raise exception 'VINKO_ADS_BAD_AGE'; end if;
  v_only_mkt := cardinality(v_cities) = 0 and cardinality(v_ages) = 0
                and cardinality(v_interests) = 0 and cardinality(v_sides) = 0;

  select count(*) into v_people
    from profiles p
    join ads_user_flags f on f.user_id = p.id
    left join ads_user_profile up on up.user_id = p.id
   where not coalesce(p.is_anonymous, false) and p.deleted_at is null
     and not coalesce(p.is_internal, false) and not coalesce(p.suspect, false)
     and (case when p.birth_date is not null then p.birth_date <= (current_date - interval '18 years')::date
               when p.birth_year is not null then p.birth_year <= extract(year from current_date)::int - 19
               else false end)
     and not f.ads_holdout
     and (coalesce(p.market, p.country) = v_market or up.ip_country = v_market)  -- 0064
     and (v_only_mkt or f.ads_personalized)
     and (cardinality(v_cities) = 0 or up.last_city = any (v_cities))
     and (cardinality(v_ages) = 0 or up.age_band = any (v_ages))
     and (cardinality(v_interests) = 0 or up.interests && v_interests)
     and (cardinality(v_sides) = 0 or exists (
           select 1 from ads_user_sides s where s.user_id = p.id and s.side_id = any (v_sides)));

  v_tier := case when v_live then 'live'
                 when cardinality(v_interests) > 0 or cardinality(v_sides) > 0 then 'interest'
                 when cardinality(v_cities) > 0 or cardinality(v_ages) > 0 then 'basic'
                 else 'broad' end;

  return jsonb_build_object(
    'meets_minimum', v_people >= v_min,
    'min_audience',  v_min,
    'people',        case when v_people >= v_min then round(v_people::numeric, -2)::int end,
    'max_votes',     case when v_people >= v_min then floor(v_people * v_reach * v_vote)::int end,
    'tier',          v_tier,
    -- en directo necesita calendar_events (Fase 4): hoy cuenta el público sin la ventana
    'live_window',   case when v_live then 'pending' end
  );
end $$;

-- ---------- 8) RGPD: exportar y borrar incluyen los datos de anuncios ----------
create or replace function public.ads_export_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'birth_date', (select birth_date from profiles where id = auth.uid()),
    'preferences', (select jsonb_build_object('personalized', ads_personalized, 'no_gambling', ads_no_gambling,
                                              'control_group', ads_holdout)
                      from ads_user_flags where user_id = auth.uid()),
    'profile', (select jsonb_build_object('city', last_city, 'city_at', city_at, 'ip_country', ip_country,
                                          'age_band', age_band, 'interests', interests,
                                          'affinities', affinities, 'votes_30d', votes_30d, 'updated_at', updated_at)
                  from ads_user_profile where user_id = auth.uid()),
    'sides', (select coalesce(jsonb_agg(sd.label order by sd.label), '[]'::jsonb)
                from ads_user_sides us join ads_sides sd on sd.id = us.side_id where us.user_id = auth.uid()),
    'hidden_advertisers', (select coalesce(jsonb_agg(advertiser_id), '[]'::jsonb)
                             from ads_hides where user_id = auth.uid())
  )
$$;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'export_me_core' and pronamespace = 'public'::regnamespace) then
    alter function public.export_me() rename to export_me_core;
  end if;
  if not exists (select 1 from pg_proc where proname = 'delete_me_core' and pronamespace = 'public'::regnamespace) then
    alter function public.delete_me() rename to delete_me_core;
  end if;
end $$;

create or replace function public.export_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null::jsonb
    else public.export_me_core() || jsonb_build_object('ads', public.ads_export_me()) end
$$;

create or replace function public.delete_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid := auth.uid();
begin
  if v_id is not null then
    delete from ads_user_profile where user_id = v_id;
    delete from ads_user_sides   where user_id = v_id;
    delete from ads_user_freq    where user_id = v_id;
    delete from ads_hides        where user_id = v_id;
    delete from ads_user_flags   where user_id = v_id;
    update profiles set birth_date = null where id = v_id and birth_date is not null;
  end if;
  return public.delete_me_core();
end $$;

-- ---------- 9) Permisos de ejecución ----------
do $$
declare f text;
begin
  -- internas: solo el propietario (crons, triggers y otras funciones definer)
  foreach f in array array['public.ads_is_adult(uuid)','public.ads_age_band(uuid)',
                           'public.ads_holdout_bucket(uuid)','public.ads_profile_refresh()',
                           'public.ads_sides_refresh()','public.ads_export_me()',
                           'public.export_me_core()','public.delete_me_core()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  -- del usuario (identidad = auth.uid())
  foreach f in array array['public.set_birth_date(date)','public.ads_touch_location(text, text)',
                           'public.ads_get_preferences()','public.ads_set_preferences(boolean, boolean)',
                           'public.ads_estimate_reach(jsonb)','public.export_me()','public.delete_me()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- 10) Trabajos diarios (UTC) ----------
select cron.schedule('vinko-ads-profile-refresh', '10 5 * * *', $$select public.ads_profile_refresh()$$);
select cron.schedule('vinko-ads-sides-refresh',   '20 5 * * *', $$select public.ads_sides_refresh()$$);

notify pgrst, 'reload schema';
