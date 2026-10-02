-- 0058 · S2 (nota v1.0 2-oct-2026, §5):
--  · FX-03  Zona horaria por usuario (P0 LatAm): profiles.tz + set_tz().
--           La racha (touch_streak), las horas de silencio del push social
--           (notify_social_direct) y los topes (try_reserve_push) usan la zona
--           del usuario. El "pique del día" sigue siendo global (se programa a
--           las 9:00 Madrid): decisión documentada, no un olvido.
--  · SEC-02 set_handle(): elige tu @ (onboarding y Ajustes, también cuentas ya
--           creadas). Valida formato, reservados, content_unsafe y unicidad.
--  · FX-06  cron_admin_digest(): resumen diario a los admins con lo pendiente
--           de resolver. cron_editorial_expire(): porra editorial sin resultado
--           72 h tras el cierre → anulada con devolución (las de usuario ya las
--           cubre cron_result_flow, 0057).
--  · FX-11  Porras de grupo: porras.group_id + porra_set_group() + group_porras().
--  · FX-14  Temporada 2 + cron_season_rotate(): nunca se queda sin temporada.
--  · FX-16  porra_settle: el aviso del acertante dice lo que GANAS (neto); si
--           no había rival, «Recuperas tus X Vinkos».
-- Idempotente: se puede aplicar dos veces sin romper nada.

-- ──────────────────────── FX-03 · zona horaria por usuario ──────────────────
alter table public.profiles add column if not exists tz text;

-- Solo vía RPC (validada contra pg_timezone_names): una tz inválida rompería
-- los `at time zone` de racha y push. Sin grant de columna a propósito.
create or replace function public.set_tz(p_tz text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_tz is null or length(p_tz) > 64
     or not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'VINKO_BAD_TZ';
  end if;
  update profiles set tz = p_tz where id = auth.uid();
end $$;
revoke execute on function public.set_tz(text) from public, anon;
grant execute on function public.set_tz(text) to authenticated;

-- Zona efectiva de un usuario (Madrid si no declaró ninguna).
create or replace function public.user_tz(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.tz, ''), 'Europe/Madrid') from profiles p where p.id = p_user
$$;
revoke execute on function public.user_tz(uuid) from public, anon, authenticated;

-- "Hoy" en la zona del usuario (la racha cuenta días de SU calendario).
create or replace function public.user_today(p_user uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce(public.user_tz(p_user), 'Europe/Madrid'))::date
$$;
revoke execute on function public.user_today(uuid) from public, anon, authenticated;

