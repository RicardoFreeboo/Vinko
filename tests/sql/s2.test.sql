-- ============================================================================
-- Tests SQL del S2 (0058): FX-03 tz, SEC-02 set_handle, FX-06 caducidad y
-- digest, FX-11 porras de grupo, FX-14 rotación de temporadas, FX-16 neto.
-- Corre tras reto.test.sql con los mismos stubs (test.uid/test.jwt).
-- ============================================================================
\set ON_ERROR_STOP on

do $$
declare
  u1 uuid; u2 uuid; u3 uuid; adm uuid; gst uuid;
  v jsonb; err text; n int;
  v_porra uuid; v_slug text; v_si uuid; v_no uuid;
  v_grp uuid; v_cfg jsonb;
  pts int; pts2 int;
  v_opt uuid;
begin
  -- ── actores ────────────────────────────────────────────────────────────────
  insert into auth.users (email) values ('s2.uno@test.dev') returning id into u1;
  insert into auth.users (email) values ('s2.dos@test.dev') returning id into u2;
  insert into auth.users (email) values ('s2.tres@test.dev') returning id into u3;
  insert into auth.users (email) values ('s2.admin@test.dev') returning id into adm;
  update profiles set points = 1000 where id in (u1, u2, u3, adm);
  update profiles set role = 'admin' where id = adm;

  -- ── FX-03: set_tz valida contra pg_timezone_names ──────────────────────────
  perform test_as(u1);
  begin
    perform set_tz('Europe/Mordor');
    raise exception 'FX-03: una tz inventada debía rechazarse';
  exception when others then
    err := sqlerrm;
    if err not like '%VINKO_BAD_TZ%' then raise exception 'FX-03: error inesperado %', err; end if;
  end;
  perform set_tz('America/Mexico_City');
  if (select tz from profiles where id = u1) <> 'America/Mexico_City' then
    raise exception 'FX-03: set_tz no guardó la zona';
  end if;
  if user_today(u1) <> (now() at time zone 'America/Mexico_City')::date then
    raise exception 'FX-03: user_today no usa la zona del usuario';
  end if;
  if user_today(u2) <> (now() at time zone 'Europe/Madrid')::date then
    raise exception 'FX-03: sin tz declarada el día debe ser el de Madrid';
  end if;
  raise notice 'OK FX-03 set_tz + user_today: CDMX para quien la declara, Madrid por defecto';

  -- ── FX-03: la racha cuenta con el calendario del usuario ───────────────────
  perform touch_streak(u1);
  if (select streak_last from profiles where id = u1) <> (now() at time zone 'America/Mexico_City')::date then
    raise exception 'FX-03: touch_streak no usa la zona del usuario';
  end if;
  raise notice 'OK FX-03 touch_streak: streak_last en el día local del usuario';

  -- ── FX-03: silencio por usuario (forzamos quiet [0,24] → siempre aplaza) ───
  select value into v_cfg from remote_config where key = 'push';
  update remote_config set value = coalesce(v_cfg, '{}'::jsonb) || '{"quiet_hours_local":[0,24]}' where key = 'push';
  if not found then
    insert into remote_config (key, value) values ('push', '{"quiet_hours_local":[0,24]}');
  end if;
  perform notify_social_direct(u1, 'social', 'Prueba silencio', 'Debe aplazarse', '/feed');
  if not exists (select 1 from push_queue where user_id = u1 and title = 'Prueba silencio'
                   and send_after is not null and send_after > now()) then
    raise exception 'FX-03: en silencio el push social debía aplazarse, no descartarse';
  end if;
  if try_reserve_push(u1, 'contenido') then
    raise exception 'FX-03: en silencio try_reserve_push debía devolver false';
  end if;
  -- restaurar la config
  if v_cfg is null then delete from remote_config where key = 'push';
  else update remote_config set value = v_cfg where key = 'push'; end if;
  raise notice 'OK FX-03 silencio: notify_social_direct aplaza y try_reserve_push respeta la zona';

  -- ── SEC-02: set_handle ─────────────────────────────────────────────────────
  perform test_as(u1);
  begin
    perform set_handle('A!');
    raise exception 'SEC-02: un @ inválido debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_BAD_HANDLE%' then raise exception 'SEC-02: error inesperado %', sqlerrm; end if;
  end;
  begin
    perform set_handle('admin');
    raise exception 'SEC-02: un @ reservado debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_HANDLE_RESERVED%' then raise exception 'SEC-02: error inesperado %', sqlerrm; end if;
  end;
  v := set_handle('@El_Patron_99');
  if (v->>'handle') <> 'el_patron_99'
     or (select handle from profiles where id = u1) <> 'el_patron_99' then
    raise exception 'SEC-02: set_handle no normalizó/guardó el @';
  end if;
  perform test_as(u2);
  begin
    perform set_handle('el_patron_99');
    raise exception 'SEC-02: un @ ocupado debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_HANDLE_TAKEN%' then raise exception 'SEC-02: error inesperado %', sqlerrm; end if;
  end;
  insert into auth.users (email, is_anonymous) values (null, true) returning id into gst;
  perform test_as(gst, true);
  begin
    perform set_handle('invitado_x');
    raise exception 'SEC-02: una sesión anónima no debía poder fijar @';
  exception when others then
    if sqlerrm not like '%VINKO_GUEST%' then raise exception 'SEC-02: error inesperado %', sqlerrm; end if;
  end;
  raise notice 'OK SEC-02 set_handle: formato, reservados, unicidad y veto a invitados';

  -- ── FX-16: sin rival → «Recuperas tus X Vinkos» y neto en el texto ─────────
  perform test_as(u1);
  v := create_porra('¿Llueve mañana en Vigo o aguanta?', array['Llueve', 'Aguanta'],
                    now() + interval '1 hour', p_my_option_idx => 0);
  v_porra := (v->>'id')::uuid; v_slug := v->>'slug';
  select id into v_si from porra_options where porra_id = v_porra and idx = 0;
  perform test_as(u2);
  perform make_pick(v_porra, v_si, 10); -- los dos al MISMO lado: no hay rival
  update porras set closes_at = now() - interval '1 minute' where id = v_porra;
  select points into pts from profiles where id = u1;
  select points into pts2 from profiles where id = u2;
  perform porra_settle(v_porra, v_si);
  if (select points from profiles where id = u1) <> pts + 10
     or (select points from profiles where id = u2) <> pts2 + 10 then
    raise exception 'FX-16: sin rival cada uno debía recuperar su entrada';
  end if;
  if not exists (select 1 from notifications where user_id = u1
                   and body like 'Recuperas tus 10 Vinkos: no había rival.%') then
    raise exception 'FX-16: falta el texto «Recuperas tus 10 Vinkos: no había rival»';
  end if;
  raise notice 'OK FX-16 sin rival: «Recuperas tus 10 Vinkos: no había rival»';

  -- ── FX-16: con rival el texto dice el NETO ─────────────────────────────────
  perform test_as(u1);
  v := create_porra('¿Gana el Celta este domingo en casa?', array['Sí', 'No'],
                    now() + interval '1 hour', p_my_option_idx => 0);
  v_porra := (v->>'id')::uuid;
  select id into v_si from porra_options where porra_id = v_porra and idx = 0;
  select id into v_no from porra_options where porra_id = v_porra and idx = 1;
  perform test_as(u2);
  perform make_pick(v_porra, v_no, 10);
  update porras set closes_at = now() - interval '1 minute' where id = v_porra;
  perform porra_settle(v_porra, v_si);
  -- bote 20, entrada 10 → se lleva 20, neto +10
  if not exists (select 1 from notifications where user_id = u1
                   and body like 'Ganas +10 Vinkos (te llevas 20).%') then
    raise exception 'FX-16: el acertante debía leer el neto «Ganas +10 Vinkos (te llevas 20)»';
  end if;
  raise notice 'OK FX-16 con rival: «Ganas +10 Vinkos (te llevas 20)»';

  -- ── FX-11: porra de grupo ──────────────────────────────────────────────────
  insert into groups (name, created_by) values ('Peña del bar', u1) returning id into v_grp;
  insert into group_members (group_id, user_id) values (v_grp, u1), (v_grp, u2);
  perform test_as(u1);
  v := create_porra('¿Quién paga la ronda del sábado?', array['Luis', 'Marta'],
                    now() + interval '1 hour', p_stake_kind => 'prize', p_stake_text => 'Una ronda');
  v_porra := (v->>'id')::uuid;
  perform porra_set_group(v_porra, v_grp);
  if (select group_id from porras where id = v_porra) <> v_grp then
    raise exception 'FX-11: porra_set_group no colgó la porra del grupo';
  end if;
  perform test_as(u3); -- NO es miembro
  begin
    perform group_porras(v_grp);
    raise exception 'FX-11: un no-miembro no debía ver las porras del grupo';
  exception when others then
    if sqlerrm not like '%VINKO_NOT_MEMBER%' then raise exception 'FX-11: error inesperado %', sqlerrm; end if;
  end;
  begin
    perform porra_set_group(v_porra, v_grp);
    raise exception 'FX-11: solo el creador puede colgar su porra';
  exception when others then
    if sqlerrm not like '%VINKO_NOT_CREATOR%' then raise exception 'FX-11: error inesperado %', sqlerrm; end if;
  end;
  perform test_as(u2);
  v := group_porras(v_grp);
  if jsonb_array_length(v) <> 1 or (v->0->>'title') not like '%ronda del sábado%' then
    raise exception 'FX-11: group_porras no devolvió la porra del grupo (%).', v;
  end if;
  raise notice 'OK FX-11 grupo: porra_set_group + group_porras solo para miembros';

  -- ── FX-06: editorial sin resultado 72 h → anulada con devolución ───────────
  insert into porras (slug, title, closes_at, source, status)
  values ('editorial-caducada-s2', '¿Quién gana el debate de la tele?', now() - interval '80 hours', 'editorial', 'open')
  returning id into v_porra;
  insert into porra_options (porra_id, idx, label) values (v_porra, 0, 'Azul') returning id into v_opt;
  insert into porra_options (porra_id, idx, label) values (v_porra, 1, 'Rojo');
  insert into picks (porra_id, user_id, option_id, points_spent) values (v_porra, u3, v_opt, 50);
  select points into pts from profiles where id = u3;
  perform cron_editorial_expire();
  if (select status from porras where id = v_porra) <> 'taken_down' then
    raise exception 'FX-06: la editorial caducada debía quedar anulada';
  end if;
  if (select points from profiles where id = u3) <> pts + 50 then
    raise exception 'FX-06: la anulación debía devolver los 50 Vinkos';
  end if;
  if not exists (select 1 from notifications where user_id = u3 and title like 'Porra anulada:%') then
    raise exception 'FX-06: falta el aviso de anulación con devolución';
  end if;
  raise notice 'OK FX-06 caducidad editorial: taken_down + devolución + aviso';

  -- ── FX-06: digest de admin, uno al día ─────────────────────────────────────
  insert into porras (slug, title, closes_at, source, status)
  values ('editorial-pendiente-s2', '¿Sube mañana la gasolina otra vez?', now() - interval '2 hours', 'editorial', 'open');
  perform cron_admin_digest();
  perform cron_admin_digest(); -- repetir NO duplica
  select count(*) into n from notifications where user_id = adm and title = 'Pendientes de hoy';
  if n <> 1 then raise exception 'FX-06: el admin debía tener exactamente 1 digest (tiene %)', n; end if;
  if not exists (select 1 from notifications where user_id = adm and title = 'Pendientes de hoy'
                   and body like '%por resolver%') then
    raise exception 'FX-06: el digest no cuenta las editoriales pendientes';
  end if;
  raise notice 'OK FX-06 digest: «Pendientes de hoy» a los admins, sin duplicar';

  -- ── FX-14: rotación de temporadas ──────────────────────────────────────────
  delete from seasons where starts_at > current_date;           -- fuera las futuras
  update seasons set ends_at = current_date - 3                  -- la vigente "terminó"
   where starts_at <= current_date and ends_at >= current_date;
  perform cron_season_rotate();
  if not exists (select 1 from seasons where starts_at <= current_date and ends_at >= current_date) then
    raise exception 'FX-14: tras rotar debía existir una temporada que cubra hoy';
  end if;
  perform cron_season_rotate(); -- idempotente
  select count(*) into n from seasons where starts_at <= current_date and ends_at >= current_date;
  if n <> 1 then raise exception 'FX-14: la rotación repetida no debía duplicar temporadas'; end if;
  raise notice 'OK FX-14 cron_season_rotate: encadena temporadas de 6 semanas sin duplicar';

  raise notice '✅ S2: todos los tests SQL en verde';
end $$;
