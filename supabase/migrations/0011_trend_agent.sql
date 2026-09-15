-- ============================================================================
-- VINKO — 0011: agente de tendencias (spec 15-sep-2026). Convierte señal
-- pública en porras candidatas. LÍNEA ROJA (§0): jamás cuotas/líneas/odds.
-- El veto vive en la CAPA DE INGESTA (trigger), no en presentación.
-- Nada se publica sin aprobación humana (topic_proposals.status).
-- ============================================================================

-- veto de cuotas: si la señal huele a casa de apuestas, no entra (§0)
create or replace function public.odds_tainted(p text) returns boolean
language sql immutable as $$
  select p ~* '(\yodds\y|\ycuota|\yspread\y|\ypayout\y|\yhandicap\y|\ymoneyline\y|over/under|\ybookmaker|\ytipster|\b[1-9]\.[0-9]{2}\b)'
$$;

create table public.signals (
  id              uuid primary key default gen_random_uuid(),
  topic           text not null,
  category        text,
  event           text,
  resolution_date timestamptz,
  velocity        numeric default 0,
  sentiment       numeric default 0,
  audience        numeric default 0,
  controversy     numeric default 0,
  source          text not null,
  lang            text not null default 'es',
  country         text not null default 'ES',
  score           int,
  flags           jsonb not null default '[]',
  status          text not null default 'new'
    check (status in ('new','scored','generated','rejected')),
  raw             jsonb,
  created_at      timestamptz not null default now(),
  purge_after     timestamptz not null default now() + interval '30 days' -- RGPD
);
alter table public.signals enable row level security;
create policy signals_admin on public.signals
  for all using (public.is_admin()) with check (public.is_admin());
create index signals_status_idx on public.signals (status, score desc);

-- barrera legal: rechaza en INSERT/UPDATE cualquier señal contaminada por cuotas
create or replace function public.signals_odds_guard() returns trigger
language plpgsql as $$
begin
  if public.odds_tainted(coalesce(new.topic,'') || ' ' || coalesce(new.event,'') || ' ' ||
                         coalesce(new.raw::text,'')) then
    raise exception 'VINKO_ODDS_TAINTED: la señal contiene datos de cuotas/apuestas (linea roja §0)';
  end if;
  return new;
end $$;
drop trigger if exists trg_signals_odds on public.signals;
create trigger trg_signals_odds before insert or update on public.signals
  for each row execute function public.signals_odds_guard();

-- la cola de aprobación reutiliza topic_proposals + campos del agente
alter table public.topic_proposals
  add column category            text,
  add column resolution_criteria text,   -- OBLIGATORIO para aprobar (§6)
  add column closes_at           timestamptz,
  add column score               int,
  add column flags               jsonb not null default '[]',
  add column lang                text not null default 'es',
  add column kind                text not null default 'porra' check (kind in ('porra','daily')),
  add column signal_id           uuid references public.signals(id);

-- mismo veto de cuotas sobre lo que llega a la cola (defensa en profundidad)
create or replace function public.topics_odds_guard() returns trigger
language plpgsql as $$
begin
  if public.odds_tainted(coalesce(new.title,'') || ' ' || coalesce(new.options::text,'') || ' ' ||
                         coalesce(new.resolution_criteria,'')) then
    raise exception 'VINKO_ODDS_TAINTED: propuesta con datos de cuotas (linea roja §0)';
  end if;
  return new;
end $$;
drop trigger if exists trg_topics_odds on public.topic_proposals;
create trigger trg_topics_odds before insert or update on public.topic_proposals
  for each row execute function public.topics_odds_guard();

-- publicar una propuesta editorial aprobada → porra real source=editorial (admin)
create or replace function public.publish_proposal(p_id uuid, p_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pr topic_proposals%rowtype; v_porra uuid; opt jsonb; i int := 0;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into pr from topic_proposals where id = p_id for update;
  if not found or pr.status <> 'pending_review' then raise exception 'VINKO_BAD_STATE'; end if;
  if pr.resolution_criteria is null or char_length(pr.resolution_criteria) < 5 then
    raise exception 'VINKO_NO_RESOLUTION'; -- criterio de resolución obligatorio (§6)
  end if;
  if pr.kind = 'daily' then
    insert into daily_picks (scheduled_for, lang, question, options, status, source_url)
      values (coalesce(pr.closes_at, now())::date, pr.lang, pr.title, pr.options, 'scheduled', pr.source_url);
  else
    insert into porras (slug, title, source, status, closes_at)
      values (p_slug, pr.title, 'editorial', 'open',
              coalesce(pr.closes_at, now() + interval '2 days'))
      returning id into v_porra;
    for opt in select * from jsonb_array_elements_text(pr.options) loop
      insert into porra_options (porra_id, idx, label) values (v_porra, i, opt #>> '{}');
      i := i + 1;
    end loop;
  end if;
  update topic_proposals set status = 'published' where id = p_id;
  if pr.signal_id is not null then
    update signals set status = 'generated' where id = pr.signal_id;
  end if;
  return v_porra;
end $$;
revoke execute on function public.publish_proposal(uuid, text) from public, anon;
grant execute on function public.publish_proposal(uuid, text) to authenticated;

insert into public.remote_config (key, value) values
('trend_agent', '{
  "enabled": true,
  "sweep_fast_hours": 3, "sweep_slow_hours": 24,
  "score_threshold": 60, "daily_pick_max_resolution_h": 48,
  "themed_per_sweep": 5, "buffer_target_days": 14, "buffer_alert_days": 7,
  "sources": {"sports_calendar": true, "google_trends": true, "youtube": true,
    "tv_audiences": true, "x": false, "tiktok": false, "news": true, "seasonal": true},
  "x_monthly_budget_eur": 50, "tiktok_monthly_budget_eur": 30,
  "hard_vetoes": ["odds","betting","minors_subject","partisan_politics"],
  "weights": {"resolubilidad": 0.30, "proximidad": 0.25, "velocidad": 0.20,
    "afinidad_grupo": 0.15, "emocion": 0.10}
}'::jsonb)
on conflict (key) do nothing;
