-- ============================================================================
-- VINKO — 0074_motor_datos: F1 del motor de contenido (doc 27-oct-2026, B.3).
--
--   · Datos: columnas nuevas en markets, tracked_entities, signals,
--     topic_proposals, porras y agent_runs (B.3.1) y las tablas content_events,
--     trend_observations, content_plan_days, resolution_proposals,
--     feed_snapshots y content_daily_metrics (B.3.2). RLS solo admin; los
--     trabajos usan service_role.
--   · Config: remote_config.content_engine (B.3.3) sembrada APAGADA
--     (enabled=false). La política entra (decisión de Ricardo, 27-oct): fuera
--     'partisan_politics' de trend_agent.hard_vetoes.
--   · publish_proposal y agent_autopublish: opciones a 40 caracteres (el check
--     de porra_options, 0001) y la porra publicada hereda mercado, resolución y
--     planned_by='editor'.
--   · Barrido: 0073 lo desprograma en cada deploy; aquí vuelve a programarse
--     CON GUARDA (public.content_engine_on()). Mientras el motor esté apagado,
--     el cron no despacha nada.
--
-- ADITIVA e IDEMPOTENTE: el deploy la re-aplica en cada merge (umbral ≥ 72). Nada de
-- borrar datos; los updates de datos solo tocan filas que aún no se tocaron.
-- ============================================================================

-- ─────────────────────────────── markets ────────────────────────────────────
alter table public.markets add column if not exists content_config jsonb not null default '{}';
alter table public.markets add column if not exists electoral_mode boolean not null default false;
-- Pique del día de CO a las 13:00 de Bogotá (spec de producto). Solo si sigue
-- en el 9 sembrado por 0064: un cambio a mano a otra hora no se pisa.
update public.markets set daily_pick_hour = 13 where code = 'CO' and daily_pick_hour = 9;

