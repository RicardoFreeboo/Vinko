-- ============================================================================
-- Tests SQL del Reto (0057) sobre el esquema real (tests/sql/run.sh).
-- Actores simulados con test.uid/test.jwt (stubs de auth.uid()/auth.jwt()).
-- Cada bloque termina en RAISE NOTICE 'OK …' o aborta con excepción.
-- ============================================================================
\set ON_ERROR_STOP on

-- Helpers de sesión
create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  a uuid; b uuid; g uuid; c uuid; d uuid; e uuid; f uuid;
  v jsonb; v_porra uuid; v_slug text; v_si uuid; v_no uuid;
  v_tok uuid; n int; pts_a int; pts_b int;
  v2 jsonb; p2 uuid; o2a uuid; o2b uuid;
  err text;
begin
  -- ── actores ────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('ana.creadora@test.dev') returning id into a;
  insert into auth.users (email) values ('bruno.rival@test.dev') returning id into b;
  insert into auth.users (email) values ('carla@test.dev') returning id into c;
  insert into auth.users (email) values ('dani@test.dev') returning id into d;
  insert into auth.users (email) values ('elena@test.dev') returning id into e;
  insert into auth.users (email) values ('fran@test.dev') returning id into f;
  update profiles set points = 1000 where id in (a, b, c, d, e, f);

  -- ── RT-01: create_porra transaccional de un reto con premio ───────────────
  perform test_as(a);
  v := create_porra('¿Encontrará la rubia a alguien que le complemente?',
                    array['Sí', 'No'], now() + interval '1 hour',
                    p_my_option_idx => 1, p_stake_kind => 'prize', p_stake_text => 'Una cena');
  v_porra := (v->>'id')::uuid; v_slug := v->>'slug';
  select id into v_si from porra_options where porra_id = v_porra and idx = 0;
  select id into v_no from porra_options where porra_id = v_porra and idx = 1;

  if not exists (select 1 from porras where id = v_porra and stake_kind = 'prize'
                   and stake_text = 'Una cena' and listed = false and source = 'user') then
    raise exception 'RT-01: la porra no se creó con premio y listed=false';
  end if;
  select points into pts_a from profiles where id = a;
  if pts_a <> 1000 then raise exception 'RT-01: un reto prize no debe gastar Vinkos (%).', pts_a; end if;
  if not exists (select 1 from picks where porra_id = v_porra and user_id = a
                   and option_id = v_no and points_spent = 0) then
    raise exception 'RT-01: falta el pick del creador a coste 0';
  end if;
  raise notice 'OK RT-01 create_porra: porra + opciones + pick del creador, atómico y a coste 0';

  -- ── RT-01: veto de importes en el premio ──────────────────────────────────
  begin
    perform create_porra('¿Quién gana mañana la partida?', array['Yo', 'Tú'],
                         now() + interval '1 hour', p_stake_kind => 'prize', p_stake_text => '50 €');
    raise exception 'RT-01: un premio con importe debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_STAKE_MONEY%' then raise exception 'RT-01: error inesperado %', err; end if;
  end;
  raise notice 'OK RT-01 stake_text_guard: «50 €» → VINKO_STAKE_MONEY';

  -- ── RT-05: pick de invitada CON NOMBRE y aviso inmediato al creador ───────
  insert into auth.users (email, is_anonymous) values (null, true) returning id into g;
  perform test_as(g, true);
  perform make_guest_pick(v_porra, v_si, 'Ana');
  if not exists (select 1 from profiles where id = g and is_anonymous and display_name = 'Ana') then
    raise exception 'RT-05: el nombre de la invitada no se guardó';
  end if;
  select count(*) into n from notifications
   where user_id = a and title like 'Ana acepta tu reto%' and body like 'Os jugáis: Una cena%';
  if n <> 1 then raise exception 'RT-05: el creador no recibió el aviso con nombre y premio'; end if;
  if not exists (select 1 from push_queue where user_id = a and title like 'Ana acepta tu reto%') then
    raise exception 'RT-05: el aviso no se encoló a push (directo, sin tope)';
  end if;
  raise notice 'OK RT-05 make_guest_pick: aviso «Ana acepta tu reto: va con Sí · Os jugáis: Una cena»';

  -- ── RT-06: invitada → cuenta real sin duplicados ──────────────────────────
  v_tok := create_merge_token();
  perform test_as(b);
  v := merge_guest(v_tok);
  if (v->>'merged')::int <> 1 then raise exception 'RT-06: el pick no se fusionó (%).', v; end if;
  if exists (select 1 from profiles where id = g) then raise exception 'RT-06: el perfil invitado no se borró'; end if;
  select count(*) into n from picks where porra_id = v_porra;
  if n <> 2 then raise exception 'RT-06: debía haber 2 picks (creadora + Bruno), hay %', n; end if;
  if not exists (select 1 from picks where porra_id = v_porra and user_id = b and option_id = v_si) then
    raise exception 'RT-06: el pick fusionado no es de Bruno con Sí';
  end if;
  if not exists (select 1 from profiles where id = b and display_name = 'Ana') then
    raise exception 'RT-06: display_name no se copió a la cuenta real';
  end if;
  raise notice 'OK RT-06 merge_guest: pick conservado, perfil invitado fuera, nombre copiado';

  -- ── RT-07: propuesta → objeción (1v1 basta una) → re-propuesta → confirmar ─
  update porras set closes_at = now() - interval '1 minute' where id = v_porra;
  perform test_as(a);
  perform propose_result(v_porra, v_no);
  if not exists (select 1 from porra_result_proposals where porra_id = v_porra and option_id = v_no) then
    raise exception 'RT-07: la propuesta no quedó registrada';
  end if;
  select count(*) into n from notifications where user_id = b and title like '%dice que ganó No%';
  if n < 1 then raise exception 'RT-07: quien perdería no recibió «¿Estás de acuerdo?»'; end if;

  perform test_as(b);
  perform object_result(v_porra);
  if exists (select 1 from porra_result_proposals where porra_id = v_porra) then
    raise exception 'RT-07: en un 1v1 una objeción debía tumbar la propuesta';
  end if;
  select count(*) into n from notifications where user_id = a and title like 'Sin acuerdo%';
  if n < 1 then raise exception 'RT-07: el juez no recibió el aviso de desacuerdo'; end if;

  perform test_as(a);
  perform propose_result(v_porra, v_no);
  perform test_as(b);
  perform confirm_result(v_porra);
  if not exists (select 1 from porras where id = v_porra and status = 'resolved' and winning_option_id = v_no) then
    raise exception 'RT-07: con todos los perdedores conformes debía liquidarse ya';
  end if;
  raise notice 'OK RT-07 propuesta/objeción/confirmación: sin acuerdo en 1v1 y liquidación al confirmar';

  -- ── RT-08: un reto prize no da Puntería ni mueve Vinkos ───────────────────
  select points into pts_a from profiles where id = a;
  select points into pts_b from profiles where id = b;
  if pts_a <> 1000 or pts_b <> 1000 then
    raise exception 'RT-08: un reto prize movió Vinkos (a=%, b=%)', pts_a, pts_b;
  end if;
  if exists (select 1 from pick_scores where ref_id = v_porra) then
    raise exception 'RT-08: un reto prize concedió Puntería';
  end if;
  select count(*) into n from notifications where user_id = a and title like '🏆 Ganaste el reto%';
  if n < 1 then raise exception 'RT-05: la ganadora no recibió el aviso del resultado'; end if;
  select count(*) into n from notifications where user_id = b and title like 'Perdiste el reto%' and body like 'Pagas: Una cena%';
  if n < 1 then raise exception 'RT-05: el perdedor no recibió quién paga qué'; end if;
  raise notice 'OK RT-08 prize: 0 Vinkos movidos, 0 Puntería, avisos «quién paga la cena»';

  -- ── RT-08: Vinkos 1v1 (juez juega) → reparto SÍ, Puntería NO ──────────────
  perform test_as(a);
  v2 := create_porra('¿Quién friega este mes el piso compartido?', array['Ana', 'Bruno'],
                     now() + interval '1 hour', p_my_option_idx => 0);
  p2 := (v2->>'id')::uuid;
  select id into o2a from porra_options where porra_id = p2 and idx = 0;
  select id into o2b from porra_options where porra_id = p2 and idx = 1;
  perform test_as(b);
  perform make_pick(p2, o2b, 10);
  update porras set closes_at = now() - interval '1 minute' where id = p2;
  perform test_as(a);
  perform propose_result(p2, o2a);
  perform test_as(b);
  perform confirm_result(p2);
  select points into pts_a from profiles where id = a;
  if pts_a <> 1000 + 25 + 10 then -- 1000 − 10 (su pick) + 25 (loop del creador por Bruno) + 20 (bote)
    raise exception 'RT-08 1v1 vinkos: reparto raro (a=%)', pts_a;
  end if;
  if exists (select 1 from pick_scores where ref_id = p2) then
    raise exception 'RT-08: un 1v1 con el juez jugando concedió Puntería';
  end if;
  raise notice 'OK RT-08 vinkos 1v1: Vinkos repartidos, Puntería 0 (el juez jugaba)';

  -- ── RT-08: 5 participantes reales y juez que NO juega → Puntería SÍ ───────
  perform test_as(a);
  v2 := create_porra('¿Llega la cima del sábado antes de comer?', array['Llegan', 'No llegan'],
                     now() + interval '1 hour'); -- sin pick propio: «solo organizo»
  p2 := (v2->>'id')::uuid;
  select id into o2a from porra_options where porra_id = p2 and idx = 0;
  select id into o2b from porra_options where porra_id = p2 and idx = 1;
  perform test_as(b); perform make_pick(p2, o2a, 10);
  perform test_as(c); perform make_pick(p2, o2a, 10);
  perform test_as(d); perform make_pick(p2, o2b, 10);
  perform test_as(e); perform make_pick(p2, o2b, 10);
  perform test_as(f); perform make_pick(p2, o2b, 10);
  update porras set closes_at = now() - interval '1 minute' where id = p2;
  perform test_as(a);
  perform propose_result(p2, o2a);
  perform test_as(d); perform confirm_result(p2);
  perform test_as(e); perform confirm_result(p2);
  perform test_as(f); perform confirm_result(p2);
  if not exists (select 1 from porras where id = p2 and status = 'resolved') then
    raise exception 'RT-07: el grupo con todos los perdedores conformes no liquidó';
  end if;
  select count(*) into n from pick_scores where ref_id = p2 and score > 0;
  if n <> 2 then raise exception 'RT-08: con ≥5 reales y juez fuera, los 2 acertantes debían puntuar (hay %)', n; end if;
  raise notice 'OK RT-08 habilidad: 5 participantes + juez fuera → Puntería concedida';

  -- ── RT-07: 72 h sin resultado → cancelación con devolución ────────────────
  perform test_as(a);
  v2 := create_porra('¿Trae alguien el postre del domingo?', array['Sí', 'No'],
                     now() + interval '1 hour', p_my_option_idx => 0);
  p2 := (v2->>'id')::uuid;
  select id into o2b from porra_options where porra_id = p2 and idx = 1;
  perform test_as(b); perform make_pick(p2, o2b, 50);
  select points into pts_b from profiles where id = b;
  update porras set closes_at = now() - interval '73 hours' where id = p2;
  perform cron_result_flow();
  if not exists (select 1 from porras where id = p2 and status = 'taken_down') then
    raise exception 'RT-07: a las 72 h debía cancelarse sola';
  end if;
  if (select points from profiles where id = b) <> pts_b + 50 then
    raise exception 'RT-07: la cancelación no devolvió los Vinkos';
  end if;
  raise notice 'OK RT-07 cron: 72 h sin juez → cancelada con devolución';
