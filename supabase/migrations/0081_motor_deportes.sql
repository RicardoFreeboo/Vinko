-- ============================================================================
-- VINKO — 0081_motor_deportes: F2 del motor de contenido (doc 27-oct-2026,
-- B.5 «desde el calendario», B.8 y B.9.1–B.9.2).
--
--   · resolve_porra_system / void_porra_system: resolver y anular desde el
--     sistema (cron, proveedor). SOLO service_role. Bloquean la fila y, si la
--     predicción ya no está abierta, devuelven false: nunca pagan dos veces.
--     El reparto es el de siempre (porra_settle).
--   · Plantillas Nivel A: topic_proposals.template_key (+ único por evento) y
--     content_publish_due(), el publicador mínimo: publica lo programado cuyo
--     hueco llegó, con el motor encendido Y markets.content_config
--     .autopublish_enabled = true (los dos nacen apagados). La F4 le pone el
--     plan del día y los huecos.
--   · motor_avisar_admins(): aviso 'sistema' a los admins, uno por título y 12 h.
--   · remote_config.content_engine.sports: competiciones (Liga BetPlay 239,
--     Libertadores 13 y Sudamericana 11 solo con clubes colombianos, Champions 2),
--     clásicos, tope de llamadas y auto_resolve=false (MODO SOMBRA: el proveedor
--     propone y no resuelve hasta que Ricardo lo encienda, B.9.2).
--   · Crons con guarda content_engine_on(): calendario (cada hora), resultados
--     (cada 5 min, solo con partidos recientes) y publicador (cada 15 min).
--
-- ADITIVA e IDEMPOTENTE: el deploy la re-aplica en cada merge (umbral ≥ 72).
-- ============================================================================

-- ───────────── agent_runs: pasadas del calendario y de resultados ───────────
alter table public.agent_runs drop constraint if exists agent_runs_kind_check;
alter table public.agent_runs add constraint agent_runs_kind_check
  check (kind in ('sweep','search','calendar','results'));

-- ───────────────────── plantillas: clave y una por evento ───────────────────
alter table public.topic_proposals add column if not exists template_key text;
create unique index if not exists topic_proposals_event_template_key
  on public.topic_proposals (event_id, template_key)
  where event_id is not null and template_key is not null;
create index if not exists porras_event_open_idx on public.porras (event_id) where status = 'open';
create index if not exists content_events_provider_start_idx on public.content_events (provider, starts_at);

