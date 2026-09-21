-- 0043 — Sesiones invitadas (0040) no cobran Vinkos ni reciben avisos de reparto.
-- Un usuario anónimo usa el rol `authenticated`, así que las RPC abiertas a ese
-- rol le responderían. Aquí se cierran las que mueven Vinkos y se excluyen los
-- picks invitados de las devoluciones y avisos de cierre.

-- Compartir: solo cuentas reales.
create or replace function public.grant_share_reward(p_porra uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_amt int := 50; v_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then return 0; end if;
  if not exists (select 1 from porras where id = p_porra and status = 'open' and not is_template) then return 0; end if;
  if exists (select 1 from share_rewards where porra_id = p_porra and user_id = auth.uid()) then return 0; end if;
  select count(*) into v_today from share_rewards
    where user_id = auth.uid() and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_today >= 1 then return 0; end if;
  insert into share_rewards (porra_id, user_id) values (p_porra, auth.uid());
  update profiles set points = points + v_amt where id = auth.uid();
  return v_amt;
end $$;

-- Invitación: un invitado anónimo no puede quedar como referido (lo hará al convertir).
create or replace function public.claim_referral(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare v_inviter profiles%rowtype; v_me profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then return; end if;
  select * into v_me from profiles where id = auth.uid();
  if v_me.referred_by is not null or v_me.created_at < now() - interval '7 days' then return; end if;
  select * into v_inviter from profiles where handle = lower(ltrim(p_handle, '@'));
  if not found or v_inviter.id = auth.uid() or coalesce(v_inviter.is_anonymous, false) then return; end if;
  update profiles set referred_by = v_inviter.id where id = auth.uid();
end $$;

-- Anular: a los picks invitados no se les devuelve nada (no pusieron Vinkos) ni se les avisa.
create or replace function public.void_porra(p_porra uuid, p_reason text default 'anulada')
returns void language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; r record;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if not (public.is_admin() or v.created_by = auth.uid()) then raise exception 'VINKO_NOT_CREATOR'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  update porras set status = 'taken_down', void_reason = left(coalesce(p_reason, 'anulada'), 120) where id = p_porra;
  for r in select user_id, points_spent from picks where porra_id = p_porra and not coalesce(is_guest, false) loop
    update profiles set points = points + r.points_spent where id = r.user_id;
    perform notify_user(r.user_id, 'resolucion', 'Porra anulada: ' || left(v.title, 50),
      'Se te devuelven ' || r.points_spent || ' Vinkos.', '/feed');
  end loop;
end $$;

-- Aviso de cierre: solo a quien puso Vinkos.
create or replace function public.cron_closed_pickers() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct po.id, po.slug, left(po.title, 50) tt, k.user_id
    from porras po join picks k on k.porra_id = po.id
    where po.status = 'open' and po.closes_at between now() - interval '20 minutes' and now()
      and not coalesce(k.is_guest, false)
      and not exists (select 1 from notifications n where n.user_id = k.user_id
        and n.url = '/p/' || po.slug and n.title like 'Cerró%' and n.created_at > now() - interval '3 hours')
  loop
    perform notify_user(r.user_id, 'evento', 'Cerró: ' || r.tt,
      'Cerrada. Pronto sabrás si acertaste.', '/p/' || r.slug);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Las porras editoriales copian el criterio de resolución de la propuesta
-- (columna de 0041). Cuerpos de 0030 con esa columna añadida.
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
      and not (flags ?| array['lexico','cuotas','invalida','seguridad','pregunta','opciones','sin_resolucion'])
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
      insert into porra_options (porra_id, idx, label) select id, i, left(opt, 80) from porras where slug = v_slug;
      i := i + 1;
    end loop;
    update topic_proposals set status = 'published' where id = r.id;
    if r.signal_id is not null then update signals set status = 'generated' where id = r.signal_id; end if;
    n := n + 1;
  end loop;
  return n;
end $$;

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
    insert into daily_picks (scheduled_for, lang, question, options, status, source_url)
      values (coalesce(pr.closes_at, now())::date, pr.lang, pr.title, pr.options, 'scheduled', pr.source_url);
  else
    v_close := greatest(coalesce(pr.closes_at, now() + interval '2 days'), now() + interval '1 hour');
    insert into porras (slug, title, source, status, closes_at, category, visibility, resolution_criteria, resolves_at)
      values (v_slug, left(pr.title, 120), 'editorial', 'open', v_close, pr.category, 'public',
              left(pr.resolution_criteria, 400), v_close)
      returning id into v_porra;
    for opt in select value from jsonb_array_elements_text(pr.options) loop
      insert into porra_options (porra_id, idx, label) values (v_porra, i, left(opt, 80));
      i := i + 1;
    end loop;
  end if;
  update topic_proposals set status = 'published' where id = p_id;
  if pr.signal_id is not null then update signals set status = 'generated' where id = pr.signal_id; end if;
  return v_porra;
end $$;
notify pgrst, 'reload schema';

-- Invitados (0040) fuera de make_pick: no cuentan para la invitación validada, el
-- loop del creador ni el tope de XP; y un JWT anónimo no puede hacer picks reales.
create or replace function public.make_pick(p_porra uuid, p_option uuid, p_stake integer default 10)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_eco jsonb := cfg('economy');
  v_min int := coalesce((v_eco->>'pick_min')::int, 10);
  v_max int := coalesce((v_eco->>'pick_max')::int, 1000);
  v_stake int;
  v_xp_today int;
  v_others int; v_my_picks int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;

  v_stake := coalesce(p_stake, v_min);
  if v_stake < v_min then raise exception 'VINKO_STAKE_MIN'; end if;
  if v_stake > v_max then raise exception 'VINKO_STAKE_MAX'; end if;

  update profiles set points = points - v_stake
    where id = auth.uid() and points >= v_stake;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;

  insert into picks (porra_id, user_id, option_id, points_spent)
    values (p_porra, auth.uid(), p_option, v_stake);

  -- XP por participar (cap diario) + racha. El XP NO escala con el importe:
  -- poner más Vinkos no debe comprar nivel.
  select count(*) into v_xp_today from picks
    where user_id = auth.uid() and not coalesce(is_guest, false)
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_xp_today <= coalesce((v_eco->>'pick_xp_daily_cap')::int, 5) then
    perform award_xp(auth.uid(), coalesce((v_eco->>'pick_xp')::int, 15));
  end if;
  perform touch_streak(auth.uid());

  -- LOOP DEL CREADOR (§7.2): +25 Vinkos por cada participante real en tu porra,
  -- tope 500 por porra (20 participantes). Solo porras de usuario, nunca a uno mismo.
  if v.source = 'user' and v.created_by is not null and v.created_by <> auth.uid() then
    select count(*) into v_others from picks where porra_id = p_porra and user_id <> v.created_by and not coalesce(is_guest, false);
    if v_others <= 20 then
      update profiles set points = points + 25 where id = v.created_by;
      if v_others in (1, 5, 10, 20) then
        perform notify_user(v.created_by, 'social', v_others || ' ya han entrado en tu porra',
          '+' || (25 * v_others) || ' Vinkos acumulados por ' || left(v.title, 40), '/p/' || v.slug);
      end if;
    end if;
  end if;

  -- INVITACIÓN VALIDADA: en el primer pick del invitado cobran los dos.
  select count(*) into v_my_picks from picks where user_id = auth.uid() and not coalesce(is_guest, false);
  if v_my_picks = 1 then perform pay_referral(auth.uid()); end if;
end $$;

-- claim_drip (última definición en 0007_streaks_leagues_seasons.sql) + guarda anti-invitado.
create or replace function public.claim_drip() returns int
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_eco jsonb := cfg('economy');
  v_amt int := coalesce((v_eco->>'drip_amount')::int, 100);
  v_int int := coalesce((v_eco->>'drip_interval_h')::int, 4);
  v_cap int := coalesce((v_eco->>'cap_pts')::int, 7500);
  v_ticks int; v_grant int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if p.points >= v_cap then
    update profiles set last_drip = now() where id = p.id; -- el goteo no corre sobre el techo
    return 0;
  end if;
  v_ticks := floor(extract(epoch from (now() - p.last_drip)) / (v_int * 3600));
  if v_ticks <= 0 then return 0; end if;
  v_grant := least(v_ticks * v_amt, v_cap - p.points);
  update profiles set points = points + v_grant,
    last_drip = p.last_drip + (v_ticks * v_int || ' hours')::interval
    where id = p.id;
  return v_grant;
end $$;

-- claim_daily_bonus (última definición en 0007_streaks_leagues_seasons.sql) + guarda anti-invitado.
create or replace function public.claim_daily_bonus() returns int
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_eco jsonb := cfg('economy');
  v_today date := madrid_today();
  v_step int; v_amt int;
  v_ladder jsonb := coalesce(v_eco->'daily_bonus', '[50,75,100,150,200,300,500]'::jsonb);
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if p.daily_bonus_last = v_today then return 0; end if;
  if p.daily_bonus_last = v_today - 1 then
    v_step := least(p.daily_bonus_step + 1, jsonb_array_length(v_ladder));
  else
    v_step := 1; -- se rompió la escalera
  end if;
  v_amt := coalesce((v_ladder ->> (v_step - 1))::int, 50);
  update profiles set points = points + v_amt,
    daily_bonus_step = v_step, daily_bonus_last = v_today where id = p.id;
  perform award_xp(p.id, 10);
  perform touch_streak(p.id);
  return v_amt;
end $$;

-- answer_daily (última definición en 0008_loop_store_groups_ads.sql) + guarda anti-invitado.
create or replace function public.answer_daily(p_day uuid, p_idx smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d daily_picks%rowtype;
  v_eco jsonb := cfg('economy');
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into d from daily_picks where id = p_day for update;
  if not found or d.status <> 'open' then raise exception 'VINKO_CLOSED'; end if;
  if d.scheduled_for <> madrid_today() then raise exception 'VINKO_CLOSED'; end if;
  if p_idx < 0 or p_idx >= jsonb_array_length(d.options) then raise exception 'VINKO_BAD_OPTION'; end if;
  insert into daily_pick_answers (day_id, user_id, option_idx, pts, xp)
    values (p_day, auth.uid(), p_idx,
      coalesce((v_eco->>'daily_pick_pts')::int, 150),
      coalesce((v_eco->>'daily_pick_xp')::int, 10));
  update profiles set points = points + coalesce((v_eco->>'daily_pick_pts')::int, 150)
    where id = auth.uid();
  perform award_xp(auth.uid(), coalesce((v_eco->>'daily_pick_xp')::int, 10));
  perform touch_streak(auth.uid());
end $$;

-- buy_item (última definición en 0008_loop_store_groups_ads.sql) + guarda anti-invitado.
create or replace function public.buy_item(p_code text, p_target uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare it store_items%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into it from store_items where code = p_code and active for update;
  if not found then raise exception 'VINKO_NO_ITEM'; end if;
  update profiles set points = points - it.cost
    where id = auth.uid() and points >= it.cost;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;
  insert into purchases (user_id, code, cost) values (auth.uid(), p_code, it.cost);

  if it.kind = 'shield' then
    update profiles set streak_shields = least(streak_shields + 1, 2) where id = auth.uid();
  elsif it.kind = 'double' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    update picks set boost = 'double'
      where porra_id = p_target and user_id = auth.uid() and boost is null
      and exists (select 1 from porras p where p.id = p_target and p.status = 'open' and p.closes_at > now());
    if not found then raise exception 'VINKO_BAD_TARGET'; end if;
  elsif it.kind = 'wildcard' then
    insert into user_items (user_id, code) values (auth.uid(), p_code);
  elsif it.kind = 'frame' then
    insert into user_cosmetics (user_id, code, kind) values (auth.uid(), p_code, 'frame')
      on conflict do nothing;
    update profiles set frame = p_code where id = auth.uid();
  elsif it.kind = 'group_shield' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    insert into user_items (user_id, code, target_id) values (auth.uid(), p_code, p_target);
  elsif it.kind = 'feature' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    update porras set featured_until = now() + interval '24 hours'
      where id = p_target and created_by = auth.uid() and status = 'open';
    if not found then raise exception 'VINKO_BAD_TARGET'; end if;
  end if;
end $$;

-- change_pick (última definición en 0008_loop_store_groups_ads.sql) + guarda anti-invitado.
create or replace function public.change_pick(p_porra uuid, p_option uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_item uuid;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select id into v_item from user_items
    where user_id = auth.uid() and code = 'wildcard' and used_at is null
    order by created_at limit 1 for update;
  if v_item is null then raise exception 'VINKO_NO_WILDCARD'; end if;
  if not exists (select 1 from porras p where p.id = p_porra and p.status = 'open' and p.closes_at > now()) then
    raise exception 'VINKO_CLOSED';
  end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update picks set option_id = p_option
    where porra_id = p_porra and user_id = auth.uid();
  if not found then raise exception 'VINKO_NO_PICK'; end if;
  update user_items set used_at = now(), target_id = p_porra where id = v_item;
end $$;

-- create_group (última definición en 0008_loop_store_groups_ads.sql) + guarda anti-invitado.
create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  insert into groups (name, created_by) values (p_name, auth.uid()) returning id into g;
  insert into group_members (group_id, user_id) values (g, auth.uid());
  return g;
end $$;

-- join_group (última definición en 0008_loop_store_groups_ads.sql) + guarda anti-invitado.
create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into g from groups where invite_code = lower(p_code);
  if not found then raise exception 'VINKO_NO_GROUP'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid())
    on conflict do nothing;
  perform notify_user(g.created_by, 'social',
    'Alguien nuevo en ' || g.name,
    'Un amigo ha entrado en tu grupo.', '/g/' || g.id);
  return g.id;
end $$;
notify pgrst, 'reload schema';
