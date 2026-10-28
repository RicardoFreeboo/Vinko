-- ============================================================================
-- INICIO · tus grupos (0077 home_groups, VINKO_PANTALLAS 04): tus grupos con tu
-- puesto de la semana, porras por votar de tus grupos, tus votos pendientes y
-- tus resultados. Mismos stubs de auth que el resto. Corre en tests/sql/run.sh.
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; x uuid;
  grp uuid; code text; v jsonb; p uuid; o_si uuid; o_no uuid; rank_b int;
begin
  insert into auth.users (email) values ('h.ana@test.dev')   returning id into a;  -- crea, no vota
  insert into auth.users (email) values ('h.bruno@test.dev') returning id into b;
  insert into auth.users (email) values ('h.carla@test.dev') returning id into c;
  insert into auth.users (email) values ('h.dani@test.dev')  returning id into d;
  insert into auth.users (email) values ('h.elena@test.dev') returning id into e;
  insert into auth.users (email) values ('h.fran@test.dev')  returning id into f;
  insert into auth.users (email) values ('h.gema@test.dev')  returning id into x;  -- fuera del grupo
  update profiles set points = 1000 where id in (a, b, c, d, e, f, x);

  -- (HOME-01) Sin sesión → VINKO_NO_AUTH.
  perform set_config('test.uid', '', false);
  begin
    perform home_groups();
    raise exception 'HOME-01: sin sesión debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_NO_AUTH%' then raise exception 'HOME-01: error inesperado %', sqlerrm; end if;
  end;

  -- Grupo de 6 y una porra del grupo (Ana la crea sin votar: juez que no juega).
  perform test_as(a);
  grp := create_group('Los del Parche');
  select invite_code into code from groups where id = grp;
  perform test_as(b); perform join_group(code);
  perform test_as(c); perform join_group(code);
  perform test_as(d); perform join_group(code);
  perform test_as(e); perform join_group(code);
  perform test_as(f); perform join_group(code);
  perform test_as(a);
  v := create_porra('¿Pipe llega puntual al asado del sábado?', array['Sí', 'No'], now() + interval '1 day');
  p := (v->>'id')::uuid;
  perform porra_set_group(p, grp);
  select id into o_si from porra_options where porra_id = p and idx = 0;
  select id into o_no from porra_options where porra_id = p and idx = 1;

  -- (HOME-02) Bruno aún no votó: le sale en «Por votar» con sus 2 opciones; nadie votó.
  perform test_as(b);
  v := home_groups();
  if jsonb_array_length(v->'to_vote') <> 1 or (v->'to_vote'->0->>'slug') is null
     or jsonb_array_length(v->'to_vote'->0->'options') <> 2
     or (v->'to_vote'->0->>'voters')::int <> 0 or (v->'to_vote'->0->>'group') <> 'Los del Parche' then
    raise exception 'HOME-02: «Por votar» de Bruno mal: %', v->'to_vote';
  end if;
  if jsonb_array_length(v->'groups') <> 1 or (v->'groups'->0->>'members')::int <> 6 then
    raise exception 'HOME-02: Bruno debía ver 1 grupo de 6, ve %', v->'groups';
  end if;

  -- Votan 5: Sí × 3 (Bruno, Carla, Dani), No × 2 (Elena, Fran).
  perform make_pick(p, o_si, 10);
  perform test_as(c); perform make_pick(p, o_si, 10);
  perform test_as(d); perform make_pick(p, o_si, 10);
  perform test_as(e); perform make_pick(p, o_no, 10);
  perform test_as(f); perform make_pick(p, o_no, 10);

  -- (HOME-03) Bruno: ya no está en «Por votar»; en «Esperando» va con Sí, como 3 de 5.
  perform test_as(b);
  v := home_groups();
  if jsonb_array_length(v->'to_vote') <> 0 then raise exception 'HOME-03: Bruno ya votó: %', v->'to_vote'; end if;
  if (v->'waiting'->0->>'mine') <> 'Sí' or (v->'waiting'->0->>'same')::int <> 3
     or (v->'waiting'->0->>'total')::int <> 5 then
    raise exception 'HOME-03: «Esperando» de Bruno mal: %', v->'waiting';
  end if;

  -- (HOME-04) Ana (miembro, no votó) la ve por votar con 5 votos reales y 3 caras.
  perform test_as(a);
  v := home_groups();
  if (v->'to_vote'->0->>'voters')::int <> 5 or jsonb_array_length(v->'to_vote'->0->'faces') <> 3 then
    raise exception 'HOME-04: Ana debía ver 5 votos y 3 caras: %', v->'to_vote';
  end if;

  -- (HOME-05) Gema no es del grupo: ni grupos ni porras del grupo.
  perform test_as(x);
  v := home_groups();
  if jsonb_array_length(v->'groups') <> 0 or jsonb_array_length(v->'to_vote') <> 0 then
    raise exception 'HOME-05: alguien de fuera ve el grupo: %', v;
  end if;

  -- Gana No (2 de 5): Elena y Fran ganan Puntería esta semana (≥5 reales, juez sin votar).
  update porras set closes_at = now() - interval '1 minute' where id = p;
  perform porra_settle(p, o_no);

  -- (HOME-06) Resultados: Elena acertó (2 de 5 lo vieron, +Puntería); Bruno falló (ganó «No»).
  perform test_as(e);
  v := home_groups();
  if not (v->'resolved'->0->>'won')::boolean or (v->'resolved'->0->>'winners')::int <> 2
     or (v->'resolved'->0->>'total')::int <> 5 or (v->'resolved'->0->>'punteria')::int <= 0 then
    raise exception 'HOME-06: resultado de Elena mal: %', v->'resolved';
  end if;
  if jsonb_array_length(v->'waiting') <> 0 then raise exception 'HOME-06: resuelta no debe seguir esperando'; end if;
  -- Puesto de la semana: Elena y Fran empatan arriba → las dos son 1.ª (puesto compartido).
  if (v->'groups'->0->>'rank')::int <> 1 or (v->'groups'->0->>'week')::int <= 0
     or (v->'groups'->0->>'above') is not null
     or (v->'groups'->0->>'leader') not in ((select handle from profiles where id = e), (select handle from profiles where id = f)) then
    raise exception 'HOME-06: puesto de Elena mal: %', v->'groups';
  end if;

  perform test_as(b);
  v := home_groups();
  if (v->'resolved'->0->>'won')::boolean or (v->'resolved'->0->>'winner') <> 'No' then
    raise exception 'HOME-06: resultado de Bruno mal: %', v->'resolved';
  end if;
  -- Bruno no puntuó: 3.º compartido con los otros 0 (no 4.º por el alfabeto) y el
  -- hueco se mide a quien tiene MÁS puntos (nunca «a 0 pts de» un empatado).
  rank_b := (v->'groups'->0->>'rank')::int;
  if rank_b <> 3 or (v->'groups'->0->>'above') is null or (v->'groups'->0->>'gap')::int <= 0 then
    raise exception 'HOME-06: puesto de Bruno mal: %', v->'groups';
  end if;

  raise notice 'home.test OK';
end $$;
