-- 0045_money_refs — M0 de VINKO_MONEY_SPEC v1.0 (§4). Aprobado por Ricardo el 22-sep-2026.
-- Principio: el núcleo guarda REFERENCIAS (ids externos, estados, configuración
-- de la bolsa). Jamás saldos, movimientos, tarjetas ni cuentas bancarias.
-- Numeración: la spec dice "0012"; el repo va por 0044 → esta es la 0045.
-- Todo queda apagado: cada país en points_only y sin bolsas. Cero UI pública.

-- 0) Fuente oficial de resultados. NO EXISTÍA en el repo (F-04b del lanzamiento
-- se descartó). Sin una fila aquí, ninguna porra puede ser money_eligible.
-- En M0 se rellena a mano desde /admin (acta oficial + URL); la ingesta por API
-- de datos deportivos es M1. El juez humano NUNCA decide una porra con bolsa de
-- dinero: solo esta tabla (trigger trg_porras_money_result).
create table if not exists public.results_feed (
  key               text primary key check (key ~ '^[a-z0-9_]+:[a-z0-9_]+:[A-Za-z0-9_-]+$'),  -- proveedor:deporte:evento
  provider          text not null,                  -- 'manual' (acta) | 'apifootball' | ...
  label             text not null,
  event_at          timestamptz not null,
  options_count     smallint not null check (options_count between 2 and 6),
  result_option_idx smallint check (result_option_idx is null or result_option_idx between 0 and 5),
  source_url        text,
  resolved_at       timestamptz,
  checked_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);
alter table public.results_feed enable row level security;
drop policy if exists results_feed_read on public.results_feed;
create policy results_feed_read on public.results_feed for select using (true);
revoke insert, update, delete on public.results_feed from anon, authenticated;

-- 0b) País declarado del usuario (MN-01). No es una columna de dinero: la usa la
-- elegibilidad y la UI apagada. Lo escribe el propio usuario (onboarding/ajustes).
alter table public.profiles add column if not exists country char(2) check (country is null or country ~ '^[A-Z]{2}$');
grant update (country) on public.profiles to authenticated;

-- 0c) Entorno: el proveedor 'mock' solo se admite fuera de producción.
update public.remote_config set value = value || '{"env": "production"}'::jsonb
  where key = 'misc' and not (value ? 'env');

-- 1) Catálogo: qué porras pueden llevar bolsa de dinero -------------------
alter table public.porras add column if not exists money_eligible boolean not null default false;
alter table public.porras add column if not exists resolution_source_ref text references public.results_feed(key);
comment on column public.porras.money_eligible is 'Solo editorial + resolution_source_ref (fuente oficial). Nunca porras de usuario.';
comment on column public.porras.resolution_source_ref is 'Clave de fuente oficial de resultados (results_feed.key). Sin ella no hay dinero.';

-- Guard: money_eligible exige fuente oficial, origen editorial, no plantilla, pública.
create or replace function public.porras_money_eligible_guard() returns trigger
language plpgsql as $$
begin
  if new.money_eligible then
    if new.resolution_source_ref is null or char_length(trim(new.resolution_source_ref)) < 3 then
      raise exception 'VINKO_MONEY_NO_SOURCE';
    end if;
    if new.source <> 'editorial' or new.is_template or new.visibility <> 'public' then
      raise exception 'VINKO_MONEY_NOT_CATALOG';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_porras_money_eligible on public.porras;
create trigger trg_porras_money_eligible
  before insert or update of money_eligible, resolution_source_ref, source, is_template, visibility
  on public.porras for each row execute function public.porras_money_eligible_guard();

-- 2) Referencias de bolsas y participaciones -------------------------------
do $$ begin
  create type public.money_pool_status as enum ('draft','open','closed','settled','voided');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.money_participation_status as enum ('pending','confirmed','failed','refunded','paid');
exception when duplicate_object then null; end $$;