-- ─────────────────────── content_events (calendario) ────────────────────────
-- Sustituye la idea de results_feed (0045, borrada en 0060), sin nada de dinero.
create table if not exists public.content_events (
  id              uuid primary key default gen_random_uuid(),
  market          text references public.markets(code),
  kind            text not null check (kind in ('match','reality_gala','award','other')),
  provider        text not null,                 -- 'api_football' | 'editorial' | 'manual'
  external_id     text,
  competition     text,
  title           text not null,
  home            text,
  away            text,
  starts_at       timestamptz not null,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','live','finished','postponed','cancelled','abandoned')),
  importance      smallint not null default 1 check (importance between 1 and 3),
  result          jsonb,
  finished_at     timestamptz,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists content_events_market_start_idx on public.content_events (market, starts_at);

-- ─────────────────────────── tracked_entities ───────────────────────────────
alter table public.tracked_entities alter column pais set default 'CO';
alter table public.tracked_entities add column if not exists aliases text[] not null default '{}';
alter table public.tracked_entities add column if not exists external_ids jsonb not null default '{}';
-- market sustituye funcionalmente a pais (pais se queda por compatibilidad).
-- Se añade SIN default para rellenar primero desde pais (las semillas de 0024
-- son 'ES'); después, lo nuevo nace en CO.
alter table public.tracked_entities add column if not exists market text references public.markets(code);
update public.tracked_entities t
   set market = case when exists (select 1 from public.markets m where m.code = t.pais) then t.pais else 'CO' end
 where t.market is null;
alter table public.tracked_entities alter column market set default 'CO';
create index if not exists tracked_entities_market_sweep_idx
  on public.tracked_entities (market, activo, last_swept_at nulls first);

-- ─────────────────────────────── signals ────────────────────────────────────
alter table public.signals alter column country set default 'CO';
alter table public.signals add column if not exists market text references public.markets(code);
alter table public.signals add column if not exists source_kind text
  check (source_kind in ('news','trends','youtube','music','wiki','x','calendar','internal','manual'));
alter table public.signals add column if not exists entity_id uuid references public.tracked_entities(id) on delete set null;
alter table public.signals add column if not exists external_id text;
alter table public.signals add column if not exists spike numeric;
alter table public.signals add column if not exists heat numeric;
alter table public.signals add column if not exists observed_at timestamptz;
create unique index if not exists signals_source_external_key
  on public.signals (source_kind, external_id) where external_id is not null;
create index if not exists signals_market_status_idx on public.signals (market, status, created_at desc);

-- ──────────────────────────── topic_proposals ───────────────────────────────
alter table public.topic_proposals add column if not exists market text references public.markets(code);
alter table public.topic_proposals add column if not exists resolves_at timestamptz;
alter table public.topic_proposals add column if not exists resolution_kind text
  check (resolution_kind in ('calendar','news','manual'));
alter table public.topic_proposals add column if not exists resolution_source text;
alter table public.topic_proposals add column if not exists expected_split numeric
  check (expected_split between 0 and 100);
alter table public.topic_proposals add column if not exists confidence numeric
  check (confidence between 0 and 1);
alter table public.topic_proposals add column if not exists score_breakdown jsonb;
alter table public.topic_proposals add column if not exists heat numeric;
alter table public.topic_proposals add column if not exists autonomy text not null default 'B'
  check (autonomy in ('A','B'));
alter table public.topic_proposals add column if not exists event_id uuid
  references public.content_events(id) on delete set null;
alter table public.topic_proposals add column if not exists scheduled_for timestamptz;
alter table public.topic_proposals add column if not exists discard_reason text;
alter table public.topic_proposals drop constraint if exists topic_proposals_status_check;
alter table public.topic_proposals add constraint topic_proposals_status_check
  check (status in ('pending_review','scheduled','published','discarded','expired'));
create index if not exists topic_proposals_market_queue_idx
  on public.topic_proposals (market, status, score desc nulls last);

-- ──────────────────────────────── porras ────────────────────────────────────
alter table public.porras add column if not exists event_id uuid
  references public.content_events(id) on delete set null;
alter table public.porras add column if not exists resolution_kind text
  check (resolution_kind in ('calendar','news','manual'));
alter table public.porras add column if not exists resolution_source text;
alter table public.porras add column if not exists auto_resolve boolean not null default false;
alter table public.porras add column if not exists planned_by text
  check (planned_by in ('planner','editor','user','ads'));
alter table public.porras add column if not exists resolution_proposal_id uuid;

-- ───────────────────── trend_observations (serie del pico) ──────────────────
create table if not exists public.trend_observations (
  id          bigserial primary key,
  entity_id   uuid references public.tracked_entities(id) on delete cascade,
  term        text,
  source_kind text not null,
  day         date not null,
  value       numeric not null,
  check (entity_id is not null or term is not null)
);
create unique index if not exists trend_observations_key
  on public.trend_observations (coalesce(entity_id::text, term), source_kind, day);

-- ─────────────────── content_plan_days (salida del planificador) ────────────
create table if not exists public.content_plan_days (
  market          text references public.markets(code),
  day             date not null,
  target_new      int  not null,
  formula_n       int  not null,
  thermo_delta    int  not null default 0,
  manual_override int,
  inputs          jsonb not null,
  published       int  not null default 0,
  quick_resolve   int  not null default 0,
  computed_at     timestamptz not null default now(),
  primary key (market, day)
);

-- ──────────── resolution_proposals (proveedor, IA o editor → decisión) ──────
-- Ojo: NO es porra_result_proposals (0057), que es la propuesta del juez en el
-- reto. Esta es la del motor: de dónde sale el resultado y quién lo aprobó.
create table if not exists public.resolution_proposals (
  id                 uuid primary key default gen_random_uuid(),
  porra_id           uuid not null references public.porras(id) on delete cascade,
  kind               text not null check (kind in ('provider','ai','editor')),
  proposed_option_id uuid references public.porra_options(id),
  proposes_void      boolean not null default false,
  confidence         numeric,
  sources            jsonb not null default '[]',
  reason             text,
  status             text not null default 'pending'
                     check (status in ('pending','approved','rejected','applied','superseded','expired')),
  decided_by         uuid references public.profiles(id),
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists resolution_proposals_porra_idx on public.resolution_proposals (porra_id, created_at desc);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'porras_resolution_proposal_fk') then
    alter table public.porras add constraint porras_resolution_proposal_fk
      foreign key (resolution_proposal_id) references public.resolution_proposals(id) on delete set null;
  end if;
end $$;

-- ───────────────── feed_snapshots (muestra para el termostato) ──────────────
-- viewer_hash = hash(user_id o sesión de invitado); nunca el id en claro. Como
-- mucho una fila por espectador cada 30 min; purga a 30 días (F4).
create table if not exists public.feed_snapshots (
  id           bigserial primary key,
  market       text,
  viewer_hash  text not null,
  unvoted_open int  not null,
  created_at   timestamptz not null default now()
);
create index if not exists feed_snapshots_market_created_idx on public.feed_snapshots (market, created_at desc);

-- ─────────── content_daily_metrics (por mercado, día y categoría; F4) ───────
create table if not exists public.content_daily_metrics (
  market                   text not null,
  day                      date not null,
  category                 text not null,
  published                int not null default 0,
  impressions              int not null default 0,
  votes                    int not null default 0,
  votes_per_view           numeric,
  median_votes_per_porra   numeric,
  unvoted_p50              numeric,
  pct_dau_with_result_24h  numeric,
  d1_return_voters         numeric,
  primary key (market, day, category)
);

-- ─────────────────────── RLS: tablas nuevas solo admin ──────────────────────
do $$
declare t text;
begin
  foreach t in array array['content_events','trend_observations','content_plan_days',
                           'resolution_proposals','feed_snapshots','content_daily_metrics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ───────────────────── agent_runs: conteos, errores y coste ─────────────────
alter table public.agent_runs add column if not exists market text;
alter table public.agent_runs add column if not exists counts jsonb not null default '{}';
alter table public.agent_runs add column if not exists errors jsonb not null default '[]';
alter table public.agent_runs add column if not exists cost_usd numeric not null default 0;
alter table public.agent_runs add column if not exists duration_ms int;
alter table public.agent_runs add column if not exists finished_at timestamptz;

-- ───────────────────── remote_config.content_engine (B.3.3) ─────────────────
-- APAGADO: enabled=false hasta que Ricardo lo encienda. on conflict do nothing:
-- re-aplicar la migración no pisa lo que se cambie desde el panel.
insert into public.remote_config (key, value) values ('content_engine', '{
  "enabled": false,
  "kill_switch": false,
  "models": { "generator": "claude-haiku-5-5", "resolver": "claude-sonnet-5-5" },
  "prices_usd_per_mtok": { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [2, 10] },
  "sources": { "news": true, "trends": true, "youtube": true, "music": true, "wiki": true,
               "x": false, "calendar": true, "internal": true, "manual": true,
               "instagram": false, "tiktok_provider": false },
  "budgets_usd_month": { "x": 50, "anthropic": 80 },
  "heat_weights": { "news": 0.30, "trends": 0.20, "x": 0.15, "media": 0.10, "internal": 0.25 },
  "score_weights": { "resolves_soon": 0.30, "divides": 0.25, "heat": 0.20, "verifiable": 0.15, "mix": 0.10 },
  "discard_consensus_over": 80,
  "max_per_entity_day": 3,
  "defaults": {
    "votes_per_user": 6, "choice_factor": 2, "voted_share": 0.4, "open_days": 2.0,
    "min_votes_per_porra": 50, "scale_exponent": 0.35, "scale_base_dau": 500,
    "n_min": 3, "n_max": 80, "event_mult": { "1": 1.0, "2": 1.5, "3": 2.0 },
    "quick_share": 0.6, "quick_hours": 24,
    "slots": [ {"from":"07:00","to":"10:00","share":0.25},
               {"from":"12:00","to":"14:00","share":0.25},
               {"from":"17:00","to":"21:00","share":0.50} ],
    "results_window": {"from":"20:00","to":"23:00"},
    "category_weights": { "futbol": 0.35, "reality": 0.30, "musica_farandula": 0.20, "otros": 0.15 },
    "category_bounds": [0.10, 0.50],
    "max_per_category_min": 3,
    "thermo": { "step": 2, "delta_min": -5, "delta_max": 10 }
  }
}'::jsonb)
on conflict (key) do nothing;

-- La política entra (Nivel B, siempre con persona): fuera de los vetos duros.
update public.remote_config
   set value = jsonb_set(value, '{hard_vetoes}', (value->'hard_vetoes') - 'partisan_politics'), updated_at = now()
 where key = 'trend_agent' and value->'hard_vetoes' ? 'partisan_politics';

-- ¿Puede trabajar solo el motor? enabled y sin interruptor de emergencia.
create or replace function public.content_engine_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean and not coalesce((value->>'kill_switch')::boolean, false)
                     from remote_config where key = 'content_engine'), false)
