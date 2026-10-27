-- 0064_markets — Cimientos de MERCADOS (spec de mercados §1). Tabla `markets` +
-- columna `market` en las tablas que se segmentan por país. PASO ADITIVO: las
-- columnas son nullable y nadie las lee todavía; el cableado (feed/liga/pique por
-- mercado, i18n enrutado, fuera los Europe/Madrid) va en migraciones/commits
-- siguientes. No cambia el comportamiento actual.
--
-- Seed: CO (Colombia, lanzamiento) y GLOBAL (resto del mundo, jugar sin premios).
-- ES queda INACTIVO (spec: "quitar España"): su catálogo editorial deja de
-- servirse, pero el mercado existe para poder marcar su contenido histórico.
-- prizes_enabled / operator_ads_enabled: false en TODOS (solo-puntos; se activan
-- por país solo con dictamen legal). noun: 'porra' en todos por ahora — el 'polla'
-- de CO está pendiente de confirmación de Ricardo, no se siembra sin confirmar.

create table public.markets (
  code                 text primary key,              -- 'CO', 'GLOBAL', 'ES'
  name                 text not null,
  locale               text not null,                 -- es-CO, es, en
  tz                   text not null,                 -- IANA: America/Bogota, UTC…
  active               boolean not null default true,
  path                 text not null,                 -- '/co', '/'
  daily_pick_hour      int not null default 9,         -- hora LOCAL a la que abre el pronóstico del día
  league_cutoff        int not null default 4,         -- corte de liga: lunes a esta hora local
  noun                 text not null default 'porra',  -- sustantivo del mercado ('polla' CO pendiente)
  prizes_enabled       boolean not null default false, -- premios con valor: solo con licencia por país
  operator_ads_enabled boolean not null default false, -- afiliación/ads de operador de juego: idem
  vinko_ads_targeting  boolean not null default false, -- Vinko Ads (display, da solo Vinkos) activo en el mercado
  content_quota        int not null default 0,         -- cupo diario del agente de contenido (§2.5)
  created_at           timestamptz not null default now()
);
alter table public.markets enable row level security;
create policy markets_read  on public.markets for select using (true);
create policy markets_admin on public.markets
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.markets (code, name, locale, tz, active, path, daily_pick_hour, league_cutoff, noun) values
  ('GLOBAL', 'Global',   'es',    'UTC',            true,  '/',   9, 4, 'porra'),
  ('CO',     'Colombia', 'es-CO', 'America/Bogota', true,  '/co', 9, 4, 'porra'),
  ('ES',     'España',   'es',    'Europe/Madrid',  false, '/es', 9, 4, 'porra');

-- Columna `market` en las tablas segmentables. Nullable: una porra de grupo o el
-- contenido aún sin clasificar van sin mercado. FK a markets(code) para integridad.
alter table public.porras        add column market text references public.markets(code);
alter table public.profiles      add column market text references public.markets(code);
alter table public.daily_picks   add column market text references public.markets(code);
alter table public.league_groups add column market text references public.markets(code);

notify pgrst, 'reload schema';