create table if not exists public.money_pools (
  id               uuid primary key default gen_random_uuid(),
  porra_id         uuid not null references public.porras(id),
  country          char(2) not null check (country ~ '^[A-Z]{2}$'),
  provider         text not null check (provider ~ '^(mock|partner_[a-z0-9_]+|vinko_money)$'),
  external_pool_id text,
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  stake_minor      integer not null check (stake_minor > 0),          -- configuración de la bolsa (entrada), no saldo
  rake_bps         integer not null check (rake_bps between 0 and 2000),
  status           public.money_pool_status not null default 'draft',
  legal_basis_ref  text not null check (char_length(legal_basis_ref) between 3 and 120),
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  closes_at        timestamptz not null,
  settled_at       timestamptz,
  unique (porra_id)
);
comment on table public.money_pools is 'Referencias a bolsas operadas por un proveedor licenciado. Sin importes de usuario.';
create index if not exists money_pools_status_idx on public.money_pools (status, closes_at);

-- Guard: solo porras elegibles, cierre ≤ cierre de la porra, país habilitado en
-- remote_config.money, legal_basis_ref idéntico al configurado, mock jamás en producción.
create or replace function public.money_pools_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_cfg jsonb; v_c jsonb;
begin
  select * into v from porras where id = new.porra_id;
  if not found or not v.money_eligible or v.source <> 'editorial' or v.is_template then
    raise exception 'VINKO_MONEY_NOT_ELIGIBLE';
  end if;
  if new.closes_at > v.closes_at then raise exception 'VINKO_MONEY_CLOSE_AFTER_PORRA'; end if;
  v_cfg := cfg('money');
  if coalesce((v_cfg->'global'->>'kill_switch')::boolean, false) then raise exception 'VINKO_MONEY_KILL_SWITCH'; end if;
  v_c := v_cfg->'countries'->new.country;
  if v_c is null or not coalesce((v_c->>'enabled')::boolean, false) or (v_c->>'mode') not in ('partner','own') then
    raise exception 'VINKO_MONEY_COUNTRY_OFF';
  end if;
  if v_c->>'legal_basis_ref' is null or v_c->>'legal_basis_ref' <> new.legal_basis_ref then
    raise exception 'VINKO_MONEY_NO_LEGAL_BASIS';
  end if;
  if new.provider = 'mock' and coalesce(cfg('misc')->>'env', 'production') = 'production' then
    raise exception 'VINKO_MONEY_MOCK_IN_PROD';
  end if;
  if new.provider <> 'mock' and new.provider <> coalesce(v_c->>'provider', '') then
    raise exception 'VINKO_MONEY_PROVIDER_MISMATCH';
  end if;
  return new;
end $$;
drop trigger if exists trg_money_pools_guard on public.money_pools;
create trigger trg_money_pools_guard before insert on public.money_pools
  for each row execute function public.money_pools_guard();

create table if not exists public.money_participations (
  id            uuid primary key default gen_random_uuid(),
  money_pool_id uuid not null references public.money_pools(id),
  user_id       uuid not null references public.profiles(id),
  option_idx    smallint not null check (option_idx between 0 and 5),
  external_ref  text,
  status        public.money_participation_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (money_pool_id, user_id)
);
create index if not exists money_participations_user_idx on public.money_participations (user_id, status);

-- Guard: nunca anónimos, nunca menores declarados, nunca perfiles borrados o sospechosos,
-- país declarado igual al de la bolsa, y solo con la bolsa abierta.
-- (La edad y el país REALES los verifica el KYC del proveedor; esto es defensa extra.)
create or replace function public.money_participations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; v_pool money_pools%rowtype;
begin
  select * into p from profiles where id = new.user_id;
  if not found or coalesce(p.is_anonymous, false) or p.deleted_at is not null or coalesce(p.suspect, false) then
    raise exception 'VINKO_MONEY_USER_NOT_ALLOWED';
  end if;
  if p.birth_year is null or extract(year from now())::int - p.birth_year < 18 then
    raise exception 'VINKO_MONEY_UNDERAGE';
  end if;
  select * into v_pool from money_pools where id = new.money_pool_id;
  if tg_op = 'INSERT' and v_pool.status <> 'open' then raise exception 'VINKO_MONEY_POOL_NOT_OPEN'; end if;
  if tg_op = 'INSERT' and (p.country is null or p.country <> v_pool.country) then
    raise exception 'VINKO_MONEY_GEO_MISMATCH';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_money_participations_guard on public.money_participations;
create trigger trg_money_participations_guard before insert or update on public.money_participations
  for each row execute function public.money_participations_guard();

