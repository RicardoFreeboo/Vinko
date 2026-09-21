-- 0030 — Endurecimiento para el lanzamiento (21-sep-2026)
-- Ricardo pidió dejar Vinko lista para lanzar y para un inversor. Cierra los
-- agujeros del repaso del 21-sep: el agente publicaba solo (contra el ALPHA
-- FREEZE), RPCs de admin y de Vinkos abiertas a cualquier sesión, textos de la
-- lista negra en avisos, y sin forma de anular una porra devolviendo Vinkos.

-- 1) El agente NO publica solo: cron apagado; la RPC solo para admin/servicio.
update cron.job set active = false where jobname = 'vinko-agent-publish';
revoke execute on function public.agent_autopublish(integer) from anon, authenticated;
revoke execute on function public.cron_league_close() from anon, authenticated;

-- 2) Menores como sujeto de una porra: veto en base de datos (además del agente).
create or replace function public.content_minor(p text) returns boolean
language sql immutable as $$
  select p ~* '(\ysub[ -]?1[0-9]\y|\yjuvenil|\ycadete|\yinfantil|\yalev[ií]n|\ybenjam[ií]n|menor(es)? de edad|\yni[ñn][oa]s?\y|\yadolescent|\y(1[0-7]) a[ñn]os\y|\ycolegio\y|\yinstituto\y)'
$$;

create or replace function public.agent_autopublish(p_max integer default 6) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_slug text; opt text; i int;
begin
  -- Solo admin (desde /admin) o el servidor (cron/service role): nunca un usuario.
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
    insert into porras (slug, title, source, status, closes_at, category, visibility)
      values (v_slug, left(r.title, 120), 'editorial', 'open',
              greatest(coalesce(r.closes_at, now() + interval '2 days'), now() + interval '2 hours'), r.category, 'public');
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
declare pr topic_proposals%rowtype; v_porra uuid; opt text; i int := 0; v_slug text;
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
    insert into porras (slug, title, source, status, closes_at, category, visibility)
      values (v_slug, left(pr.title, 120), 'editorial', 'open',
              greatest(coalesce(pr.closes_at, now() + interval '2 days'), now() + interval '1 hour'),
              pr.category, 'public')
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

-- 3) Anular una porra devolviendo los Vinkos (creador o admin). Estado
--    taken_down + motivo; los picks se conservan para auditoría.
alter table public.porras add column if not exists void_reason text;
create or replace function public.void_porra(p_porra uuid, p_reason text default 'anulada')
returns void language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; r record;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if not (public.is_admin() or v.created_by = auth.uid()) then raise exception 'VINKO_NOT_CREATOR'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  update porras set status = 'taken_down', void_reason = left(coalesce(p_reason, 'anulada'), 120) where id = p_porra;
  for r in select user_id, points_spent from picks where porra_id = p_porra loop
    update profiles set points = points + r.points_spent where id = r.user_id;
    perform notify_user(r.user_id, 'resolucion', 'Porra anulada: ' || left(v.title, 50),
      'Se te devuelven ' || r.points_spent || ' Vinkos.', '/feed');
  end loop;
end $$;
grant execute on function public.void_porra(uuid, text) to authenticated;

-- 4) Perfil: las porras retiradas/anuladas no salen en la rejilla.
create or replace function public.profile_created(p_user uuid) returns setof porras
language sql stable security definer set search_path = public as $$
  select * from porras
  where created_by = p_user and not is_template and status <> 'taken_down'
    and (visibility = 'public' or status = 'resolved' or created_by = auth.uid())
  order by created_at desc limit 40;
$$;
create or replace function public.profile_played(p_user uuid) returns setof porras
language sql stable security definer set search_path = public as $$
  select p.* from porras p join picks k on k.porra_id = p.id
  where k.user_id = p_user and not p.is_template and p.status <> 'taken_down'
    and (p.visibility = 'public' or p.status = 'resolved'
         or p_user = auth.uid() or p.created_by = auth.uid())
  order by p.created_at desc limit 40;
$$;