-- ─────────────── resolver desde el sistema (B.9.1; service_role) ────────────
create or replace function public.resolve_porra_system(p_porra uuid, p_winning uuid, p_proposal uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v porras%rowtype;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  -- ya resuelta, impugnada o anulada: no se vuelve a pagar
  if v.status <> 'open' then return false; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.closes_at > now() then raise exception 'VINKO_NOT_CLOSED'; end if;
  perform public.porra_settle(p_porra, p_winning);
  if p_proposal is not null then
    update porras set resolution_proposal_id = p_proposal where id = p_porra;
    update resolution_proposals set status = 'applied', decided_at = coalesce(decided_at, now())
     where id = p_proposal;
  end if;
  return true;
end $$;
revoke execute on function public.resolve_porra_system(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_porra_system(uuid, uuid, uuid) to service_role;

-- ──────── anular desde el sistema (aplazado, cancelado, despachos; B.9.2) ───
-- Como void_porra (0043) sin la comprobación de autor, y anotando cada
-- devolución en el libro de Vinkos ('refund'), como cron_editorial_expire (0058).
create or replace function public.void_porra_system(p_porra uuid, p_reason text, p_proposal uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; r record;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.status <> 'open' then return false; end if;
  update porras set status = 'taken_down', resolved_at = now(),
         void_reason = left(coalesce(p_reason, 'anulada'), 120),
         resolution_proposal_id = coalesce(p_proposal, resolution_proposal_id)
   where id = p_porra;
  for r in select user_id, points_spent from picks where porra_id = p_porra and not coalesce(is_guest, false) loop
    update profiles set points = points + r.points_spent where id = r.user_id;
    insert into porra_payouts (porra_id, user_id, amount, score, kind) values (p_porra, r.user_id, r.points_spent, 0, 'refund'); -- forbidden-terms:ignore (libro de Vinkos, 0042)
    perform notify_user(r.user_id, 'resolucion', 'Predicción anulada: ' || left(v.title, 50),
      'Se te devuelven ' || r.points_spent || ' Vinkos.', '/p/' || v.slug);
  end loop;
  if p_proposal is not null then
    update resolution_proposals set status = 'applied', decided_at = coalesce(decided_at, now())
     where id = p_proposal;
  end if;
  return true;
end $$;
revoke execute on function public.void_porra_system(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.void_porra_system(uuid, text, uuid) to service_role;

-- ──────────────────── aviso a los admins (uno cada 12 h) ────────────────────
create or replace function public.motor_avisar_admins(p_titulo text, p_cuerpo text, p_url text default '/admin')
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_t text := left(p_titulo, 120);
begin
  for r in select id from profiles where role = 'admin' loop
    if not exists (select 1 from notifications
                    where user_id = r.id and class = 'sistema' and title = v_t
                      and created_at > now() - interval '12 hours') then
      perform notify_user(r.id, 'sistema', v_t, left(p_cuerpo, 300), p_url);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.motor_avisar_admins(text, text, text) from public, anon, authenticated;
grant execute on function public.motor_avisar_admins(text, text, text) to service_role;

-- ─────────────── publicador mínimo de lo programado (B.8; F4 lo amplía) ─────
-- Publica las propuestas 'scheduled' cuyo hueco llegó. Doble interruptor: el
-- motor encendido (content_engine_on) y el mercado con autopublish_enabled.
-- Las que ya no llegan (cierre en menos de 1 h) pasan a 'expired'.
create or replace function public.content_publish_due(p_max int default 10) returns int
language plpgsql security definer set search_path = public as $$
declare r topic_proposals%rowtype; n int := 0; v_porra uuid; v_slug text; opt text; i int;
begin
  if not public.content_engine_on() then return 0; end if;
  update topic_proposals set status = 'expired', discard_reason = 'cierre_pasado', updated_at = now()
   where status = 'scheduled' and closes_at is not null and closes_at <= now() + interval '1 hour';
  for r in
    select tp.* from topic_proposals tp
      join markets m on m.code = tp.market
     where tp.status = 'scheduled' and tp.kind = 'porra'
       and coalesce(tp.scheduled_for, now()) <= now()
       and coalesce((m.content_config->>'autopublish_enabled')::boolean, false)
     order by tp.scheduled_for nulls first, tp.created_at
     limit greatest(least(p_max, 50), 1)
     for update of tp skip locked
  loop
    if r.resolution_criteria is null or char_length(r.resolution_criteria) < 5
       or public.content_unsafe(r.title || ' ' || coalesce(r.options::text, ''))
       or public.content_minor(r.title || ' ' || coalesce(r.options::text, '')) then
      update topic_proposals set status = 'discarded', discard_reason = 'guarda_publicacion', updated_at = now()
       where id = r.id;
      continue;
    end if;
    v_slug := left(trim(both '-' from regexp_replace(translate(lower(left(r.title, 40)), 'áéíóúñü¿?¡!,.:;', 'aeiounu'), '[^a-z0-9]+', '-', 'g')), 50)
      || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    insert into porras (slug, title, source, status, closes_at, category, visibility, resolution_criteria, resolves_at,
                        market, resolution_kind, resolution_source, event_id, planned_by, auto_resolve, template_key)
      values (v_slug, left(r.title, 120), 'editorial', 'open', r.closes_at, r.category, 'public',
              left(r.resolution_criteria, 400), greatest(coalesce(r.resolves_at, r.closes_at), r.closes_at),
              r.market, r.resolution_kind, left(r.resolution_source, 400), r.event_id, 'planner',
              r.autonomy = 'A' and r.resolution_kind = 'calendar', r.template_key)
      returning id into v_porra;
    i := 0;
    for opt in select value from jsonb_array_elements_text(r.options) loop
      insert into porra_options (porra_id, idx, label) values (v_porra, i, left(opt, 40));
      i := i + 1;
    end loop;
    update topic_proposals set status = 'published', updated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.content_publish_due(int) from public, anon, authenticated;
grant execute on function public.content_publish_due(int) to service_role;

-- ───────────── remote_config.content_engine.sports (si aún no está) ─────────
-- Temporadas de API-Football: el año en que empieza (Champions 2026-27 = 2026).
-- Hay que subirlas en enero. La Selección necesita el id de equipo (con clave).
update public.remote_config
   set value = jsonb_set(value, '{sports}', '{
     "provider": "api_football",
     "auto_resolve": false,
     "daily_call_cap": 90,
     "result_delay_min": 15,
     "competitions": [
       {"name": "Liga BetPlay", "league": 239, "season": 2026, "market": "CO", "importance": 1, "enabled": true},
       {"name": "Copa Libertadores", "league": 13, "season": 2026, "market": "CO", "importance": 2, "only_teams_of_league": 239, "enabled": true},
       {"name": "Copa Sudamericana", "league": 11, "season": 2026, "market": "CO", "importance": 2, "only_teams_of_league": 239, "enabled": true},
       {"name": "UEFA Champions League", "league": 2, "season": 2026, "market": "GLOBAL", "importance": 2, "enabled": true}
     ],
     "clasicos": [["Millonarios", "Santa Fe"], ["Nacional", "Medellin"], ["America", "Deportivo Cali"],
                  ["Millonarios", "Nacional"], ["Millonarios", "America"], ["Nacional", "Junior"]]
   }'::jsonb), updated_at = now()
 where key = 'content_engine' and not (value ? 'sports');

-- ─────────────────────── crons con guarda (B.14) ────────────────────────────
select cron.schedule('vinko-content-calendar', '5 * * * *', $$
  select internal.dispatch('vinko-content-calendar', '/sports-provider', '{"mode":"calendar"}'::jsonb)
  where public.content_engine_on()
    and coalesce((select (value->'sources'->>'calendar')::boolean from public.remote_config where key = 'content_engine'), true)
$$);
select cron.schedule('vinko-results-provider', '*/5 * * * *', $$
  select internal.dispatch('vinko-results-provider', '/sports-provider', '{"mode":"results"}'::jsonb)
  where public.content_engine_on()
    and exists (select 1 from public.content_events
                 where provider = 'api_football'
                   and starts_at between now() - interval '30 hours' and now() + interval '10 minutes'
                   and (status <> 'finished' or finished_at > now() - interval '3 hours'))
$$);
select cron.schedule('vinko-content-publish', '*/15 * * * *', $$ select public.content_publish_due(10) $$);

notify pgrst, 'reload schema';
