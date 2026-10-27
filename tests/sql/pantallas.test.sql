-- ============================================================================
-- Backend del diseño del soft launch (0065): pct_at_pick, receipt_no, visionario.
-- Mismos stubs de auth que el resto (test.uid/test.jwt). Corre en tests/sql/run.sh.
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  a uuid; b uuid; c uuid; d uuid;
  v jsonb; p uuid; o_si uuid; o_no uuid;
  v_pct int; v_vis boolean; n int;
begin
  insert into auth.users (email) values ('p.ana@test.dev')   returning id into a;
  insert into auth.users (email) values ('p.bruno@test.dev') returning id into b;
  insert into auth.users (email) values ('p.carla@test.dev') returning id into c;
  insert into auth.users (email) values ('p.dani@test.dev')  returning id into d;
  update profiles set points = 1000 where id in (a, b, c, d);

  -- Ana crea y va con NO (idx 1); Bruno/Carla/Dani van con SÍ (idx 0).
  perform test_as(a);
  v := create_porra('¿Gana el equipo de casa el clásico del domingo?',
                    array['Sí', 'No'], now() + interval '1 hour', p_my_option_idx => 1);
  p := (v->>'id')::uuid;
  select id into o_si from porra_options where porra_id = p and idx = 0;
  select id into o_no from porra_options where porra_id = p and idx = 1;
  perform test_as(b); perform make_pick(p, o_si, 10);
  perform test_as(c); perform make_pick(p, o_si, 10);
  perform test_as(d); perform make_pick(p, o_si, 10);

  -- pct_at_pick: share de la opción al votar (ya incluyéndote), sobre TODOS los picks.
  select pct_at_pick into v_pct from picks where porra_id = p and user_id = a;  -- 1ª, sola → 100
  if v_pct <> 100 then raise exception 'pct: Ana (1ª, sola) debía ser 100, es %', v_pct; end if;
  select pct_at_pick into v_pct from picks where porra_id = p and user_id = b;  -- SÍ: 1 de 2 → 50
  if v_pct <> 50 then raise exception 'pct: Bruno debía ser 50, es %', v_pct; end if;
  select pct_at_pick into v_pct from picks where porra_id = p and user_id = d;  -- SÍ: 3 de 4 → 75
  if v_pct <> 75 then raise exception 'pct: Dani debía ser 75, es %', v_pct; end if;

  -- receipt_no: cada pick tiene uno y son distintos.
  select count(distinct receipt_no) into n from picks where porra_id = p;
  if n <> 4 then raise exception 'receipt_no: 4 picks debían dar 4 números distintos, hay %', n; end if;

  -- Visionario: gana NO (1 de 4 = 25% ≤ 25%) → Ana visionaria; los de SÍ, no.
  update porras set closes_at = now() - interval '1 minute' where id = p;
  perform porra_settle(p, o_no);
  select visionario into v_vis from picks where porra_id = p and user_id = a;
  if not v_vis then raise exception 'visionario: Ana (NO, 25%%) debía ser visionaria'; end if;
  select bool_or(visionario) into v_vis from picks where porra_id = p and option_id = o_si;
  if coalesce(v_vis, false) then raise exception 'visionario: los de SÍ (perdieron) no debían serlo'; end if;
  raise notice 'OK §5: pct_at_pick 100/50/75 · receipt_no único · visionario con ganadora ≤25%%';

  -- Mayoría gana → nadie visionario (otra porra).
  perform test_as(a);
  v := create_porra('¿Sale el sol mañana por la mañana?',
                    array['Sí', 'No'], now() + interval '1 hour', p_my_option_idx => 0);
  p := (v->>'id')::uuid;
  select id into o_si from porra_options where porra_id = p and idx = 0;
  select id into o_no from porra_options where porra_id = p and idx = 1;
  perform test_as(b); perform make_pick(p, o_si, 10);
  perform test_as(c); perform make_pick(p, o_si, 10);
  perform test_as(d); perform make_pick(p, o_no, 10);   -- SÍ = 3 de 4 (75 %)
  update porras set closes_at = now() - interval '1 minute' where id = p;
  perform porra_settle(p, o_si);                         -- gana la mayoría
  select bool_or(visionario) into v_vis from picks where porra_id = p;
  if coalesce(v_vis, false) then raise exception 'visionario: ganó la mayoría (75%%), nadie debía serlo'; end if;
  raise notice 'OK §5: ganadora mayoritaria (75%%) → sin visionario';
end $$;

-- profile_receipts (0073): Visionario ×N y mejores recibos del perfil (pantalla 13)
-- con el % FINAL de la ganadora, no pct_at_pick: Ana votó la primera (100 %) en la
-- 1.ª porra y aun así es visionaria con 1 de 4; su recibo debe decir 25 %.
do $$
declare
  a uuid; b uuid; d uuid; v jsonb;
begin
  select id into a from auth.users where email = 'p.ana@test.dev';
  select id into b from auth.users where email = 'p.bruno@test.dev';
  select id into d from auth.users where email = 'p.dani@test.dev';

  v := profile_receipts(a);
  if (v->>'visionario')::int <> 1 then
    raise exception 'receipts: Ana debía tener Visionario ×1, tiene %', v->>'visionario';
  end if;
  if jsonb_array_length(v->'receipts') <> 2 then
    raise exception 'receipts: Ana debía tener 2 recibos, tiene %', jsonb_array_length(v->'receipts');
  end if;
  if (v->'receipts'->0->>'pct')::int <> 25 or not (v->'receipts'->0->>'visionario')::boolean then
    raise exception 'receipts: el 1.º de Ana (el más raro) debía ser 25 %% y visionario, es %', v->'receipts'->0;
  end if;
  if (v->'receipts'->1->>'pct')::int <> 75 or (v->'receipts'->1->>'visionario')::boolean then
    raise exception 'receipts: el 2.º de Ana debía ser 75 %% sin visionario, es %', v->'receipts'->1;
  end if;

  v := profile_receipts(b);  -- falló la 1.ª, acertó la 2.ª con la mayoría
  if (v->>'visionario')::int <> 0 or jsonb_array_length(v->'receipts') <> 1 then
    raise exception 'receipts: Bruno debía tener 1 recibo y Visionario ×0, es %', v;
  end if;

  v := profile_receipts(d);  -- falló las dos
  if (v->>'visionario')::int <> 0 or jsonb_array_length(v->'receipts') <> 0 then
    raise exception 'receipts: Dani debía tener 0 recibos, es %', v;
  end if;
  raise notice 'OK 0073: profile_receipts — Visionario ×1, porcentaje final 25/75, el más raro primero, sin aciertos = []';
end $$;