-- 5) Invitaciones VALIDADAS (§7.2): el enlace solo registra quién te invitó;
--    los Vinkos se pagan a los dos cuando el invitado hace su PRIMER pick.
--    Hitos del que invita: 5 amigos +1.000, 10 amigos +2.500. Tope 10/día.
alter table public.profiles add column if not exists referral_paid_at timestamptz;
create or replace function public.claim_referral(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare v_inviter profiles%rowtype; v_me profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_me from profiles where id = auth.uid();
  if v_me.referred_by is not null or v_me.created_at < now() - interval '7 days' then return; end if;
  select * into v_inviter from profiles where handle = lower(ltrim(p_handle, '@'));
  if not found or v_inviter.id = auth.uid() then return; end if;
  update profiles set referred_by = v_inviter.id where id = auth.uid();
end $$;
create or replace function public.pay_referral(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me profiles%rowtype; v_eco jsonb := cfg('economy');
  v_inv int := coalesce((v_eco->>'invite_pts')::int, 200);
  v_new int := coalesce((v_eco->>'invitee_pts')::int, 200);
  v_cap int := coalesce((v_eco->>'invite_daily_cap')::int, 10);
  v_today int; v_total int;
begin
  select * into v_me from profiles where id = p_user for update;
  if v_me.referred_by is null or v_me.referral_paid_at is not null then return; end if;
  update profiles set referral_paid_at = now(), points = points + v_new where id = p_user;
  perform notify_user(p_user, 'social', 'Invitación completada',
    '+' || v_new || ' Vinkos por entrar con el enlace de un amigo.', '/saldo');
  select count(*) into v_today from profiles where referred_by = v_me.referred_by
    and (referral_paid_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_today > v_cap then return; end if;
  update profiles set points = points + v_inv where id = v_me.referred_by;
  perform award_xp(v_me.referred_by, 50);
  perform notify_user(v_me.referred_by, 'social', 'Tu invitación funcionó',
    '+' || v_inv || ' Vinkos: ' || v_me.handle || ' ya ha hecho su primer pick.', '/saldo');
  select count(*) into v_total from profiles where referred_by = v_me.referred_by and referral_paid_at is not null;
  if v_total = 5 then
    update profiles set points = points + 1000 where id = v_me.referred_by;
    perform notify_user(v_me.referred_by, 'social', '5 amigos dentro', '+1.000 Vinkos por traer a 5 amigos.', '/saldo');
  elsif v_total = 10 then
    update profiles set points = points + 2500 where id = v_me.referred_by;
    perform notify_user(v_me.referred_by, 'social', '10 amigos dentro', '+2.500 Vinkos por traer a 10 amigos.', '/saldo');
  end if;
end $$;
revoke execute on function public.pay_referral(uuid) from anon, authenticated;

-- 6) Compartir: reto diario, 50 Vinkos UNA vez al día (antes 5/día = 250 gratis).
create or replace function public.grant_share_reward(p_porra uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_amt int := 50; v_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not exists (select 1 from porras where id = p_porra and status = 'open' and not is_template) then return 0; end if;
  if exists (select 1 from share_rewards where porra_id = p_porra and user_id = auth.uid()) then return 0; end if;
  select count(*) into v_today from share_rewards
    where user_id = auth.uid() and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_today >= 1 then return 0; end if;
  insert into share_rewards (porra_id, user_id) values (p_porra, auth.uid());
  update profiles set points = points + v_amt where id = auth.uid();
  return v_amt;
end $$;

-- 7) make_pick: loop del creador + pago de la invitación en el primer pick.
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
    where user_id = auth.uid()
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_xp_today <= coalesce((v_eco->>'pick_xp_daily_cap')::int, 5) then
    perform award_xp(auth.uid(), coalesce((v_eco->>'pick_xp')::int, 15));
  end if;
  perform touch_streak(auth.uid());

  -- LOOP DEL CREADOR (§7.2): +25 Vinkos por cada participante real en tu porra,
  -- tope 500 por porra (20 participantes). Solo porras de usuario, nunca a uno mismo.
  if v.source = 'user' and v.created_by is not null and v.created_by <> auth.uid() then
    select count(*) into v_others from picks where porra_id = p_porra and user_id <> v.created_by;
    if v_others <= 20 then
      update profiles set points = points + 25 where id = v.created_by;
      if v_others in (1, 5, 10, 20) then
        perform notify_user(v.created_by, 'social', v_others || ' ya han entrado en tu porra',
          '+' || (25 * v_others) || ' Vinkos acumulados por ' || left(v.title, 40), '/p/' || v.slug);
      end if;
    end if;
  end if;

  -- INVITACIÓN VALIDADA: en el primer pick del invitado cobran los dos.
  select count(*) into v_my_picks from picks where user_id = auth.uid();
  if v_my_picks = 1 then perform pay_referral(auth.uid()); end if;
end $$;

-- 8) Edad mínima de registro: 14 años (RGPD España), en servidor.
create or replace function public.profiles_age_guard() returns trigger
language plpgsql as $$
begin
  if new.birth_year is not null and new.birth_year > extract(year from current_date)::int - 14 then
    raise exception 'VINKO_TOO_YOUNG';
  end if;
  return new;
end $$;
drop trigger if exists profiles_age_guard on public.profiles;
create trigger profiles_age_guard before insert or update of birth_year on public.profiles
  for each row execute function public.profiles_age_guard();

-- 9) Lista negra fuera de los avisos que salen del servidor.
create or replace function public.cron_closed_pickers() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct po.id, po.slug, left(po.title, 50) tt, k.user_id
    from porras po join picks k on k.porra_id = po.id
    where po.status = 'open' and po.closes_at between now() - interval '20 minutes' and now()
      and not exists (select 1 from notifications n where n.user_id = k.user_id
        and n.url = '/p/' || po.slug and n.title like 'Cerró%' and n.created_at > now() - interval '3 hours')
  loop
    perform notify_user(r.user_id, 'evento', 'Cerró: ' || r.tt,
      'Cerrada. Pronto sabrás si acertaste.', '/p/' || r.slug);
  end loop;
