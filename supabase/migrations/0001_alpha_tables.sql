-- ============================================================================
-- VINKO ALFA — 0001: tablas
-- ALPHA FREEZE (CLAUDE.md): loop crear→/p/[slug]→join→pick→resolver→ranking.
-- CERO filas en profiles o picks que no sean una persona real.
-- Sin columnas de dinero en ninguna tabla (regla de oro 1).
-- ============================================================================
create extension if not exists pgcrypto;

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text unique not null check (handle ~ '^[a-z0-9_]{3,24}$'),
  avatar_url text,
  birth_year int check (birth_year between 1900 and 2030), -- +18 DECLARADO (limitación conocida del alfa)
  points     int not null default 100 check (points >= 0), -- solo se modifica en servidor
  role       text not null default 'user' check (role in ('user','admin')),
  lang       text not null default 'es' check (lang in ('es','en')), -- PT-BR no se activa en el alfa
  created_at timestamptz not null default now()
);

create table public.porras (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  title             text not null check (char_length(title) between 5 and 120),
  created_by        uuid references public.profiles(id) on delete set null,
  is_template       boolean not null default false,
  source            text not null default 'user' check (source in ('user','template','editorial')),
  status            text not null default 'open' check (status in ('open','resolved','taken_down')),
  closes_at         timestamptz not null,
  winning_option_id uuid,
  created_at        timestamptz not null default now(),
  -- is_template y source=template nunca divergen
  constraint porras_template_coherente check (is_template = (source = 'template'))
);

create table public.porra_options (
  id       uuid primary key default gen_random_uuid(),
  porra_id uuid not null references public.porras(id) on delete cascade,
  idx      smallint not null check (idx between 0 and 5), -- 2–6 opciones
  label    text not null check (char_length(label) between 1 and 40),
  unique (porra_id, idx)
);
alter table public.porras
  add constraint porras_winning_option_fk
  foreign key (winning_option_id) references public.porra_options(id);

create table public.picks (
  porra_id     uuid not null references public.porras(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  option_id    uuid not null references public.porra_options(id),
  points_spent smallint not null default 10 check (points_spent = 10), -- pick fijo de 10; no se cambia
  created_at   timestamptz not null default now(),
  primary key (porra_id, user_id) -- un pick por (porra_id, user_id)
);

create table public.moderation_queue (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('porra','pick','profile','og_text')),
  target_id   uuid,
  reason      text not null,
  snippet     text,
  status      text not null default 'pending' check (status in ('pending','approved','removed')),
  created_at  timestamptz not null default now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz
);

create table public.topic_proposals (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  options    jsonb not null default '[]',
  source_url text,
  status     text not null default 'pending_review' check (status in ('pending_review','published','discarded')),
  created_at timestamptz not null default now()
);

create table public.ad_impressions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  impression_id text unique not null,  -- idempotencia: crédito 1 sola vez
  amount        smallint not null default 10 check (amount = 10),
  status        text not null default 'granted' check (status in ('granted','rejected')),
  created_at    timestamptz not null default now()
);

create index picks_porra_idx on public.picks (porra_id);
create index porras_status_idx on public.porras (status, closes_at);
create index porras_source_idx on public.porras (source);
create index ad_impressions_user_day_idx on public.ad_impressions (user_id, created_at);
create index modq_status_idx on public.moderation_queue (status, created_at);
