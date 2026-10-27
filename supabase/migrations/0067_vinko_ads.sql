-- 0067_vinko_ads — Cimientos de VINKO ADS (VINKO_PANTALLAS §6 / PRODUCT_SPEC
-- §7.1): plataforma de ANUNCIANTES self-service. El pago del anunciante es B2B
-- (Stripe, cuenta de la C-Corp); el JUGADOR nunca toca dinero (vota con Vinkos).
-- Anuncios de operadores de juego: solo donde markets.operator_ads_enabled sea
-- true (=false hasta licencia Coljuegos + luz verde legal Colombia).
-- Distinto del 'sponsor' de 0028 (config única del rewarded de la casa).
--
-- Paso ADITIVO: tablas nuevas + porras.campaign_id nullable. No lo lee aún el
-- jugador; la marca pública de una porra patrocinada se expondrá con un RPC
-- security-definer al cablear A0 (los financieros de la campaña quedan privados).

-- Precios y reglas (en remote_config para tocarlos sin desplegar; §6 "Datos y reglas").
-- Cifras de ejemplo coherentes con la spec (120 USD a 0,08/voto ≈ 1.500 votos).
insert into public.remote_config (key, value) values ('ads', jsonb_build_object(
  'enabled', false,               -- interruptor general de la plataforma
  'price_per_vote_cents', 8,      -- 0,08 USD por voto
  'min_budget_cents', 5000,       -- mínimo 50 USD
  'feed_every_n', 6,              -- 1 porra patrocinada de cada N en Descubrir
  'founder_discount_pct', 20,     -- −20 % anunciantes fundadores
  'min_cell', 50                  -- mínimo de personas por celda en "qué opina tu público"
))
on conflict (key) do nothing;

-- Un ANUNCIANTE lo gestiona una cuenta (owner). Marca + logo.
create table public.advertisers (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  logo_url   text,
  created_at timestamptz not null default now()
);
alter table public.advertisers enable row level security;
create policy advertisers_owner on public.advertisers
  for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy advertisers_admin on public.advertisers
  for all using (public.is_admin()) with check (public.is_admin());

-- CAMPAÑA. price_per_vote_cents se congela al crearla. Los financieros
-- (budget/spent) son privados del anunciante (RLS); nunca llegan al jugador.
create table public.ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  advertiser_id  uuid not null references public.advertisers(id) on delete cascade,
  market         text not null references public.markets(code),
  status         text not null default 'draft'
                 check (status in ('draft','in_review','active','paused','ended','rejected')),
  objective      text check (objective in ('awareness','opinion','traffic')),
  format         text not null default 'sponsored_porra'
                 check (format in ('sponsored_porra','sponsored_league','sponsored_prize','rewarded_video','receipt_signature')),
  operator       boolean not null default false,          -- anunciante de juego (solo R5)
  budget_cents         bigint not null default 0,
  price_per_vote_cents int not null,
  spent_cents          bigint not null default 0,
  votes                int not null default 0,
  cities         text[] not null default '{}',
  cta_text       text,                                    -- "Al votar: 20 % en Arepa Co."
  cta_url        text,
  creative_url   text,
  creative_kind  text check (creative_kind in ('image','video')),
  creative_review text not null default 'pending'
                 check (creative_review in ('pending','approved','rejected')),
  review_note    text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.ad_campaigns enable row level security;
create policy ad_campaigns_owner on public.ad_campaigns
  for all using (exists (select 1 from advertisers a where a.id = advertiser_id and a.owner = auth.uid()))
  with check (exists (select 1 from advertisers a where a.id = advertiser_id and a.owner = auth.uid()));
create policy ad_campaigns_admin on public.ad_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

-- Una porra PATROCINADA es una porra normal ligada a una campaña; la marca se
-- deriva de campaña→anunciante. Nunca en grupos (§6 A0): group_id null.
alter table public.porras add column campaign_id uuid references public.ad_campaigns(id);
create index porras_campaign_idx on public.porras (campaign_id) where campaign_id is not null;

notify pgrst, 'reload schema';
