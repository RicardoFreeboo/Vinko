-- ============================================================================
-- Tests SQL de Vinko Ads · Fase 2 (0072, «los gustos»). «Listo cuando» de la
-- spec: un usuario de prueba tiene el perfil correcto tras votar, las
-- categorías sensibles nunca entran y la RLS se cumple. Además: grupo de
-- control, edad exacta, ubicación, bandos, alcance y RGPD.
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', coalesce(p_uid::text, ''), false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  u1 uuid; u2 uuid; u3 uuid; minor uuid; gst uuid; adm uuid;
  v jsonb; n int; err text; s_mill uuid;
  p_f1 uuid; p_f2 uuid; p_mus uuid; p_pol uuid; p_sal uuid;
  o_f1 uuid; o_f2 uuid; o_mus uuid; o_pol uuid; o_sal uuid;
begin
  -- ── actores ────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('ads.uno@test.dev')    returning id into u1;
  insert into auth.users (email) values ('ads.dos@test.dev')    returning id into u2;
  insert into auth.users (email) values ('ads.tres@test.dev')   returning id into u3;
  insert into auth.users (email) values ('ads.menor@test.dev')  returning id into minor;
  insert into auth.users (email) values ('ads.admin@test.dev')  returning id into adm;
  insert into auth.users (email, is_anonymous) values (null, true) returning id into gst;
  update profiles set is_anonymous = true where id = gst;
  update profiles set role = 'admin' where id = adm;

  -- ── 1) grupo de control del 5 %: al nacer el perfil, estable, invitados incluidos ──
  if (select count(*) from ads_user_flags where user_id in (u1, u2, u3, minor, adm, gst)) <> 6 then
    raise exception '1: cada perfil nuevo debía tener su fila en ads_user_flags';
  end if;
  if (select ads_holdout from ads_user_flags where user_id = u1) <> (ads_holdout_bucket(u1) < 5) then
    raise exception '1: el grupo de control no sale del uid';
  end if;
  select count(*) into n from generate_series(1, 4000) g where ads_holdout_bucket(gen_random_uuid()) < 5;
  if n not between 120 and 280 then raise exception '1: el grupo de control debía rondar el 5 %% (salió %/4000)', n; end if;
  -- para el resto del test, nadie del grupo de control
  update ads_user_flags set ads_holdout = false where user_id in (u1, u2, u3, minor, adm);
  raise notice 'OK 1 grupo de control: fila al nacer, estable por uid, ~5 %% (% de 4000)', n;

  -- ── 2) fecha de nacimiento completa: 18 años exactos, mínimo 14 ─────────────
  perform test_as(u1);
  v := set_birth_date((current_date - interval '25 years')::date);
  if not (v->>'adult')::boolean then raise exception '2: 25 años debía ser adulto'; end if;
  if (select birth_year from profiles where id = u1) <> extract(year from current_date - interval '25 years')::int then
    raise exception '2: birth_year debía seguir a birth_date';
  end if;
  perform test_as(u2);
  v := set_birth_date((current_date - interval '18 years')::date);
  if not (v->>'adult')::boolean then raise exception '2: cumple 18 hoy → adulto'; end if;
  -- REGLAS-LEGALES R6 (0062): solo +18. A quien le falta un día, rechazado.
  perform test_as(u3);
  begin
    perform set_birth_date((current_date - interval '18 years' + interval '1 day')::date);
    raise exception '2: le falta un día para 18 → debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_TOO_YOUNG%' then raise exception '2: error inesperado %', err; end if;
  end;
  perform set_birth_date((current_date - interval '40 years')::date);
  perform test_as(minor);
  begin
    perform set_birth_date((current_date - interval '16 years')::date);
    raise exception '2: 16 años debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_TOO_YOUNG%' then raise exception '2: error inesperado %', err; end if;
  end;
  -- el «menor» se queda sin fecha: nunca cuenta como adulto ni tiene franja
  -- con solo el año: adulto únicamente si lo es seguro (año ≤ actual − 19)
  update profiles set birth_date = null, birth_year = extract(year from current_date)::int - 18 where id = adm;
  if ads_is_adult(adm) then raise exception '2: con solo el año (actual − 18) no es seguro que tenga 18'; end if;
  update profiles set birth_year = extract(year from current_date)::int - 19 where id = adm;
  if not ads_is_adult(adm) then raise exception '2: con año actual − 19 es adulto seguro'; end if;
  raise notice 'OK 2 fecha completa: 18 exactos, menores rechazados, solo año = conservador';

  -- ── 3) ubicación: ciudad normalizada, país por IP, nunca invitados ──────────
  perform test_as(u1);
  perform ads_touch_location('Bogotá D.C.', 'co');
  if (select last_city from ads_user_profile where user_id = u1) <> 'bogota-d-c' then
    raise exception '3: ciudad mal normalizada: %', (select last_city from ads_user_profile where user_id = u1);
  end if;
  perform ads_touch_location('Bogotá', 'CO');
  perform ads_touch_location(null, 'XX');   -- sin datos: no borra lo que había
  if (select last_city || '/' || ip_country from ads_user_profile where user_id = u1) <> 'bogota/CO' then
    raise exception '3: la ubicación no debía perderse con cabeceras vacías';
  end if;
  perform test_as(u2); perform ads_touch_location('Medellín', 'CO');
  perform test_as(u3); perform ads_touch_location('Bogotá', 'CO');
  update profiles set country = 'CO' where id in (u1, u2, u3, minor);
  perform test_as(gst, true); perform ads_touch_location('Cali', 'CO');
  if exists (select 1 from ads_user_profile where user_id = gst) then
    raise exception '3: un invitado no debía tener perfil publicitario';
  end if;
  raise notice 'OK 3 ubicación: slug de ciudad, país por IP, invitados fuera';

  -- ── 4) perfil tras votar: afinidad e intereses, sin sensibles (A7) ─────────
  update profiles set interests = array['futbol','politica','mi_vida'] where id = u1;
  insert into porras (slug, title, closes_at, category, resolution_criteria) values
    ('ads-g-f1', '¿Quién gana el clásico Nacional–Millonarios?', now() + interval '2 days', 'futbol', 'Resultado oficial publicado') returning id into p_f1;
  insert into porras (slug, title, closes_at, category, resolution_criteria) values
    ('ads-g-f2', '¿Millonarios o Junior en la final?', now() + interval '2 days', 'deportes', 'Resultado oficial publicado') returning id into p_f2;
  insert into porras (slug, title, closes_at, category, resolution_criteria) values
    ('ads-g-mus', '¿Qué canción cierra el concierto?', now() + interval '2 days', 'musica', 'Resultado oficial publicado') returning id into p_mus;
  insert into porras (slug, title, closes_at, category, resolution_criteria) values
    ('ads-g-pol', '¿Quién gana las elecciones?', now() + interval '2 days', 'actualidad', 'Resultado oficial publicado') returning id into p_pol;
  insert into porras (slug, title, closes_at, category, resolution_criteria) values
    ('ads-g-sal', '¿Llega la vacuna antes de marzo?', now() + interval '2 days', 'ciencia', 'Resultado oficial publicado') returning id into p_sal;
  insert into porra_options (porra_id, idx, label) values (p_f1, 0, 'Millonarios') returning id into o_f1;
  insert into porra_options (porra_id, idx, label) values (p_f1, 1, 'Nacional');
  insert into porra_options (porra_id, idx, label) values (p_f2, 0, 'Millonarios') returning id into o_f2;
  insert into porra_options (porra_id, idx, label) values (p_f2, 1, 'Junior');
  insert into porra_options (porra_id, idx, label) values (p_mus, 0, 'La primera') returning id into o_mus;
  insert into porra_options (porra_id, idx, label) values (p_mus, 1, 'La última');
  insert into porra_options (porra_id, idx, label) values (p_pol, 0, 'Candidato A') returning id into o_pol;
  insert into porra_options (porra_id, idx, label) values (p_pol, 1, 'Candidato B');
  insert into porra_options (porra_id, idx, label) values (p_sal, 0, 'Sí') returning id into o_sal;
  insert into porra_options (porra_id, idx, label) values (p_sal, 1, 'No');
  insert into picks (porra_id, user_id, option_id) values
    (p_f1, u1, o_f1), (p_f2, u1, o_f2), (p_mus, u1, o_mus), (p_pol, u1, o_pol), (p_sal, u1, o_sal),
    (p_f1, u3, o_f1), (p_f2, u3, o_f2);

  if ads_category_of('actualidad', '¿Quién gana las elecciones?') <> 'sensible'
     or ads_category_of('futbol', '¿Quién gana el partido del domingo?') <> 'futbol' then
    raise exception '4: clasificación de categorías inesperada';
  end if;

  n := ads_profile_refresh();
  if n < 4 then
    raise exception '4: ads_profile_refresh debía cubrir a los registrados (cubrió %): %', n,
      (select detail from ads_job_runs where job = 'ads_profile_refresh' order by id desc limit 1);
  end if;
  select to_jsonb(up) into v from ads_user_profile up where user_id = u1;
  if (v->>'votes_30d')::int <> 5 then raise exception '4: votos de 30 días: %', v->>'votes_30d'; end if;
  if (v->'affinities'->>'futbol')::numeric <> 0.4 then raise exception '4: afinidad fútbol = 2/5: %', v->'affinities'; end if;
  if (v->'affinities'->>'musica')::numeric <> 0.2 then raise exception '4: afinidad música = 1/5: %', v->'affinities'; end if;
  if (v->'affinities') ?| array['politica','religion','salud','sensible'] then
    raise exception '4: A7 — una categoría sensible entró en la afinidad: %', v->'affinities';
  end if;
  if (select interests from ads_user_profile where user_id = u1) <> array['futbol'] then
    raise exception '4: intereses = onboarding sin política ni mi_vida + afinidad fuerte: %',
      (select interests from ads_user_profile where user_id = u1);
  end if;
  if (select age_band from ads_user_profile where user_id = u1) <> '25-34' then raise exception '4: franja de edad de u1'; end if;
  if (select age_band from ads_user_profile where user_id = minor) is not null then
    raise exception '4: un menor no tiene franja de edad publicitaria';
  end if;
  if not exists (select 1 from ads_job_runs where job = 'ads_profile_refresh' and ok) then
    raise exception '4: el trabajo debía quedar en ads_job_runs';
  end if;
  raise notice 'OK 4 perfil tras votar: afinidad 2/5 fútbol, sin sensibles, intereses limpios, franja';

  -- ── 5) bandos: nunca sensibles; «Hinchas de Millonarios» con ≥ 2 votos ────
  begin
    insert into ads_sides (market, label, topic, rule)
    values ('CO', 'Votantes del partido X', 'politica', '{"category":"politica","option_any":["x"],"min_votes":1,"window_days":30}');
    raise exception '5: un bando político debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_ADS_BAD_SIDE%' then raise exception '5: error inesperado %', err; end if;
  end;
  n := ads_sides_refresh();
  select id into s_mill from ads_sides where label = 'Hinchas de Millonarios';
  if not exists (select 1 from ads_user_sides where user_id = u1 and side_id = s_mill)
     or not exists (select 1 from ads_user_sides where user_id = u3 and side_id = s_mill) then
    raise exception '5: u1 y u3 votaron Millonarios en 2 pollas de fútbol';
  end if;
  if exists (select 1 from ads_user_sides where user_id = u2) then raise exception '5: u2 no votó'; end if;
  raise notice 'OK 5 bandos: % pertenencias, sin bandos sensibles', n;

  -- ── 6) RLS: un usuario no lee perfiles, ni el suyo; el admin sí ─────────────
  perform test_as(u1);
  set local role authenticated;
  if (select count(*) from ads_user_profile) <> 0 or (select count(*) from ads_user_flags) <> 0
     or (select count(*) from ads_user_sides) <> 0 or (select count(*) from ads_job_runs) <> 0 then
    raise exception '6: RLS — un usuario no debía ver filas de ads_user_*';
  end if;
  begin
    insert into ads_user_flags (user_id, ads_holdout) values (u2, true);
    raise exception '6: un usuario no debía poder escribir en ads_user_flags';
  exception when insufficient_privilege then null;
  end;
  begin
    perform ads_profile_refresh();
    raise exception '6: un usuario no debía poder lanzar el trabajo';
  exception when insufficient_privilege then null;
  end;
  v := ads_set_preferences(false, true);
  if (v->>'personalized')::boolean or not (v->>'no_gambling')::boolean then
    raise exception '6: ads_set_preferences no guardó: %', v;
  end if;
  perform test_as(adm);
  if (select count(*) from ads_user_profile) = 0 then raise exception '6: el admin debía leer ads_user_profile'; end if;
  reset role;
  raise notice 'OK 6 RLS: usuario sin lectura ni escritura directa; preferencias por RPC; admin lee';

  -- ── 7) alcance: solo admin, mínimo y personalización ───────────────────────
  update ads_user_flags set ads_personalized = true where user_id = u1;
  update remote_config set value = jsonb_set(value, '{min_audience}', '2') where key = 'ads';
  perform test_as(u2);
  begin
    perform ads_estimate_reach('{}');
    raise exception '7: un usuario normal no debía estimar alcance';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_NOT_ADMIN%' then raise exception '7: error inesperado %', err; end if;
  end;
  perform test_as(adm);
  begin
    perform ads_estimate_reach('{"interests":["politica"]}');
    raise exception '7: segmentar por política debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_ADS_SENSITIVE%' then raise exception '7: error inesperado %', err; end if;
  end;
  -- adultos de CO fuera del control: u1 (25), u2 (18 hoy), u3 (40); el menor no cuenta
  v := ads_estimate_reach('{"market":"CO"}');
  if not (v->>'meets_minimum')::boolean or v->>'tier' <> 'broad' then raise exception '7: todo el país: %', v; end if;
  v := ads_estimate_reach(jsonb_build_object('cities', jsonb_build_array('bogota')));
  if not (v->>'meets_minimum')::boolean or v->>'tier' <> 'basic' then raise exception '7: Bogotá (u1 y u3): %', v; end if;
  v := ads_estimate_reach(jsonb_build_object('cities', jsonb_build_array('medellin')));
  if (v->>'meets_minimum')::boolean or v->>'people' is not null then
    raise exception '7: por debajo del mínimo no se devuelve la cifra: %', v;
  end if;
  update ads_user_flags set ads_personalized = false where user_id = u3;
  v := ads_estimate_reach(jsonb_build_object('cities', jsonb_build_array('bogota')));
  if (v->>'meets_minimum')::boolean then
    raise exception '7: quien apagó la personalización no entra en públicos segmentados: %', v;
  end if;
  v := ads_estimate_reach(jsonb_build_object('sides', jsonb_build_array(s_mill), 'interests', jsonb_build_array('futbol')));
  if v->>'tier' <> 'interest' then raise exception '7: nivel de bando/intereses: %', v; end if;
  update remote_config set value = jsonb_set(value, '{min_audience}', '1000') where key = 'ads';
  raise notice 'OK 7 alcance: solo admin, sin sensibles, mínimo sin cifra, personalización respetada';

  -- ── 8) RGPD: exportar incluye anuncios; borrar los elimina ─────────────────
  perform test_as(u1);
  v := export_me();
  if not (v ? 'ads') or (v->'ads'->'profile'->>'city') <> 'bogota' or (v->'ads'->>'birth_date') is null then
    raise exception '8: export_me debía incluir los datos de anuncios: %', v->'ads';
  end if;
  if not (v ? 'picks') then raise exception '8: export_me perdió el contenido original'; end if;
  v := delete_me();
  if not (v->>'ok')::boolean then raise exception '8: delete_me: %', v; end if;
  if exists (select 1 from ads_user_profile where user_id = u1) or exists (select 1 from ads_user_sides where user_id = u1)
     or exists (select 1 from ads_user_flags where user_id = u1)
     or (select birth_date from profiles where id = u1) is not null then
    raise exception '8: delete_me debía borrar los datos de anuncios y la fecha';
  end if;
  raise notice 'OK 8 RGPD: export incluye anuncios, borrar los elimina';

  raise notice '✅ Vinko Ads · Fase 2: todos los tests SQL en verde';
end $$;
