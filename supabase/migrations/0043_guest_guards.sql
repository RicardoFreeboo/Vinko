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
  if not found or v_inviter.id = auth.uid() or v_inviter.handle like 'invitado_%' then return; end if;
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