-- 3) Caché de elegibilidad (TTL 10 min; nunca sustituye a la comprobación en tiempo real)
create table if not exists public.money_eligibility_cache (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  country    char(2) not null,
  kyc_status text not null check (kyc_status in ('none','pending','verified','rejected','expired')),
  eligible   boolean not null,
  reasons    text[] not null default '{}',
  checked_at timestamptz not null default now(),
  primary key (user_id, country)
);

-- 4) Webhooks crudos del proveedor (idempotencia por event_id) -----------------
create table if not exists public.money_events (
  event_id     text primary key,
  provider     text not null,
  type         text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

-- 5) Afiliación (apagada; sin placement en M0) ----------------------------------
create table if not exists public.affiliate_links (
  id              uuid primary key default gen_random_uuid(),
  country         char(2) not null,
  operator        text not null,
  url_template    text not null check (position('{subid}' in url_template) > 0),
  legal_basis_ref text not null,
  enabled         boolean not null default false,
  unique (country, operator)
);
create table if not exists public.affiliate_clicks (
  id        bigint generated always as identity primary key,
  user_hash text not null,                 -- hash del usuario, nunca el id en claro
  operator  text not null,
  country   char(2) not null,
  porra_id  uuid references public.porras(id),
  ts        timestamptz not null default now()
);

-- 6) RLS: lectura mínima; escritura SOLO por RPC security definer o servicio ----
alter table public.money_pools enable row level security;
alter table public.money_participations enable row level security;
alter table public.money_eligibility_cache enable row level security;
alter table public.money_events enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.affiliate_clicks enable row level security;

-- Bolsas: visibles a usuarios reales (no anónimos) que puedan leer la porra (la RLS de porras aplica en el subselect).
drop policy if exists money_pools_read on public.money_pools;
create policy money_pools_read on public.money_pools for select
  using (auth.uid() is not null and not public.jwt_is_anonymous()
         and exists (select 1 from public.porras p where p.id = porra_id));
-- Participaciones: solo las propias (y admin).
drop policy if exists money_participations_read on public.money_participations;
create policy money_participations_read on public.money_participations for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists money_eligibility_own on public.money_eligibility_cache;
create policy money_eligibility_own on public.money_eligibility_cache for select using (user_id = auth.uid());
-- money_events: solo servicio y admin (consola /admin/money/events).
drop policy if exists money_events_admin_read on public.money_events;
create policy money_events_admin_read on public.money_events for select using (public.is_admin());
drop policy if exists affiliate_links_read on public.affiliate_links;
create policy affiliate_links_read on public.affiliate_links for select using (enabled or public.is_admin());
drop policy if exists affiliate_clicks_admin_read on public.affiliate_clicks;
create policy affiliate_clicks_admin_read on public.affiliate_clicks for select using (public.is_admin());

revoke all on public.money_pools, public.money_participations, public.money_eligibility_cache,
  public.money_events, public.affiliate_links, public.affiliate_clicks from anon, authenticated;
grant select on public.money_pools, public.money_participations, public.money_eligibility_cache,
  public.affiliate_links, public.money_events, public.affiliate_clicks to authenticated;