$$;
revoke execute on function public.content_engine_on() from public, anon, authenticated;

-- ──────────────── publish_proposal: 40 caracteres + datos del motor ─────────
-- Cuerpo de 0043 con: opciones a 40 (check de porra_options), y la porra hereda
-- market, resolves_at (nunca antes del cierre), resolution_kind/_source,
-- event_id y planned_by='editor'. El pique (daily) hereda market.
create or replace function public.publish_proposal(p_id uuid, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pr topic_proposals%rowtype; v_porra uuid; opt text; i int := 0; v_slug text; v_close timestamptz;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into pr from topic_proposals where id = p_id for update;
  if not found or pr.status <> 'pending_review' then raise exception 'VINKO_BAD_STATE'; end if;
  if pr.resolution_criteria is null or char_length(pr.resolution_criteria) < 5 then
    raise exception 'VINKO_NO_RESOLUTION';
  end if;
  if public.content_unsafe(pr.title || ' ' || coalesce(pr.options::text, '')) then
    raise exception 'VINKO_UNSAFE';
  end if;
  if public.content_minor(pr.title || ' ' || coalesce(pr.options::text, '')) then
    raise exception 'VINKO_MENOR';
  end if;
  v_slug := left(coalesce(nullif(p_slug, ''), 'porra'), 60) || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  if pr.kind = 'daily' then
    insert into daily_picks (scheduled_for, lang, question, options, status, source_url, market)
      values (coalesce(pr.closes_at, now())::date, pr.lang, pr.title, pr.options, 'scheduled', pr.source_url, pr.market);
  else
    v_close := greatest(coalesce(pr.closes_at, now() + interval '2 days'), now() + interval '1 hour');
    insert into porras (slug, title, source, status, closes_at, category, visibility, resolution_criteria, resolves_at,
                        market, resolution_kind, resolution_source, event_id, planned_by)
      values (v_slug, left(pr.title, 120), 'editorial', 'open', v_close, pr.category, 'public',
              left(pr.resolution_criteria, 400), greatest(coalesce(pr.resolves_at, v_close), v_close),
              pr.market, pr.resolution_kind, left(pr.resolution_source, 400), pr.event_id, 'editor')
      returning id into v_porra;
    for opt in select value from jsonb_array_elements_text(pr.options) loop
      insert into porra_options (porra_id, idx, label) values (v_porra, i, left(opt, 40));
      i := i + 1;
    end loop;
  end if;
  update topic_proposals set status = 'published' where id = p_id;
  if pr.signal_id is not null then update signals set status = 'generated' where id = pr.signal_id; end if;
  return v_porra;
end $$;

-- agent_autopublish (0043, sin cron desde 0030; lo sustituye el publicador en
-- F4): solo el arreglo de las opciones a 40 caracteres, para que no reviente.
create or replace function public.agent_autopublish(p_max integer default 6) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_slug text; opt text; i int;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  for r in
    select * from topic_proposals
    where status = 'pending_review' and kind = 'porra'
      and resolution_criteria is not null and char_length(resolution_criteria) >= 5
      and char_length(title) between 8 and 120
      and not (flags ?| array['lexico','cuotas','invalida','seguridad','pregunta','opciones','sin_resolucion']) -- forbidden-terms:ignore (nombre de flag del filtro, 0043)
      and not public.content_unsafe(title || ' ' || coalesce(options::text, ''))
      and not public.content_minor(title || ' ' || coalesce(options::text, ''))
      and (select count(*) from jsonb_array_elements_text(options)) between 2 and 6
      and not exists (select 1 from jsonb_array_elements_text(options) e where char_length(e) > 80 or char_length(trim(e)) < 1)
    order by created_at limit greatest(least(p_max, 12), 1)
  loop
    v_slug := left(trim(both '-' from regexp_replace(translate(lower(left(r.title, 40)), 'áéíóúñ¿?¡!,.:;', 'aeioun'), '[^a-z0-9]+', '-', 'g')), 50)
      || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    insert into porras (slug, title, source, status, closes_at, category, visibility, resolution_criteria, resolves_at)
      values (v_slug, left(r.title, 120), 'editorial', 'open',
              greatest(coalesce(r.closes_at, now() + interval '2 days'), now() + interval '2 hours'), r.category, 'public',
              left(r.resolution_criteria, 400), greatest(coalesce(r.closes_at, now() + interval '2 days'), now() + interval '2 hours'));
    i := 0;
    for opt in select value from jsonb_array_elements_text(r.options) loop
      insert into porra_options (porra_id, idx, label) select id, i, left(opt, 40) from porras where slug = v_slug;
      i := i + 1;
    end loop;
    update topic_proposals set status = 'published' where id = r.id;
    if r.signal_id is not null then update signals set status = 'generated' where id = r.signal_id; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────────── barrido de vuelta, con guarda (deshace la pausa de 0073) ─────
-- En cada deploy 0073 lo quita y esta lo programa CON guarda (si se re-aplica
-- 0060, también va antes). Mientras content_engine esté apagado, no despacha nada.
select cron.schedule('vinko-agent-sweep', '0 */3 * * *', $$
  select internal.dispatch('vinko-agent-sweep', '/trend-generate', '{"limit":6,"market":"CO"}'::jsonb)
  where public.content_engine_on()
$$);

notify pgrst, 'reload schema';
