-- ⚠️ LEGADO (14-sep-2026): este esquema pre-alfa NO se aplica. El esquema
-- vigente del ALPHA FREEZE vive en supabase/migrations/ (0001–0003).
-- Se conserva como referencia de diseño (duelos, rachas, ligas: CONGELADO).
-- ============================================================================
-- VINKO — esquema v1 (Supabase / Postgres)
-- Pegar en: Dashboard → SQL Editor → New query → Run
--
-- Reglas de oro codificadas AQUÍ, no solo en el cliente:
--   · No existe NINGUNA columna de dinero. Solo puntos (pts) y precisión (prec).
--   · Los puntos jamás se compran: solo entran por daily_open(), ad_recharge()
--     (máx. 5/día, 90 pts < asignación base de 100) y ganar porras. Todo por
--     funciones SECURITY DEFINER; el cliente NUNCA escribe pts directamente.
--   · Premios por ranking de PRECISIÓN: prec solo sube al acertar porras de
--     puntos, ponderada por dificultad. Ningún flujo la compra.
--   · Porras 1v1 (duels): árbitro aceptado por ambos, decide el juez.
--   · Las porras con dinero de grupos privados NO existen en este esquema:
--     llegarán (solo como ledger P2P informativo) tras el dictamen legal.
-- ============================================================================

-- ---------- invariantes regla de oro 2 (una sola fuente de verdad) ----------
create schema if not exists vinko;
create or replace function vinko.daily_base()      returns int language sql immutable as $$ select 100 $$;
create or replace function vinko.max_ad_recharges() returns int language sql immutable as $$ select 5 $$;
create or replace function vinko.ad_recharge_pts()  returns int language sql immutable as $$ select 90 $$; -- < daily_base SIEMPRE

-- ---------------------------------- perfiles --------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  birth_date  date,                          -- autodeclarada; el método robusto lo definirá el dictamen
  lang        text not null default 'es' check (lang in ('es','pt','en')),
  pts         int  not null default 100 check (pts >= 0),
  prec        int  not null default 0  check (prec >= 0),
  hits        int  not null default 0,
  plays       int  not null default 0,
  xp          int  not null default 0,
  streak_days int  not null default 0,
  streak_last date,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- edad: mínimo 14 para registrarse (regla de oro 8); +18 se deriva, nunca se guarda a mano
create or replace function public.is_adult(p profiles) returns boolean
language sql stable as $$ select p.birth_date is not null and p.birth_date <= (current_date - interval '18 years') $$;

create or replace function vinko.check_min_age() returns trigger language plpgsql as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '14 years') then
    raise exception 'VINKO_MIN_AGE: edad mínima de registro 14 años';
  end if;
  return new;
end $$;
drop trigger if exists trg_min_age on public.profiles;
create trigger trg_min_age before insert or update of birth_date on public.profiles
  for each row execute function vinko.check_min_age();

-- perfil automático al registrarse
create or replace function vinko.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
  for each row execute function vinko.handle_new_user();

create policy "perfil: leer todos"    on public.profiles for select using (true);
create policy "perfil: editar propio" on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- el cliente solo puede tocar campos inocuos; los contadores van por RPC
    and pts  = (select pts  from public.profiles where id = auth.uid())
    and prec = (select prec from public.profiles where id = auth.uid())
    and hits = (select hits from public.profiles where id = auth.uid())
    and plays= (select plays from public.profiles where id = auth.uid())
    and xp   = (select xp   from public.profiles where id = auth.uid())
  );