-- 7) Config por país (todo points_only) -----------------------------------------
insert into public.remote_config (key, value) values ('money', $j$
{
  "global": { "kill_switch": false, "max_stakes_minor": [500, 1000, 2000], "rake_bps_default": 500,
              "min_participants": 2, "settle_review_threshold_minor": 50000 },
  "countries": {
    "ES": { "mode": "points_only", "enabled": false, "legal_basis_ref": null, "currency": "EUR",
            "domain": "dinero.vinko.es", "provider": null, "stakes_minor": [500, 1000, 2000],
            "limits": { "stake_max_minor": 5000, "pools_per_day_max": 5 },
            "rg": { "self_exclusion_registry": "RGIAJ", "reality_check_minutes": 60, "no_welcome_bonus": true,
                    "withdraw_before_close": true, "no_winner_policy": "refund" },
            "methods": ["bizum", "debit_card", "open_banking", "paypal"], "credit_cards": false,
            "affiliate": { "enabled": false, "legal_basis_ref": null } },
    "GB": { "mode": "points_only", "enabled": false, "legal_basis_ref": null, "currency": "GBP",
            "domain": "money.vinko.co.uk", "provider": null, "stakes_minor": [500, 1000, 2000],
            "limits": { "stake_max_minor": 5000, "pools_per_day_max": 5 },
            "rg": { "self_exclusion_registry": "GAMSTOP", "reality_check_minutes": 60,
                    "withdraw_before_close": true, "no_winner_policy": "refund" },
            "methods": ["debit_card", "open_banking", "paypal"], "credit_cards": false,
            "affiliate": { "enabled": false, "legal_basis_ref": null } },
    "PE": { "mode": "points_only", "enabled": false, "currency": "PEN", "methods": ["yape", "plin", "pagoefectivo", "debit_card", "bank_transfer"] },
    "CO": { "mode": "points_only", "enabled": false, "currency": "COP", "methods": ["pse", "nequi", "daviplata", "efecty", "debit_card"] },
    "MX": { "mode": "points_only", "enabled": false, "currency": "MXN", "methods": ["spei", "oxxo_pay", "debit_card", "codi"] },
    "AR": { "mode": "points_only", "enabled": false, "currency": "ARS", "methods": ["mercado_pago", "cvu_transfer", "debit_card", "rapipago"], "note": "licencia por provincia" },
    "BR": { "mode": "points_only", "enabled": false, "currency": "BRL", "methods": ["pix", "ted", "debit_card"], "note": "solo affiliate_only con operador licenciado" },
    "CL": { "mode": "points_only", "enabled": false, "note": "sin ley de juego online aprobada" },
    "US": { "mode": "points_only", "enabled": false, "note": "estado a estado" }
  }
}$j$::jsonb) on conflict (key) do nothing;