end $$;

-- porra_social con invitada: nombre visible, handle null, flag guest
do $$
declare a uuid; g uuid; v jsonb; v_porra uuid; v_si uuid; pk jsonb;
begin
  insert into auth.users (email) values ('zoe@test.dev') returning id into a;
  update profiles set points = 1000 where id = a;
  perform test_as(a);
  v := create_porra('¿Llueve en la boda del sábado por la tarde?', array['Sí', 'No'],
                    now() + interval '1 hour', p_my_option_idx => 0, p_stake_kind => 'prize', p_stake_text => 'Un café');
  v_porra := (v->>'id')::uuid;
  select id into v_si from porra_options where porra_id = v_porra and idx = 0;
  insert into auth.users (email, is_anonymous) values (null, true) returning id into g;
  perform test_as(g, true);
  perform make_guest_pick(v_porra, v_si, 'Marta');
  v := porra_social(v_porra);
  select p into pk from jsonb_array_elements(v->'picks') p where (p->>'guest')::boolean limit 1;
  if pk is null then raise exception 'porra_social: falta el pick de la invitada'; end if;
  if pk->>'name' <> 'Marta' or pk->>'handle' is not null then
    raise exception 'porra_social: la invitada debía salir como «Marta» sin handle (sale %)', pk;
  end if;
  if not (pk->>'mine')::boolean then raise exception 'porra_social: mine debía ser true para la propia sesión'; end if;
  raise notice 'OK porra_social: invitada como «Marta · sin cuenta», nunca @invitado_…';
end $$;