end $$;

create or replace function public.touch_streak(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_today date := madrid_today();
  v_gap int;
  v_eco jsonb := cfg('economy');
  v_mile jsonb;
begin
  select * into p from profiles where id = p_user for update;
  if not found then return; end if;

  -- regen de escudo: 1 gratis por semana (lunes)
  if p.shield_regen_week is distinct from date_trunc('week', v_today)::date then
    update profiles set
      streak_shields = greatest(streak_shields, 1),
      shield_regen_week = date_trunc('week', v_today)::date
      where id = p_user;
    select * into p from profiles where id = p_user;
  end if;

  if p.streak_last = v_today then return; end if;
  v_gap := coalesce(v_today - p.streak_last, 999);

  if v_gap = 1 then
    update profiles set streak_days = streak_days + 1, streak_last = v_today,
      streak_best = greatest(streak_best, streak_days + 1) where id = p_user;
  elsif v_gap = 2 and p.streak_shields > 0 then
    -- el escudo se aplica automáticamente al día fallado
    update profiles set streak_days = streak_days + 1, streak_last = v_today,
      streak_shields = streak_shields - 1,
      streak_best = greatest(streak_best, streak_days + 1) where id = p_user;
    perform notify_user(p_user, 'racha', 'Tu escudo salvó la racha',
      'Fallaste un día y el escudo lo cubrió. Sigues en ' || (p.streak_days + 1) || ' días.', '/feed');
  else
    -- rota: si era ≥7, ventana de rescate de 24 h (placement R1)
    if p.streak_days >= 7 then
      update profiles set streak_broken_days = streak_days,
        streak_recover_until = now() + interval '24 hours',
        streak_days = 1, streak_last = v_today where id = p_user;
      perform notify_user(p_user, 'racha',
        'Puedes recuperar tu racha de ' || p.streak_days || ' días',
        'Tienes hasta mañana para recuperarla viendo un anuncio.', '/saldo');
    else
      update profiles set streak_days = 1, streak_last = v_today where id = p_user;
    end if;
  end if;

  -- hitos (3,7,14,30,60,100,365) con recompensa
  select * into p from profiles where id = p_user;
  v_mile := (v_eco->'streak_milestones') -> (p.streak_days::text);
  if v_mile is not null then
    update profiles set points = points + coalesce((v_mile->>'pts')::int, 0) where id = p_user;
    perform award_xp(p_user, coalesce((v_mile->>'xp')::int, 0));
    perform notify_user(p_user, 'racha',
      '¡Racha de ' || p.streak_days || ' días!',
      '+' || coalesce((v_mile->>'pts')::int, 0) || ' Vinkos y +' ||
      coalesce((v_mile->>'xp')::int, 0) || ' XP por tu constancia.', '/feed');
  end if;
end $$;

create or replace function public.resolve_daily(p_day uuid, p_correct smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  d daily_picks%rowtype;
  v_eco jsonb := cfg('economy');
  v_total int; v_hits int; v_p numeric;
  r record; v_score int;
  v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100);
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into d from daily_picks where id = p_day for update;
  if not found or d.status not in ('open') then raise exception 'VINKO_BAD_STATE'; end if;
  update daily_picks set status = 'resolved', correct_idx = p_correct where id = p_day;
  select count(*) into v_total from daily_pick_answers where day_id = p_day;
  if v_total = 0 then return; end if;
  select count(*) into v_hits from daily_pick_answers where day_id = p_day and option_idx = p_correct;
  update daily_pick_answers set correct = (option_idx = p_correct) where day_id = p_day;
  if v_hits = 0 then return; end if;
  v_p := v_hits::numeric / v_total;
  for r in select user_id from daily_pick_answers where day_id = p_day and option_idx = p_correct loop
    v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
    update profiles set points = points + coalesce((v_eco->>'daily_pick_hit_pts')::int, 300)
      where id = r.user_id;
    perform award_xp(r.user_id, coalesce((v_eco->>'daily_pick_hit_xp')::int, 25));
    perform award_score(r.user_id, v_score, 'daily', p_day);
    update daily_pick_answers set
      pts = pts + coalesce((v_eco->>'daily_pick_hit_pts')::int, 300),
      xp = xp + coalesce((v_eco->>'daily_pick_hit_xp')::int, 25),
      score = v_score
      where day_id = p_day and user_id = r.user_id;
    perform notify_user(r.user_id, 'resolucion',
      'Acertaste el pique del día',
      '+' || coalesce((v_eco->>'daily_pick_hit_pts')::int, 300) || ' Vinkos y +' || v_score || ' de puntería.', '/feed');
  end loop;
end $$;

create or replace function public.approve_user_video(p_porra uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_cfg jsonb := cfg('video'); v_amt int; v_xp int; v_today int;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into v from porras where id = p_porra for update;
  if not found or v.user_video_url is null then raise exception 'VINKO_NO_VIDEO'; end if;
  if exists (select 1 from video_rewards where porra_id = p_porra) then
    -- ya recompensado: solo re-publica
    update porras set video_url = user_video_url, video_status = 'ready' where id = p_porra;
    return 0;
  end if;
  v_amt := coalesce((v_cfg->>'user_upload_reward_pts')::int, 400);
  v_xp  := coalesce((v_cfg->>'user_upload_reward_xp')::int, 50);
  select count(*) into v_today from video_rewards
    where user_id = v.created_by and created_at::date = current_date;
  update porras set video_url = user_video_url, video_status = 'ready' where id = p_porra;
  if v.created_by is not null and v_today < coalesce((v_cfg->>'user_upload_daily_cap')::int, 3) then
    insert into video_rewards (porra_id, user_id, amount) values (p_porra, v.created_by, v_amt);
    update profiles set points = points + v_amt where id = v.created_by;
    perform award_xp(v.created_by, v_xp);   -- XP, jamás marcador (§0.2)
    perform notify_user(v.created_by, 'sistema', 'Tu vídeo fue aprobado',
      '+' || v_amt || ' Vinkos por tu vídeo de la porra.', '/p/' || v.slug);
    return v_amt;
  end if;
  return 0;
end $$;

update public.notifications set body = replace(body, 'Ya no se puede apostar.', 'Cerrada.')
  where body like 'Ya no se puede apostar.%';
notify pgrst, 'reload schema';