-- Validación al guardar (solo admin; §5 de la spec). ÚNICA vía de escritura de money.countries.*
create or replace function public.money_config_set_country(p_country text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb; v_mode text; v_enabled boolean;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if p_country !~ '^[A-Z]{2}$' then raise exception 'VINKO_MONEY_BAD_COUNTRY'; end if;
  v_mode := p_value->>'mode'; v_enabled := coalesce((p_value->>'enabled')::boolean, false);
  if v_mode not in ('points_only','affiliate_only','partner','own') then raise exception 'VINKO_MONEY_BAD_MODE'; end if;
  if v_enabled then
    if v_mode = 'points_only' then raise exception 'VINKO_MONEY_ENABLED_NEEDS_MODE'; end if;
    if nullif(trim(coalesce(p_value->>'legal_basis_ref','')),'') is null then raise exception 'VINKO_MONEY_NO_LEGAL_BASIS'; end if;
    if p_value->>'legal_basis_valid_from' is null then raise exception 'VINKO_MONEY_NO_LEGAL_DATE'; end if;
    if v_mode in ('partner','own') then
      if nullif(trim(coalesce(p_value->>'provider','')),'') is null then raise exception 'VINKO_MONEY_NO_PROVIDER'; end if;
      if p_value->>'provider' = 'mock' and coalesce(cfg('misc')->>'env', 'production') = 'production' then raise exception 'VINKO_MONEY_MOCK_IN_PROD'; end if;
      if nullif(trim(coalesce(p_value->>'domain','')),'') is null then raise exception 'VINKO_MONEY_NO_DOMAIN'; end if;
      if p_value->'rg'->>'self_exclusion_registry' is null then raise exception 'VINKO_MONEY_NO_RG'; end if;
      if coalesce(p_value->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'VINKO_MONEY_BAD_CURRENCY'; end if;
    end if;
  end if;
  if coalesce((p_value->'affiliate'->>'enabled')::boolean, false)
     and nullif(trim(coalesce(p_value->'affiliate'->>'legal_basis_ref','')),'') is null then
    raise exception 'VINKO_MONEY_AFFILIATE_NO_LEGAL_BASIS';
  end if;
  v_cfg := coalesce(cfg('money'), '{"global":{},"countries":{}}'::jsonb);
  v_cfg := jsonb_set(v_cfg, array['countries', p_country], p_value, true);
  update remote_config set value = v_cfg, updated_at = now() where key = 'money';
  perform emit_event('money_config_changed', auth.uid(), jsonb_build_object('country', p_country, 'mode', v_mode, 'enabled', v_enabled));
  return v_cfg->'countries'->p_country;
end $$;
revoke execute on function public.money_config_set_country(text, jsonb) from public, anon;

create or replace function public.money_kill_switch_set(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update remote_config set value = jsonb_set(value, '{global,kill_switch}', to_jsonb(p_on), true), updated_at = now() where key = 'money';
  perform emit_event('money_kill_switch', auth.uid(), jsonb_build_object('on', p_on));
end $$;
revoke execute on function public.money_kill_switch_set(boolean) from public, anon;

-- 8) Lectura de modo por país (SSR y cliente): qué hay habilitado, sin secretos --
create or replace function public.money_country_mode(p_country text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'country', upper(p_country),
    'mode', coalesce(cfg('money')->'countries'->upper(p_country)->>'mode', 'points_only'),
    'enabled', coalesce((cfg('money')->'countries'->upper(p_country)->>'enabled')::boolean, false)
               and not coalesce((cfg('money')->'global'->>'kill_switch')::boolean, false),
    'affiliate', coalesce((cfg('money')->'countries'->upper(p_country)->'affiliate'->>'enabled')::boolean, false),
    'stakes_minor', coalesce(cfg('money')->'countries'->upper(p_country)->'stakes_minor', '[]'::jsonb),
    'currency', cfg('money')->'countries'->upper(p_country)->>'currency'
  );
$$;

-- 9) RPCs de referencia -------------------------------------------------------------
-- Crear la referencia de bolsa tras provider.createPool (admin o service role). El trigger guard valida todo lo demás.
create or replace function public.money_pool_ref_create(
  p_porra uuid, p_country text, p_provider text, p_external text, p_currency text,
  p_stake_minor int, p_rake_bps int, p_closes_at timestamptz, p_created_by uuid, p_legal_basis_ref text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  insert into money_pools (porra_id, country, provider, external_pool_id, currency, stake_minor, rake_bps, status, legal_basis_ref, created_by, closes_at)
    values (p_porra, upper(p_country), p_provider, p_external, upper(p_currency), p_stake_minor, p_rake_bps,
            case when p_external is null then 'draft' else 'open' end, p_legal_basis_ref, p_created_by, p_closes_at)
    returning id into v_id;
  perform emit_event('money_pool_created', p_created_by, jsonb_build_object('country', upper(p_country), 'provider', p_provider,
    'stake_bucket', case when p_stake_minor <= 500 then 'S' when p_stake_minor <= 1000 then 'M' else 'L' end));
  return v_id;
end $$;
revoke execute on function public.money_pool_ref_create(uuid, text, text, text, text, int, int, timestamptz, uuid, text) from public, anon;

-- Cambiar el estado de una bolsa desde el servidor (admin o servicio) tras hablar con el proveedor.
create or replace function public.money_pool_ref_set_status(p_pool uuid, p_status public.money_pool_status, p_external text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update money_pools set status = p_status, external_pool_id = coalesce(p_external, external_pool_id),
    settled_at = case when p_status = 'settled' then now() else settled_at end
    where id = p_pool;
  if not found then raise exception 'VINKO_MONEY_UNKNOWN_POOL'; end if;
end $$;
revoke execute on function public.money_pool_ref_set_status(uuid, public.money_pool_status, text) from public, anon;

-- Referencia de participación (MN-03): la crea el propio usuario tras provider.join;
-- queda 'pending' hasta el webhook participation.confirmed. Los guards validan el resto.
create or replace function public.money_join_ref(p_pool uuid, p_option_idx int, p_external_ref text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pool money_pools%rowtype; v_n int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v_pool from money_pools where id = p_pool for update;
  if not found then raise exception 'VINKO_MONEY_UNKNOWN_POOL'; end if;
  if coalesce((cfg('money')->'global'->>'kill_switch')::boolean, false) then raise exception 'VINKO_MONEY_KILL_SWITCH'; end if;
  if not coalesce((cfg('money')->'countries'->v_pool.country->>'enabled')::boolean, false) then raise exception 'VINKO_MONEY_COUNTRY_OFF'; end if;
  if v_pool.closes_at <= now() then raise exception 'VINKO_MONEY_CLOSED'; end if;
  if p_option_idx < 0 or p_option_idx >= (select count(*) from porra_options where porra_id = v_pool.porra_id) then
    raise exception 'VINKO_MONEY_BAD_OPTION';
  end if;
  select count(*) into v_n from money_participations mp
    where mp.user_id = auth.uid() and mp.created_at > now() - interval '1 day' and mp.status <> 'failed';
  if v_n >= coalesce((cfg('money')->'countries'->v_pool.country->'limits'->>'pools_per_day_max')::int, 5) then
    raise exception 'VINKO_MONEY_LIMIT';
  end if;
  insert into money_participations (money_pool_id, user_id, option_idx, external_ref)
    values (p_pool, auth.uid(), p_option_idx, p_external_ref)
    on conflict (money_pool_id, user_id) do update
      set external_ref = excluded.external_ref, option_idx = excluded.option_idx, updated_at = now()
      where money_participations.status in ('pending','failed')
    returning id into v_id;
  if v_id is null then raise exception 'VINKO_MONEY_ALREADY_IN'; end if;
  perform emit_event('money_join_started', auth.uid(), jsonb_build_object('country', v_pool.country, 'provider', v_pool.provider));
  return v_id;
end $$;
revoke execute on function public.money_join_ref(uuid, int, text) from public, anon;

-- Retirarse antes del cierre (si el país lo permite): el proveedor devuelve; aquí solo se marca.
create or replace function public.money_withdraw_ref(p_pool uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pool money_pools%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_pool from money_pools where id = p_pool;
  if not found or v_pool.status <> 'open' or v_pool.closes_at <= now() then raise exception 'VINKO_MONEY_CLOSED'; end if;
  if not coalesce((cfg('money')->'countries'->v_pool.country->'rg'->>'withdraw_before_close')::boolean, true) then
    raise exception 'VINKO_MONEY_NO_WITHDRAW';
  end if;
  update money_participations set status = 'refunded', updated_at = now()
    where money_pool_id = p_pool and user_id = auth.uid() and status in ('pending','confirmed');
end $$;
revoke execute on function public.money_withdraw_ref(uuid) from public, anon;

-- Catálogo (admin): fuente oficial y marcado de elegibilidad.
create or replace function public.results_feed_upsert(p_key text, p_provider text, p_label text, p_event_at timestamptz, p_options_count int, p_source_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  insert into results_feed (key, provider, label, event_at, options_count, source_url, checked_by)
    values (p_key, p_provider, left(p_label, 120), p_event_at, p_options_count, p_source_url, auth.uid())
    on conflict (key) do update set provider = excluded.provider, label = excluded.label, event_at = excluded.event_at,
      options_count = excluded.options_count, source_url = excluded.source_url, checked_by = auth.uid();
end $$;
revoke execute on function public.results_feed_upsert(text, text, text, timestamptz, int, text) from public, anon;

create or replace function public.results_feed_set_result(p_key text, p_idx int, p_source_url text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update results_feed set result_option_idx = p_idx, resolved_at = now(), checked_by = auth.uid(),
    source_url = coalesce(p_source_url, source_url) where key = p_key and p_idx between 0 and options_count - 1;
  if not found then raise exception 'VINKO_MONEY_BAD_RESULT'; end if;
end $$;
revoke execute on function public.results_feed_set_result(text, int, text) from public, anon;

create or replace function public.money_admin_set_source(p_porra uuid, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if p_key is null then
    if exists (select 1 from money_pools where porra_id = p_porra) then raise exception 'VINKO_MONEY_HAS_POOL'; end if;
    update porras set money_eligible = false, resolution_source_ref = null where id = p_porra;
  else
    if (select options_count from results_feed where key = p_key) <> (select count(*) from porra_options where porra_id = p_porra) then
      raise exception 'VINKO_MONEY_OPTIONS_MISMATCH';
    end if;
    update porras set resolution_source_ref = p_key, money_eligible = true where id = p_porra;  -- el trigger valida origen/plantilla/visibilidad
  end if;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
end $$;
revoke execute on function public.money_admin_set_source(uuid, text) from public, anon;

-- Una porra con bolsa de dinero solo se resuelve con el resultado de la fuente oficial:
-- el juez humano no decide con dinero (§0 y §1.2.7 de la spec).
create or replace function public.porras_money_result_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_idx int; v_res int;
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') and exists (select 1 from money_pools where porra_id = new.id) then
    select idx into v_idx from porra_options where id = new.winning_option_id;
    select result_option_idx into v_res from results_feed where key = new.resolution_source_ref;
    if v_res is null or v_idx is null or v_res <> v_idx then raise exception 'VINKO_MONEY_RESULT_REQUIRED'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_porras_money_result on public.porras;
create trigger trg_porras_money_result before update of status, winning_option_id on public.porras
  for each row execute function public.porras_money_result_guard();

-- Procesar un webhook YA verificado (firma HMAC comprobada en la Edge Function money-webhook).
-- Idempotente por event_id: la primera inserción gana; los duplicados devuelven false.
-- Registro y efectos en la MISMA transacción: si algo falla, no queda rastro y el proveedor reintenta.
create or replace function public.money_apply_event_impl(p_event_id text, p_provider text, p_type text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_pool money_pools%rowtype; v_part money_participations%rowtype; v_user uuid;
begin
  insert into money_events (event_id, provider, type, payload) values (p_event_id, p_provider, p_type, p_payload)
    on conflict (event_id) do nothing;
  if not found then return false; end if;
  select * into v_pool from money_pools where provider = p_provider and external_pool_id = p_payload->>'external_pool_id' for update;
  if p_type like 'participation.%' then
    if v_pool.id is null then raise exception 'VINKO_MONEY_UNKNOWN_POOL'; end if;
    select * into v_part from money_participations
      where money_pool_id = v_pool.id and external_ref = p_payload->>'participation_ref' for update;
    if not found then raise exception 'VINKO_MONEY_UNKNOWN_PARTICIPATION'; end if;
    update money_participations set status = case p_type
        when 'participation.confirmed' then 'confirmed'::money_participation_status
        when 'participation.failed' then 'failed'::money_participation_status
        when 'participation.refunded' then 'refunded'::money_participation_status
        when 'participation.paid' then 'paid'::money_participation_status else status end
      where id = v_part.id;
    if p_type = 'participation.confirmed' then
      perform emit_event('money_join_confirmed', v_part.user_id, jsonb_build_object('country', v_pool.country, 'provider', p_provider));
    elsif p_type = 'participation.failed' then
      perform emit_event('money_join_failed', v_part.user_id, jsonb_build_object('reason', coalesce(p_payload->>'reason','unknown')));
    end if;
  elsif p_type in ('pool.closed','pool.settled','pool.voided') then
    if v_pool.id is null then raise exception 'VINKO_MONEY_UNKNOWN_POOL'; end if;
    update money_pools set status = case p_type when 'pool.closed' then 'closed'::money_pool_status
        when 'pool.settled' then 'settled'::money_pool_status else 'voided'::money_pool_status end,
      settled_at = case when p_type = 'pool.settled' then now() else settled_at end
      where id = v_pool.id;
    if p_type = 'pool.settled' then
      perform emit_event('money_pool_settled', v_pool.created_by, jsonb_build_object(
        'participants', coalesce((p_payload->>'participants')::int, 0), 'winners_n', coalesce((p_payload->>'winners_n')::int, 0)));
    elsif p_type = 'pool.voided' then
      perform emit_event('money_pool_voided', v_pool.created_by, jsonb_build_object('reason', coalesce(p_payload->>'reason','unknown')));
    end if;
  elsif p_type = 'kyc.updated' then
    v_user := (p_payload->>'user_id')::uuid;
    insert into money_eligibility_cache (user_id, country, kyc_status, eligible, reasons)
      values (v_user, upper(p_payload->>'country'), coalesce(p_payload->>'kyc_status','none'), false, '{kyc_required}')
      on conflict (user_id, country) do update set kyc_status = excluded.kyc_status, eligible = false, checked_at = now();
    perform emit_event('money_kyc_updated', v_user, jsonb_build_object('status', coalesce(p_payload->>'kyc_status','none')));
  elsif p_type = 'account.suspended' then
    v_user := (p_payload->>'user_id')::uuid;
    update money_eligibility_cache set eligible = false, reasons = array_append(reasons, 'self_excluded'), checked_at = now() where user_id = v_user;
  else
    raise exception 'VINKO_MONEY_UNKNOWN_EVENT';
  end if;
  update money_events set processed_at = now() where event_id = p_event_id;
  return true;
end $$;
revoke execute on function public.money_apply_event_impl(text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.money_apply_event(p_event_id text, p_provider text, p_type text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  return public.money_apply_event_impl(p_event_id, p_provider, p_type, p_payload);
end $$;
revoke execute on function public.money_apply_event(text, text, text, jsonb) from public, anon, authenticated;

-- Registrar un webhook verificado que no se pudo procesar (error de datos), para
-- verlo y reintentarlo desde /admin/money/events.
create or replace function public.money_event_fail(p_event_id text, p_provider text, p_type text, p_payload jsonb, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  insert into money_events (event_id, provider, type, payload, error) values (p_event_id, p_provider, p_type, p_payload, left(p_error, 300))
    on conflict (event_id) do update set error = excluded.error;
end $$;
revoke execute on function public.money_event_fail(text, text, text, jsonb, text) from public, anon, authenticated;

-- Reprocesar desde admin: quita el registro fallido y vuelve a aplicar.
create or replace function public.money_event_retry(p_event_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r money_events%rowtype;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into r from money_events where event_id = p_event_id and processed_at is null;
  if not found then raise exception 'VINKO_MONEY_UNKNOWN_EVENT'; end if;
  delete from money_events where event_id = p_event_id;
  return public.money_apply_event_impl(r.event_id, r.provider, r.type, r.payload);
end $$;
revoke execute on function public.money_event_retry(text) from public, anon;

-- 10) Invariante de esquema (test 1 de §10): cero columnas de dinero ligadas a usuario.
-- Devuelve las columnas que violan la regla. CI espera 0 filas.
create or replace function public.money_schema_invariant() returns table (table_name text, column_name text)
language sql stable security definer set search_path = public as $$
  with tu as (
    select distinct c.table_name::text from information_schema.columns c
    where c.table_schema = 'public' and c.column_name in ('user_id','created_by','profile_id')
    union select 'profiles'
  )
  select c.table_name::text, c.column_name::text
  from information_schema.columns c join tu on tu.table_name = c.table_name::text
  where c.table_schema = 'public'
    and (c.column_name ~* '(balance|wallet|iban|^pan$|card_|cents|_minor$|^amount_|_amount$|currency)')
    -- Excepción documentada: configuración de la bolsa (entrada fija y divisa), no dinero de usuario.
    and not (c.table_name = 'money_pools' and c.column_name in ('stake_minor','currency'))
$$;
grant execute on function public.money_schema_invariant() to anon, authenticated;

-- Las tres columnas 'amount' existentes son Vinkos (puntos virtuales), no dinero: se documentan.
comment on column public.ad_impressions.amount is 'Vinkos (puntos virtuales). No es dinero.';
comment on column public.porra_payouts.amount is 'Vinkos (puntos virtuales). No es dinero.';
comment on column public.video_rewards.amount is 'Vinkos (puntos virtuales). No es dinero.';

-- 11) Cero mezcla (test 6 de §10): ningún RPC money_* toca points/xp/marcador_total y ningún
-- RPC de puntos/tienda/anuncios toca tablas money_*. Se verifica estáticamente en CI
-- (tests/unit/money-separation.test.mjs, misma técnica que skill-guard.test.mjs).

-- 12) Grants a authenticated. Los RPC de usuario/admin revocan de public+anon (arriba)
-- pero NECESITAN grant explícito a authenticated: el cliente de servidor (supabaseServer)
-- actúa con rol authenticated, y la autorización real la hacen los checks de cuerpo
-- (is_admin(), auth.uid(), jwt_is_anonymous()). Sin esto, «permission denied for function».
-- Los RPC de servicio (money_apply_event, money_apply_event_impl, money_event_fail) NO se
-- conceden: los llama el service role, que ignora estos grants.
grant execute on function public.money_config_set_country(text, jsonb) to authenticated;
grant execute on function public.money_kill_switch_set(boolean) to authenticated;
grant execute on function public.money_pool_ref_create(uuid, text, text, text, text, int, int, timestamptz, uuid, text) to authenticated;
grant execute on function public.money_pool_ref_set_status(uuid, public.money_pool_status, text) to authenticated;
grant execute on function public.money_join_ref(uuid, int, text) to authenticated;
grant execute on function public.money_withdraw_ref(uuid) to authenticated;
grant execute on function public.results_feed_upsert(text, text, text, timestamptz, int, text) to authenticated;
grant execute on function public.results_feed_set_result(text, int, text) to authenticated;
grant execute on function public.money_admin_set_source(uuid, text) to authenticated;
grant execute on function public.money_event_retry(text) to authenticated;

notify pgrst, 'reload schema';
