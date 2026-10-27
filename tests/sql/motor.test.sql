-- ============================================================================
-- Motor de contenido: crons, datos y publicación.
--   0073 pausa el barrido de España · 0074 datos/config y barrido CON guarda ·
--   0075 catálogo de Colombia. Mismos stubs de auth que el resto (test.uid).
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

-- ── 1. barrido programado CON guarda; el motor nace apagado ─────────────────
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vinko-agent-sweep' and command like '%content_engine_on()%') then
    raise exception 'vinko-agent-sweep debe estar programado con la guarda content_engine_on()';
  end if;
  if exists (select 1 from cron.job where jobname = 'vinko-agent-publish') then
    raise exception 'vinko-agent-publish ha vuelto a programarse (se quitó en 0030)';
  end if;
  if (select value->>'enabled' from remote_config where key = 'content_engine') is distinct from 'false' then
    raise exception 'content_engine debe sembrarse con enabled=false';
  end if;
  if public.content_engine_on() then raise exception 'con enabled=false, content_engine_on() debe ser false'; end if;
  raise notice 'motor: barrido con guarda, motor apagado';
end $$;

-- ── 2. interruptor: enabled lo enciende, kill_switch lo para ─────────────────
do $$
begin
  update remote_config set value = jsonb_set(value, '{enabled}', 'true') where key = 'content_engine';
  if not public.content_engine_on() then raise exception 'enabled=true debía encender el motor'; end if;
  update remote_config set value = jsonb_set(value, '{kill_switch}', 'true') where key = 'content_engine';
  if public.content_engine_on() then raise exception 'kill_switch=true debía pararlo'; end if;
  update remote_config set value = value || '{"enabled": false, "kill_switch": false}' where key = 'content_engine';
end $$;

-- ── 3. re-aplicar 0060 → 0073 → 0074 → 0075 (desde cero o con umbral bajo): idempotente ─
\ir ../../supabase/migrations/0060_cron_config_observabilidad.sql
\ir ../../supabase/migrations/0073_pausa_barrido_es.sql
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vinko-agent-sweep') then
    raise exception '0073 debía quitar el barrido sin guarda que pone 0060';
  end if;
end $$;
\ir ../../supabase/migrations/0074_motor_datos.sql
\ir ../../supabase/migrations/0075_motor_catalogo_co.sql
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vinko-agent-sweep' and command like '%content_engine_on()%') then
    raise exception 'tras re-aplicar, el barrido debe quedar con guarda';
  end if;
  if (select value->>'enabled' from remote_config where key = 'content_engine') <> 'false' then
    raise exception 're-aplicar 0074 no debe tocar content_engine';
  end if;
end $$;

-- ── 4. RLS solo admin en las tablas nuevas ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['content_events','trend_observations','content_plan_days',
                           'resolution_proposals','feed_snapshots','content_daily_metrics'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS apagada en %', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and qual like '%is_admin()%') then
      raise exception '% sin política solo-admin', t;
    end if;
  end loop;
end $$;

-- ── 5. catálogo de Colombia, España fuera; la política entra ─────────────────
do $$
begin
  if (select count(*) from tracked_entities where market in ('CO','GLOBAL') and activo) < 15 then
    raise exception 'el catálogo de Colombia debe tener al menos 15 entidades activas';
  end if;
  if exists (select 1 from tracked_entities where market = 'ES' and activo) then
    raise exception 'las semillas de España deben quedar inactivas';
  end if;
  if (select market from tracked_entities where nombre = 'Westcol') <> 'CO' then
    raise exception 'Westcol debe pasar a CO';
  end if;
  if (select external_ids->>'api_football_league' from tracked_entities where nombre = 'Liga BetPlay') <> '239' then
    raise exception 'Liga BetPlay debe llevar el id 239 de API-Football';
  end if;
  if (select value->'hard_vetoes' ? 'partisan_politics' from remote_config where key = 'trend_agent') then
    raise exception 'la política entra: partisan_politics fuera de hard_vetoes';
  end if;
  if not (select value->'hard_vetoes' ? 'minors_subject' from remote_config where key = 'trend_agent') then
    raise exception 'minors_subject debe seguir en hard_vetoes';
  end if;
  if (select daily_pick_hour from markets where code = 'CO') <> 13 then
    raise exception 'el pique de CO debe abrir a las 13';
  end if;
  -- entidad nueva desde el panel: nace en CO
  insert into tracked_entities (nombre, categoria) values ('Test motor entidad', 'futbol');
  if (select market from tracked_entities where nombre = 'Test motor entidad') <> 'CO' then
    raise exception 'una entidad nueva debe nacer con market=CO';
  end if;
  delete from tracked_entities where nombre = 'Test motor entidad';
end $$;

-- ── 6. publish_proposal: 40 caracteres y la porra hereda los datos del motor ─
-- En una transacción que se deshace: no deja admin ni porra para los tests que
-- corren después (pantallas, reto, s2).
begin;
do $$
declare adm uuid; v_tp uuid; v_porra uuid; p porras%rowtype; err text;
begin
  insert into auth.users (email) values ('motor.admin@test.dev') returning id into adm;
  update profiles set role = 'admin' where id = adm;
  perform test_as(adm);

  insert into topic_proposals (title, options, category, resolution_criteria, closes_at, resolves_at,
                               market, resolution_kind, resolution_source, status, kind)
  values ('¿Quién gana el clásico Millonarios vs América del 4 de noviembre?',
          '["Millonarios gana por dos goles de diferencia o más", "Empate", "América de Cali"]'::jsonb,
          'futbol', 'Según el resultado oficial de la Dimayor al final del tiempo reglamentario.',
          now() + interval '3 days', now() + interval '3 days 2 hours',
          'CO', 'news', 'Dimayor', 'pending_review', 'porra')
  returning id into v_tp;

  v_porra := publish_proposal(v_tp, 'clasico-millonarios-america');
  select * into p from porras where id = v_porra;
  if p.market is distinct from 'CO' then raise exception 'la porra debe heredar market=CO'; end if;
  if p.planned_by is distinct from 'editor' then raise exception 'planned_by debe ser editor'; end if;
  if p.resolution_kind is distinct from 'news' or p.resolution_source is distinct from 'Dimayor' then
    raise exception 'la porra debe heredar resolution_kind/_source';
  end if;
  if p.resolves_at < p.closes_at then raise exception 'resolves_at no puede ir antes del cierre'; end if;
  if (select max(char_length(label)) from porra_options where porra_id = v_porra) > 40 then
    raise exception 'las opciones deben caber en 40 caracteres';
  end if;
  if (select count(*) from porra_options where porra_id = v_porra) <> 3 then
    raise exception 'deben publicarse las 3 opciones';
  end if;

  -- estados nuevos de la cola
  insert into topic_proposals (title, options, status) values ('Programada de prueba', '["Sí","No"]'::jsonb, 'scheduled');
  begin
    insert into topic_proposals (title, options, status) values ('Estado inventado', '["Sí","No"]'::jsonb, 'inventado');
    raise exception 'un estado fuera de la lista debía rechazarse';
  exception when check_violation then null;
  end;
  raise notice 'motor: publish_proposal hereda mercado y recorta opciones a 40';
end $$;
rollback;