-- ---------------------------------- porras ----------------------------------
create table if not exists public.pools (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  q          text not null check (char_length(q) between 5 and 120),
  cat        text not null default 'social',
  is_sport   boolean not null default false,   -- controla el botón de afiliación (solo UI, tras age-gate)
  entry      int  not null check (entry in (10,25,50)),
  closes_at  timestamptz not null,
  is_flash   boolean not null default false,   -- ⚡ x2: SOLO afecta a pts, JAMÁS a prec
  video_url  text,                             -- lo rellena el pipeline IA (Edge Function)
  video_status text not null default 'none' check (video_status in ('none','queued','ready','user')),
  resolved_opt int,                            -- null = abierta
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pool_options (
  pool_id uuid references public.pools(id) on delete cascade,
  idx     int  not null check (idx between 0 and 3),
  label   text not null check (char_length(label) between 1 and 30),
  votes   int  not null default 0,
  primary key (pool_id, idx)
);
alter table public.pools enable row level security;
alter table public.pool_options enable row level security;
create policy "porras: leer públicas"  on public.pools for select using (is_public or created_by = auth.uid());
create policy "porras: crear propias"  on public.pools for insert with check (created_by = auth.uid());
create policy "opciones: leer"         on public.pool_options for select using (true);
create policy "opciones: crear con la porra" on public.pool_options for insert
  with check (exists (select 1 from public.pools p where p.id = pool_id and p.created_by = auth.uid()));

-- --------------------------------- apuestas ---------------------------------
create table if not exists public.bets (
  pool_id    uuid references public.pools(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  opt_idx    int  not null,
  entry      int  not null,
  paid       boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (pool_id, user_id)               -- una apuesta por porra
);
alter table public.bets enable row level security;
create policy "apuestas: leer propias" on public.bets for select using (user_id = auth.uid());
-- sin policy de insert: SOLO vía place_bet()

create or replace function public.place_bet(p_pool uuid, p_opt int) returns void
language plpgsql security definer set search_path = public as $$
declare v_entry int; v_closes timestamptz; v_resolved int;
begin
  select entry, closes_at, resolved_opt into v_entry, v_closes, v_resolved
    from pools where id = p_pool for update;
  if not found then raise exception 'VINKO_NO_POOL'; end if;
  if v_resolved is not null or v_closes <= now() then raise exception 'VINKO_CLOSED'; end if;
  update profiles set pts = pts - v_entry, plays = plays + 1, xp = xp + 20
    where id = auth.uid() and pts >= v_entry;
  if not found then raise exception 'VINKO_NO_PTS'; end if;
  insert into bets (pool_id, user_id, opt_idx, entry) values (p_pool, auth.uid(), p_opt, v_entry);
  update pool_options set votes = votes + 1 where pool_id = p_pool and idx = p_opt;
end $$;

-- reparto al resolver: bote entre acertantes; prec ponderada por dificultad (jamás x2 flash)
create or replace function public.resolve_pool(p_pool uuid, p_winner int) returns void
language plpgsql security definer set search_path = public as $$
declare v pools%rowtype; v_total int; v_winners int; v_pot int; v_share int; v_weight numeric;
begin
  select * into v from pools where id = p_pool for update;
  if v.created_by <> auth.uid() then raise exception 'VINKO_NOT_OWNER'; end if; -- v1: resuelve el creador; oráculos después
  if v.resolved_opt is not null then return; end if;
  select coalesce(sum(votes),0) into v_total from pool_options where pool_id = p_pool;
  select votes into v_winners from pool_options where pool_id = p_pool and idx = p_winner;
  v_pot := v_total * v.entry;
  v_share := greatest(1, round(v_pot / greatest(1, v_winners))) * case when v.is_flash then 2 else 1 end;
  v_weight := 1 + (1 - (v_winners::numeric / greatest(1, v_total)));
  update pools set resolved_opt = p_winner where id = p_pool;
  update profiles pr set
    pts  = pr.pts + v_share,
    hits = pr.hits + 1,
    prec = pr.prec + round(100 * v_weight),   -- la PRECISIÓN nunca lleva multiplicador
    xp   = pr.xp + 40
  from bets b where b.pool_id = p_pool and b.opt_idx = p_winner and b.user_id = pr.id;
  update bets set paid = true where pool_id = p_pool;
end $$;

-- ------------------------- economía diaria (regla de oro 2) ------------------
create table if not exists public.daily_claims (
  user_id uuid references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  kind    text not null check (kind in ('open','ad')),
  n       int  not null default 1,
  primary key (user_id, day, kind)
);
alter table public.daily_claims enable row level security;
create policy "claims: leer propios" on public.daily_claims for select using (user_id = auth.uid());

create or replace function public.daily_open() returns int
language plpgsql security definer set search_path = public as $$
declare v_last date; v_days int; v_mult numeric; v_gain int;
begin
  insert into daily_claims (user_id, day, kind) values (auth.uid(), current_date, 'open');
  -- (si ya reclamó hoy, el PK lanza y no se paga dos veces)
  select streak_last, streak_days into v_last, v_days from profiles where id = auth.uid();
  if v_last = current_date - 1 then v_days := v_days + 1; else v_days := 1; end if;
  v_mult := case when v_days >= 14 then 3 when v_days >= 7 then 2 when v_days >= 3 then 1.5 else 1 end;
  v_gain := round(vinko.daily_base() * v_mult);
  update profiles set pts = pts + v_gain, streak_days = v_days, streak_last = current_date, xp = xp + 10
    where id = auth.uid();
  return v_gain;
end $$;

create or replace function public.ad_recharge() returns int
language plpgsql security definer set search_path = public as $$
declare v_used int;
begin
  -- solo al quedarse casi sin puntos
  if (select pts from profiles where id = auth.uid()) >= vinko.daily_base() then
    raise exception 'VINKO_NOT_BROKE';
  end if;
  insert into daily_claims as dc (user_id, day, kind, n) values (auth.uid(), current_date, 'ad', 1)
    on conflict (user_id, day, kind) do update set n = dc.n + 1
    returning n into v_used;
  if v_used > vinko.max_ad_recharges() then
    raise exception 'VINKO_AD_LIMIT: máx. % recargas/día', vinko.max_ad_recharges();
  end if;
  update profiles set pts = pts + vinko.ad_recharge_pts() where id = auth.uid();
  return vinko.ad_recharge_pts();
end $$;

-- ------------------------------- retos 1v1 ----------------------------------
create table if not exists public.duels (
  id         uuid primary key default gen_random_uuid(),
  q          text not null check (char_length(q) between 5 and 120),
  creator    uuid not null references public.profiles(id),
  rival      uuid not null references public.profiles(id),
  judge      uuid not null references public.profiles(id),
  entry      int  not null check (entry in (10,25,50)),
  state      text not null default 'pending'
             check (state in ('pending','accepted','declined','resolved')),
  winner     uuid,
  created_at timestamptz not null default now(),
  check (creator <> rival), check (judge <> creator), check (judge <> rival)  -- árbitro neutral SIEMPRE
);
alter table public.duels enable row level security;
create policy "duelos: ver los míos" on public.duels for select
  using (auth.uid() in (creator, rival, judge));
-- crear/aceptar/resolver: SOLO vía RPC (el estado y los pts nunca se tocan directo)

create or replace function public.create_duel(p_q text, p_rival uuid, p_judge uuid, p_entry int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update profiles set pts = pts - p_entry where id = auth.uid() and pts >= p_entry;
  if not found then raise exception 'VINKO_NO_PTS'; end if;
  insert into duels (q, creator, rival, judge, entry) values (p_q, auth.uid(), p_rival, p_judge, p_entry)
    returning id into v_id;
  return v_id;
end $$;

-- aceptar = aceptar el reto Y al árbitro propuesto (los dos participantes lo validan)
create or replace function public.accept_duel(p_duel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v duels%rowtype;
begin
  select * into v from duels where id = p_duel for update;
  if v.rival <> auth.uid() then raise exception 'VINKO_NOT_RIVAL'; end if;
  if v.state <> 'pending' then raise exception 'VINKO_BAD_STATE'; end if;
  update profiles set pts = pts - v.entry where id = auth.uid() and pts >= v.entry;
  if not found then raise exception 'VINKO_NO_PTS'; end if;
  update duels set state = 'accepted' where id = p_duel;
end $$;

create or replace function public.resolve_duel(p_duel uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v duels%rowtype;
begin
  select * into v from duels where id = p_duel for update;
  if v.judge <> auth.uid() then raise exception 'VINKO_NOT_JUDGE'; end if;  -- SOLO el árbitro decide
  if v.state <> 'accepted' then raise exception 'VINKO_BAD_STATE'; end if;
  if p_winner not in (v.creator, v.rival) then raise exception 'VINKO_BAD_WINNER'; end if;
  update duels set state = 'resolved', winner = p_winner where id = p_duel;
  -- ANTI-COLUSIÓN: los 1v1 no suman PRECISIÓN global (la que reparte premios, regla de
  -- oro 3): dos amigos con árbitro cómplice la inflarían. Solo bote, aciertos y XP.
  update profiles set pts = pts + v.entry * 2, hits = hits + 1, plays = plays + 1,
                      xp = xp + 40
    where id = p_winner;
  update profiles set plays = plays + 1
    where id = case when p_winner = v.creator then v.rival else v.creator end;
end $$;

-- ------------------------------ analítica -----------------------------------
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  ev         text not null,
  props      jsonb not null default '{}',
  client_ts  timestamptz,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
create policy "eventos: insertar propios" on public.events for insert
  with check (user_id = auth.uid() or user_id is null);
-- sin select para clientes: los dashboards leen con service_role desde el servidor

-- ============================================================================
-- FIN v1. Fuera de este esquema A PROPÓSITO (requieren dictamen legal / fase 2):
--   grupos privados con dinero (ledger P2P), afiliación server-side, config remota.
-- ============================================================================