-- try_reserve_push (0006) con horas de silencio y día en la zona del usuario.
create or replace function public.try_reserve_push(p_user uuid, p_class text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := cfg('push');
  v_tz text := public.user_tz(p_user);
  v_day date := (now() at time zone v_tz)::date;
  v_hour int := extract(hour from (now() at time zone v_tz))::int;
  v_daily int; v_weekly int; v_nonp int;
  v_quiet_from int := coalesce((v_cfg->'quiet_hours_local'->>0)::int, 23);
  v_quiet_to   int := coalesce((v_cfg->'quiet_hours_local'->>1)::int, 8);
begin
  -- horas de silencio (locales del usuario)
  if v_hour >= v_quiet_from or v_hour < v_quiet_to then return false; end if;
  -- preferencia de clase
  if exists (select 1 from push_prefs where user_id = p_user and class = p_class and not enabled) then
    return false;
  end if;
  -- bloqueo por fila del usuario+día: serializa reservas concurrentes
  perform pg_advisory_xact_lock(hashtext(p_user::text || v_day::text));
  select count(*) into v_daily  from push_sent where user_id = p_user and day = v_day;
  select count(*) into v_weekly from push_sent where user_id = p_user and day >= v_day - 6;
  if v_daily  >= coalesce((v_cfg->>'daily_cap')::int, 2)  then return false; end if;
  if v_weekly >= coalesce((v_cfg->>'weekly_cap')::int, 8) then return false; end if;
  if p_class in ('contenido','reactivacion') then
    select count(*) into v_nonp from push_sent
      where user_id = p_user and day >= v_day - 6 and class in ('contenido','reactivacion');
    if v_nonp >= coalesce((v_cfg->>'non_personal_weekly_cap')::int, 1) then return false; end if;
  end if;
  insert into push_sent (user_id, class, day) values (p_user, p_class, v_day);
  return true;
end $$;
revoke execute on function public.try_reserve_push(uuid, text) from public, anon, authenticated;

-- notify_social_direct (0057) con el aplazamiento en la zona del usuario.
create or replace function public.notify_social_direct(
  p_user uuid, p_class text, p_title text, p_body text, p_url text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := cfg('push');
  v_quiet_from int := coalesce((v_cfg->'quiet_hours_local'->>0)::int, 23);
  v_quiet_to   int := coalesce((v_cfg->'quiet_hours_local'->>1)::int, 8);
  v_tz text := public.user_tz(p_user);
  v_local timestamp := now() at time zone v_tz;
  v_hour int := extract(hour from v_local)::int;
  v_after timestamptz := null;
begin
  insert into notifications (user_id, class, title, body, url)
  values (p_user, p_class, p_title, p_body, p_url);
  if exists (select 1 from push_prefs where user_id = p_user and class = p_class and not enabled) then
    return;
  end if;
  if v_hour >= v_quiet_from then
    v_after := (v_local::date + 1 + make_interval(hours => v_quiet_to)) at time zone v_tz;
  elsif v_hour < v_quiet_to then
    v_after := (v_local::date + make_interval(hours => v_quiet_to)) at time zone v_tz;
  end if;
  insert into push_queue (user_id, class, title, body, url, send_after)
  values (p_user, p_class, p_title, p_body, p_url, v_after);
end $$;
revoke execute on function public.notify_social_direct(uuid, text, text, text, text) from public, anon, authenticated;

-- touch_streak (0030) con el día en la zona del usuario. Mismo cuerpo, con
-- madrid_today() → user_today(p_user).
create or replace function public.touch_streak(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_today date := public.user_today(p_user);
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
revoke execute on function public.touch_streak(uuid) from public, anon, authenticated;

-- ───────────────────────── SEC-02 · elige tu @ ──────────────────────────────
create or replace function public.set_handle(p_handle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_h text := lower(trim(both from coalesce(p_handle, '')));
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'VINKO_GUEST'; -- los invitados eligen @ al crear la cuenta
  end if;
  if left(v_h, 1) = '@' then v_h := substr(v_h, 2); end if;
  if v_h !~ '^[a-z0-9_]{3,24}$' then raise exception 'VINKO_BAD_HANDLE'; end if;
  -- reservados del producto + prefijo de cuentas borradas (0037)
  if v_h in ('vinko','admin','admins','soporte','ayuda','oficial','official',
             'staff','equipo','root','api','www','app','feed','login','saldo')
     or v_h like 'borrado\_%' escape '\' then
    raise exception 'VINKO_HANDLE_RESERVED';
  end if;
  if public.content_unsafe(v_h) then raise exception 'VINKO_HANDLE_UNSAFE'; end if;
  begin
    update profiles set handle = v_h where id = auth.uid();
  exception when unique_violation then
    raise exception 'VINKO_HANDLE_TAKEN';
  end;
  return jsonb_build_object('handle', v_h);
end $$;
revoke execute on function public.set_handle(text) from public, anon;
grant execute on function public.set_handle(text) to authenticated;

-- ───────────── FX-06 · digest de admin + caducidad editorial ────────────────
-- Porra EDITORIAL (o diaria/semilla: source <> 'user') cerrada hace 72 h sin
-- resultado → anulada con devolución. Las de usuario ya caducan en
-- cron_result_flow (0057) con el flujo del juez.
create or replace function public.cron_editorial_expire() returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; r record;
begin
  for v in
    select * from porras
    where source <> 'user' and not is_template and status = 'open'
      and closes_at < now() - interval '72 hours'
    order by closes_at limit 20
  loop
    update porras set status = 'taken_down', resolved_at = now() where id = v.id;
    for r in select k.user_id, k.points_spent from picks k
              where k.porra_id = v.id and not coalesce(k.is_guest, false) loop
      update profiles set points = points + r.points_spent where id = r.user_id;
      insert into porra_payouts (porra_id, user_id, amount, score, kind)
        values (v.id, r.user_id, r.points_spent, 0, 'refund');
      perform notify_user(r.user_id, 'resolucion', 'Porra anulada: ' || left(v.title, 50),
        'Sin resultado en 72 h. Se te devuelven ' || r.points_spent || ' Vinkos.', '/p/' || v.slug);
    end loop;
  end loop;
end $$;

-- Resumen diario a los admins con lo pendiente (editoriales por resolver,
-- piques del día atrasados, temas propuestos). Uno al día por admin.
create or replace function public.cron_admin_digest() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_editorial int; v_daily int; v_topics int; v_user int;
  v_body text; a record;
begin
  select count(*) into v_editorial from porras
   where source <> 'user' and not is_template and status = 'open' and closes_at < now();
  select count(*) into v_daily from daily_picks
   where status = 'open' and scheduled_for < (now() at time zone 'Europe/Madrid')::date;
  select count(*) into v_topics from topic_proposals where status = 'pending_review';
  select count(*) into v_user from porras
   where source = 'user' and not is_template and status = 'open' and closes_at < now() - interval '24 hours';
  if v_editorial + v_daily + v_topics = 0 then return; end if;

  v_body := trim(both ' · ' from
    case when v_editorial > 0 then v_editorial || ' porras por resolver · ' else '' end ||
    case when v_daily > 0 then v_daily || ' piques del día sin resultado · ' else '' end ||
    case when v_topics > 0 then v_topics || ' temas propuestos · ' else '' end ||
    case when v_user > 0 then v_user || ' de usuarios atascadas (se anulan solas)' else '' end);

  for a in select id from profiles where role = 'admin' and deleted_at is null loop
    if not exists (select 1 from notifications n
                    where n.user_id = a.id and n.title = 'Pendientes de hoy'
                      and n.created_at > now() - interval '20 hours') then
      perform notify_user(a.id, 'sistema', 'Pendientes de hoy', v_body, '/admin');
    end if;
  end loop;
end $$;

-- ───────────────────────── FX-11 · porras de grupo ──────────────────────────
alter table public.porras add column if not exists group_id uuid references public.groups(id) on delete set null;
create index if not exists porras_group_idx on public.porras (group_id) where group_id is not null;

-- El creador cuelga su porra del grupo (debe ser miembro). Se llama justo
-- después de create_porra desde /nueva?g=<id>.
create or replace function public.porra_set_group(p_porra uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.created_by is distinct from auth.uid() then raise exception 'VINKO_NOT_CREATOR'; end if;
  if not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'VINKO_NOT_MEMBER';
  end if;
  update porras set group_id = p_group where id = p_porra;
end $$;
revoke execute on function public.porra_set_group(uuid, uuid) from public, anon;
grant execute on function public.porra_set_group(uuid, uuid) to authenticated;

-- Porras del grupo, solo para miembros (las privadas de grupo no son públicas).
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
      'closes_at', po.closes_at, 'stake_kind', coalesce(po.stake_kind, 'vinkos'),
      'stake_text', po.stake_text, 'creator', public.profile_name(po.created_by),
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

-- ────────────── FX-14 · Temporada 2 y rotación automática ───────────────────
insert into public.seasons (number, name, starts_at, ends_at)
values (2, 'Temporada 2', date '2026-10-26', date '2026-12-06')
on conflict (number) do nothing;

-- Si ningún season cubre el día de hoy (Madrid), encadena temporadas de 6
-- semanas desde la última. Nunca más un lunes sin temporada.
create or replace function public.cron_season_rotate() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_last record; i int := 0;
begin
  loop
    exit when exists (select 1 from seasons where starts_at <= v_today and ends_at >= v_today);
    select number, ends_at into v_last from seasons order by ends_at desc limit 1;
    if not found then
      insert into seasons (number, name, starts_at, ends_at)
      values (1, 'Temporada 1', v_today, v_today + 41);
    else
      insert into seasons (number, name, starts_at, ends_at)
      values (v_last.number + 1, 'Temporada ' || (v_last.number + 1),
              v_last.ends_at + 1, v_last.ends_at + 42)
      on conflict (number) do nothing;
    end if;
    i := i + 1;
    exit when i > 12; -- cinturón de seguridad
  end loop;
end $$;

-- ──────── FX-16 · porra_settle: el acertante lee lo que GANA (neto) ─────────
-- Mismo motor que 0057; solo cambia el texto del aviso del acertante de Vinkos:
-- «Ganas +N» es el neto (reparto − entrada) y si no había rival (todos al mismo
-- lado) dice «Recuperas tus X Vinkos: no había rival».
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
  v_winner_names text; v_loser_names text;
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

  -- RT-08: ¿esta porra puntúa?
  v_judge := public.porra_judge(v);
  v_judge_picked := v_judge is not null and exists (
    select 1 from picks where porra_id = p_porra and user_id = v_judge and not coalesce(is_guest, false));
  v_scoring := (v.source <> 'user')
            or (v.stake_kind = 'vinkos' and v_total >= 5 and not v_judge_picked);

  if v.stake_kind = 'prize' then
    -- Reto con premio: ningún Vinko se mueve; se anota quién paga qué.
    select string_agg(public.profile_name(k.user_id), ', ') into v_winner_names
      from picks k where k.porra_id = p_porra and k.option_id = p_winning and not coalesce(k.is_guest, false);
    select string_agg(public.profile_name(k.user_id), ', ') into v_loser_names
      from picks k where k.porra_id = p_porra and k.option_id <> p_winning and not coalesce(k.is_guest, false);
    for r in select k.user_id, k.option_id from picks k
              where k.porra_id = p_porra and not coalesce(k.is_guest, false) loop
      if v_winners = 0 or v_winners = v_total then
        perform notify_user(r.user_id, 'resolucion', 'Reto sin perdedor: ' || left(v.title, 50),
          'Nadie paga: ' || case when v_winners = 0 then 'nadie acertó.' else 'acertasteis todos.' end, '/p/' || v.slug);
      elsif r.option_id = p_winning then
        perform notify_social_direct(r.user_id, 'resolucion', '🏆 Ganaste el reto: ' || left(v.title, 50),
          coalesce(v_loser_names, 'Quien falló') || ' paga: ' || v.stake_text, '/p/' || v.slug);
      else
        perform notify_social_direct(r.user_id, 'resolucion', 'Perdiste el reto: ' || left(v.title, 50),
          'Pagas: ' || v.stake_text || ' a ' || coalesce(v_winner_names, 'quien acertó'), '/p/' || v.slug);
      end if;
      insert into porra_payouts (porra_id, user_id, amount, score, kind)
        values (p_porra, r.user_id, 0, 0, case when r.option_id = p_winning and v_winners < v_total then 'payout' else 'refund' end);
    end loop;
    return;
  end if;

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
      -- FX-16: el texto cuenta el neto, no el bruto.
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
        -- RT-08: sin Puntería (reto entre pocos o con juez jugando): solo Vinkos.
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

-- ───────────────────────────── cron nuevos ──────────────────────────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    -- cron.schedule por nombre hace upsert: re-aplicar no duplica jobs.
    perform cron.schedule('vinko-admin-daily', '0 7 * * *', 'select public.cron_admin_digest()');
    perform cron.schedule('vinko-editorial-expire', '*/30 * * * *', 'select public.cron_editorial_expire()');
    perform cron.schedule('vinko-season-rotate', '20 3 * * *', 'select public.cron_season_rotate()');
  end if;
end $$;
