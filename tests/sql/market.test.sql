-- ============================================================================
-- MERCADO DE CADA PREDICCIÓN (0077, Descubrir · Colombia | Global): la de un
-- usuario lleva el mercado de quien la crea; editoriales y gente sin país, no.
-- Corre en tests/sql/run.sh.
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare a uuid; b uuid; c uuid; v jsonb; mk text;
begin
  insert into auth.users (email) values ('m.ana@test.dev')   returning id into a;  -- país CO
  insert into auth.users (email) values ('m.bruno@test.dev') returning id into b;  -- sin país
  insert into auth.users (email) values ('m.carla@test.dev') returning id into c;  -- CO, pero mercado GLOBAL
  update profiles set points = 1000 where id in (a, b, c);
  update profiles set country = 'CO' where id in (a, c);
  update profiles set market = 'GLOBAL' where id = c;

  -- (MKT-01) País declarado CO → la predicción es de Colombia.
  perform test_as(a);
  v := create_porra('¿Gana Nacional el clásico del domingo?', array['Sí', 'No'], now() + interval '1 day', p_my_option_idx => 0);
  select market into mk from porras where id = (v->>'id')::uuid;
  if mk is distinct from 'CO' then raise exception 'MKT-01: market=% (esperaba CO)', mk; end if;

  -- (MKT-02) Sin país ni mercado → sin mercado (solo Global).
  perform test_as(b);
  v := create_porra('¿Llueve mañana por la tarde en la ciudad?', array['Sí', 'No'], now() + interval '1 day', p_my_option_idx => 0);
  select market into mk from porras where id = (v->>'id')::uuid;
  if mk is not null then raise exception 'MKT-02: market=% (esperaba null)', mk; end if;

  -- (MKT-03) El mercado del perfil manda sobre el país.
  perform test_as(c);
  v := create_porra('¿Quién llega primero a la oficina el lunes?', array['Yo', 'Tú'], now() + interval '1 day', p_my_option_idx => 0);
  select market into mk from porras where id = (v->>'id')::uuid;
  if mk is distinct from 'GLOBAL' then raise exception 'MKT-03: market=% (esperaba GLOBAL)', mk; end if;

  -- (MKT-04) Editorial: aunque la cree alguien de CO, sin mercado.
  insert into porras (slug, title, source, status, closes_at, resolution_criteria, created_by)
    values ('mkt-editorial-1', '¿Gana Colombia el amistoso del martes?', 'editorial', 'open',
            now() + interval '1 day', 'Cierre oficial del viernes.', a);
  select market into mk from porras where slug = 'mkt-editorial-1';
  if mk is not null then raise exception 'MKT-04: market=% (esperaba null)', mk; end if;

  raise notice 'market: MKT-01..04 OK';
end $$;
