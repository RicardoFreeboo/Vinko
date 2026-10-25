-- ============================================================================
-- 0061 — SOLO-PUNTOS: el Reto sin premio (§1.5). Idempotente (create or replace
-- + drop if exists).
--
-- Quita el "premio-cosa" del Reto: Vinko no registra, arbitra ni recuerda un
-- premio externo (una cena tiene valor económico → sería una apuesta facilitada,
-- línea roja R1/R4). El Reto queda como porra que se juega SOLO con Vinkos y
-- Puntería. Se redefinen las RPCs que miraban stake_kind='prize' y se dropean
-- las columnas porras.stake_kind / stake_text, el trigger y su guard.
--
-- create_porra conserva su firma (p_stake_kind/p_stake_text siguen aceptándose
-- para no romper PostgREST, pero se IGNORAN): toda porra nace de Vinkos.
-- ============================================================================

-- ─────────── create_porra: sin premio (ignora p_stake_kind/p_stake_text) ─────
create or replace function public.create_porra(
  p_title text,
  p_options text[],
  p_closes_at timestamptz,
  p_my_option_idx int default null,
  p_stake_kind text default 'vinkos',
  p_stake_text text default null,
  p_resolves_at timestamptz default null,
  p_criteria text default null,
  p_arbiter_handle text default null,
  p_visibility text default 'public',
  p_template_key text default null,
  p_media_url text default null,
  p_media_kind text default null,
  p_listed boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_slug text; v_n int; i int; v_opt uuid;
  v_closes timestamptz; v_resolves timestamptz;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 5 then raise exception 'VINKO_BAD_TITLE'; end if;
  v_n := coalesce(array_length(p_options, 1), 0);
  if v_n < 2 or v_n > 6 then raise exception 'VINKO_BAD_OPTIONS'; end if;
  for i in 1..v_n loop
    if p_options[i] is null or char_length(btrim(p_options[i])) < 1 then raise exception 'VINKO_BAD_OPTIONS'; end if;
  end loop;
  if p_my_option_idx is not null and (p_my_option_idx < 0 or p_my_option_idx >= v_n) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  -- §1.5: p_stake_kind / p_stake_text se ignoran — toda porra es de Vinkos.
  v_closes := greatest(coalesce(p_closes_at, now() + interval '1 day'), now() + interval '5 minutes');
  v_resolves := greatest(coalesce(p_resolves_at, v_closes), v_closes);

  v_slug := left(trim(both '-' from regexp_replace(translate(lower(left(btrim(p_title), 40)), 'áéíóúñü¿?¡!,.:;', 'aeiounu'), '[^a-z0-9]+', '-', 'g')), 50)
            || '-' || substr(md5(gen_random_uuid()::text), 1, 5);

  insert into porras (slug, title, created_by, source, status, closes_at, visibility,
                      resolution_criteria, resolves_at, template_key, media_url, media_kind, listed)
  values (v_slug, left(btrim(p_title), 120), auth.uid(), 'user', 'open', v_closes,
          case when p_visibility in ('public', 'private') then p_visibility else 'public' end,
          left(coalesce(nullif(btrim(coalesce(p_criteria, '')), ''), 'Resuelve el juez con lo que se pueda comprobar.'), 280),
          v_resolves, p_template_key, p_media_url, p_media_kind, coalesce(p_listed, false))
  returning id into v_id;

  for i in 1..v_n loop
    insert into porra_options (porra_id, idx, label) values (v_id, i - 1, left(btrim(p_options[i]), 40));
  end loop;

  if p_arbiter_handle is not null and btrim(p_arbiter_handle) <> '' then
    perform public.set_arbiter(v_id, lower(btrim(p_arbiter_handle)));
  end if;

  if p_my_option_idx is not null then
    select id into v_opt from porra_options where porra_id = v_id and idx = p_my_option_idx;
    perform public.make_pick(v_id, v_opt, null);
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;

-- ─────────── make_pick: sin coste 0 de premio; aviso genérico ────────────────
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
  v_opt_label text; v_who text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  select label into v_opt_label from porra_options where id = p_option and porra_id = p_porra;
  if v_opt_label is null then raise exception 'VINKO_BAD_OPTION'; end if;

  v_stake := coalesce(p_stake, v_min);
  if v_stake < v_min then raise exception 'VINKO_STAKE_MIN'; end if;
  if v_stake > v_max then raise exception 'VINKO_STAKE_MAX'; end if;
  update profiles set points = points - v_stake
    where id = auth.uid() and points >= v_stake;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;

  insert into picks (porra_id, user_id, option_id, points_spent)
    values (p_porra, auth.uid(), p_option, v_stake);

  -- XP por participar (cap diario) + racha. El XP NO escala con el importe.
  select count(*) into v_xp_today from picks
    where user_id = auth.uid() and not coalesce(is_guest, false)
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_xp_today <= coalesce((v_eco->>'pick_xp_daily_cap')::int, 5) then
    perform award_xp(auth.uid(), coalesce((v_eco->>'pick_xp')::int, 15));
  end if;
  perform touch_streak(auth.uid());

  -- LOOP DEL CREADOR (+25 Vinkos, tope 20) + aviso en CADA entrada.
  if v.source = 'user' and v.created_by is not null and v.created_by <> auth.uid() then
    select count(*) into v_others from picks where porra_id = p_porra and user_id <> v.created_by and not coalesce(is_guest, false);
    if v_others <= 20 then
      update profiles set points = points + 25 where id = v.created_by;
      v_who := coalesce(public.profile_name(auth.uid()), 'Alguien');
      perform notify_social_direct(v.created_by, 'social',
        v_who || ' acepta tu reto: va con ' || v_opt_label,
        'En: ' || left(v.title, 60),
        '/p/' || v.slug);
    end if;
  end if;

  -- INVITACIÓN VALIDADA: en el primer pick del invitado cobran los dos.
  select count(*) into v_my_picks from picks where user_id = auth.uid() and not coalesce(is_guest, false);
  if v_my_picks = 1 then perform pay_referral(auth.uid()); end if;
end $$;

-- ─────────── make_guest_pick: aviso genérico (sin «Os jugáis») ───────────────
create or replace function public.make_guest_pick(p_porra uuid, p_option uuid, p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_uid uuid := auth.uid(); v_opt_label text; v_name text;
begin
  if v_uid is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  select label into v_opt_label from porra_options where id = p_option and porra_id = p_porra;
  if v_opt_label is null then raise exception 'VINKO_BAD_OPTION'; end if;

  v_name := left(btrim(coalesce(p_name, '')), 24);
  if v_name <> '' and (char_length(v_name) < 2 or public.content_unsafe(v_name)) then
    raise exception 'VINKO_BAD_NAME';
  end if;

  insert into profiles (id, handle, points, is_anonymous, guest_expires_at, display_name)
  values (v_uid, public.guest_handle(v_uid), 0, true, now() + interval '30 days', nullif(v_name, ''))
  on conflict (id) do nothing;
  update profiles
     set is_anonymous = true,
         points = case when not is_anonymous then 0 else points end,
         guest_expires_at = coalesce(guest_expires_at, created_at + interval '30 days'),
         display_name = coalesce(nullif(v_name, ''), display_name)
   where id = v_uid;

  insert into picks (porra_id, user_id, option_id, points_spent, is_guest)
  values (p_porra, v_uid, p_option, 0, true);

  if v.created_by is not null and v.created_by <> v_uid then
    perform notify_social_direct(v.created_by, 'social',
      coalesce(nullif(v_name, ''), 'Alguien') || ' acepta tu reto: va con ' || v_opt_label,
      'En: ' || left(v.title, 60) || ' · sin cuenta todavía',
      '/p/' || v.slug);
  end if;
end $$;

-- ─────────── porra_settle: sin la rama de premio (solo Vinkos) ───────────────
create or replace function public.porra_settle(p_porra uuid, p_winning uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_total int; v_winners int;
  v_pot bigint; v_win_stake bigint;
  v_pay int; v_net int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record;
  v_score int; v_win_label text; v_applied int;
  v_judge uuid; v_judge_picked boolean; v_scoring boolean;
  v_msg text;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if not exists (select 1 from porra_options where id = p_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  select label into v_win_label from porra_options where id = p_winning;
  update porras set status = 'resolved', winning_option_id = p_winning, resolved_at = now() where id = p_porra;
  delete from porra_result_proposals where porra_id = p_porra;
  delete from porra_result_objections where porra_id = p_porra;
  delete from porra_result_confirms where porra_id = p_porra;

  select count(*), coalesce(sum(points_spent), 0) into v_total, v_pot
    from picks where porra_id = p_porra and not coalesce(is_guest, false);
  select count(*), coalesce(sum(points_spent), 0) into v_winners, v_win_stake
    from picks where porra_id = p_porra and option_id = p_winning and not coalesce(is_guest, false);
  v_p := case when v_total > 0 then v_winners::numeric / v_total else 0 end;

  -- RT-08: la Puntería solo cuando es habilidad (editorial, o porra de usuario
  -- con ≥5 participantes reales y juez que no juega).
  v_judge := public.porra_judge(v);
  v_judge_picked := v_judge is not null and exists (
    select 1 from picks where porra_id = p_porra and user_id = v_judge and not coalesce(is_guest, false));
  v_scoring := (v.source <> 'user') or (v_total >= 5 and not v_judge_picked);

  for r in select k.user_id, k.option_id, k.boost, k.points_spent
             from picks k where k.porra_id = p_porra and not coalesce(k.is_guest, false) loop
    if v_winners = 0 then
      update profiles set points = points + r.points_spent where id = r.user_id;
      insert into porra_payouts (porra_id, user_id, amount, score, kind)
        values (p_porra, r.user_id, r.points_spent, 0, 'refund');
      perform notify_user(r.user_id, 'resolucion', 'Nadie acertó: ' || left(v.title, 50),
        'Se te devuelven ' || r.points_spent || ' Vinkos. Ganó "' || v_win_label || '".', '/p/' || v.slug);

    elsif r.option_id = p_winning then
      v_pay := floor(r.points_spent::numeric * v_pot / v_win_stake);
      v_net := v_pay - r.points_spent;
      update profiles set points = points + v_pay where id = r.user_id;
      v_msg := case
        when v_net <= 0 then 'Recuperas tus ' || v_pay || ' Vinkos: no había rival.'
        else 'Ganas +' || v_net || ' Vinkos (te llevas ' || v_pay || ').'
      end;
      if v_scoring then
        v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
        if r.boost = 'double' then v_score := v_score * 2; end if;
        perform award_score(r.user_id, v_score, 'porra', p_porra);
        select ps.score into v_applied from pick_scores ps
          where ps.user_id = r.user_id and ps.source = 'porra' and ps.ref_id = p_porra;
        insert into porra_payouts (porra_id, user_id, amount, score, kind)
          values (p_porra, r.user_id, v_pay, coalesce(v_applied, 0), 'payout');
        perform notify_social_direct(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
          v_msg || ' +' || v_score || ' de puntería. Ganó "' || v_win_label || '".', '/p/' || v.slug);
      else
        insert into porra_payouts (porra_id, user_id, amount, score, kind)
          values (p_porra, r.user_id, v_pay, 0, 'payout');
        perform notify_social_direct(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
          v_msg || ' Ganó "' || v_win_label || '".', '/p/' || v.slug);
      end if;

    else
      perform notify_user(r.user_id, 'resolucion', 'No acertaste: ' || left(v.title, 50),
        'Ganó "' || v_win_label || '". La próxima cae.', '/p/' || v.slug);
    end if;
  end loop;
end $$;
revoke execute on function public.porra_settle(uuid, uuid) from public, anon, authenticated;

-- ─────────── group_porras: sin stake_kind/stake_text ─────────────────────────
create or replace function public.group_porras(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'VINKO_NOT_MEMBER';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', po.id, 'slug', po.slug, 'title', po.title, 'status', po.status,
      'closes_at', po.closes_at, 'creator', public.profile_name(po.created_by),
      'picks', (select count(*) from picks k where k.porra_id = po.id)
    ) order by (po.status = 'open') desc, po.closes_at desc)
    from (
      select * from porras
      where group_id = p_group and not is_template
      order by (status = 'open') desc, closes_at desc
      limit 30
    ) po
  ), '[]'::jsonb);
end $$;
revoke execute on function public.group_porras(uuid) from public, anon;
grant execute on function public.group_porras(uuid) to authenticated;

-- ─────────── merge_guest: sin la rama de premio (todas de Vinkos) ────────────
create or replace function public.merge_guest(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t guest_merge_tokens%rowtype; v_moved int := 0; g profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into t from guest_merge_tokens where token = p_token for update;
  if not found or t.used_at is not null or t.created_at < now() - interval '24 hours'
     or t.guest_id = auth.uid() then
    return jsonb_build_object('merged', 0);
  end if;
  select * into g from profiles where id = t.guest_id and is_anonymous;
  if not found then
    update guest_merge_tokens set used_at = now() where token = p_token;
    return jsonb_build_object('merged', 0);
  end if;

  -- Pasa los picks del invitado a la cuenta real (si no tenía pick en esa porra).
  -- En una porra abierta se cobra la entrada si hay saldo (si no, se queda is_guest).
  declare mp record; v_entry int := coalesce((cfg('economy') ->> 'pick_min')::int, 10);
  begin
    for mp in select k.porra_id, p.status
                from picks k join porras p on p.id = k.porra_id
               where k.user_id = t.guest_id
                 and not exists (select 1 from picks k2 where k2.porra_id = k.porra_id and k2.user_id = auth.uid()) loop
      if mp.status = 'open' then
        update profiles set points = points - v_entry where id = auth.uid() and points >= v_entry;
        if found then
          update picks set user_id = auth.uid(), is_guest = false, points_spent = v_entry
           where porra_id = mp.porra_id and user_id = t.guest_id;
        else
          update picks set user_id = auth.uid()
           where porra_id = mp.porra_id and user_id = t.guest_id;
        end if;
      else
        update picks set user_id = auth.uid()
         where porra_id = mp.porra_id and user_id = t.guest_id;
      end if;
      v_moved := v_moved + 1;
    end loop;
  end;

  update profiles set display_name = coalesce(display_name, g.display_name) where id = auth.uid();
  update guest_merge_tokens set used_at = now() where token = p_token;
  delete from profiles where id = t.guest_id; -- cascada: picks duplicados del invitado
  return jsonb_build_object('merged', v_moved);
end $$;
revoke execute on function public.merge_guest(uuid) from public, anon;
grant execute on function public.merge_guest(uuid) to authenticated;

-- ─────────── Fuera el premio del modelo: trigger, guard y columnas ───────────
drop trigger if exists trg_0057_stake_text on public.porras;
drop function if exists public.stake_text_guard() cascade;
alter table public.porras drop column if exists stake_kind;
alter table public.porras drop column if exists stake_text;

notify pgrst, 'reload schema';
