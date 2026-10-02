-- ============================================================================
-- 0057 — EL RETO (nota 2-oct §2). Idempotente.
--   RT-01 modelo: stake_kind/stake_text/listed en porras, propuesta de
--         resultado + objeciones, tokens de fusión de invitado, create_porra
--         transaccional.
--   RT-05 avisos: aviso al creador en CADA entrada (con nombre y premio),
--         push social directo sin tope y APLAZADO (no descartado) en horas de
--         silencio (push_queue.send_after).
--   RT-06 invitado→cuenta sin duplicados (create_merge_token / merge_guest).
--   RT-07 resultado: propuesta del juez + 48 h para objetar; recordatorios y
--         cancelación automática a las 72 h.
--   RT-08 Puntería solo cuando es habilidad: editoriales o porras de usuario
--         de Vinkos con ≥5 participantes reales y juez que no juega. Los retos
--         prize y las porras donde el juez participa dan XP y racha, no Puntería.
--   FX-04 (servidor): las porras de usuario nacen listed=false (create_porra).
-- ============================================================================

-- ─────────────────────────────── RT-01 · columnas ───────────────────────────
alter table public.porras add column if not exists stake_kind text not null default 'vinkos';
alter table public.porras add column if not exists stake_text text;
alter table public.porras add column if not exists listed boolean not null default true;
do $$ begin
  alter table public.porras add constraint porras_stake_kind_chk check (stake_kind in ('vinkos','prize'));
exception when duplicate_object then null; end $$;

-- El premio es una COSA («una cena»), nunca dinero ni un importe.
create or replace function public.stake_text_guard() returns trigger
language plpgsql as $$
begin
  if new.stake_kind = 'prize' then
    new.stake_text := left(btrim(coalesce(new.stake_text, '')), 60);
    if char_length(new.stake_text) < 3 then raise exception 'VINKO_STAKE_TEXT'; end if;
    if public.content_unsafe(new.stake_text) then raise exception 'VINKO_UNSAFE'; end if;
    if new.stake_text ~* '[€$£]|\d\s*(eur|euros?|pesos?|soles|reales|usd|d[oó]lares?)\y|\ydinero\y' then -- lexicon:ignore
      raise exception 'VINKO_STAKE_MONEY';
    end if;
    if new.stake_text ~* 'apuest|apost|\ycuotas?\y|\ybote\y|casino|wallet|\ycash\y|\ybet(s|ting)?\y' then -- lexicon:ignore
      raise exception 'VINKO_STAKE_LEXICON';
    end if;
  else
    new.stake_text := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_0057_stake_text on public.porras;
create trigger trg_0057_stake_text before insert or update of stake_kind, stake_text
  on public.porras for each row execute function public.stake_text_guard();

-- Propuesta de resultado (RT-07): una por porra; re-proponer la sustituye.
create table if not exists public.porra_result_proposals (
  porra_id    uuid primary key references public.porras(id) on delete cascade,
  option_id   uuid not null references public.porra_options(id),
  proposed_by uuid not null references public.profiles(id),
  proposed_at timestamptz not null default now(),
  deadline_at timestamptz not null
);
create table if not exists public.porra_result_objections (
  porra_id   uuid not null references public.porras(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (porra_id, user_id)
);
create table if not exists public.porra_result_confirms (
  porra_id   uuid not null references public.porras(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (porra_id, user_id)
);
alter table public.porra_result_proposals  enable row level security;
alter table public.porra_result_objections enable row level security;
alter table public.porra_result_confirms   enable row level security;
drop policy if exists proposals_read  on public.porra_result_proposals;
drop policy if exists objections_read on public.porra_result_objections;
drop policy if exists confirms_read   on public.porra_result_confirms;
create policy proposals_read  on public.porra_result_proposals  for select using (true);
create policy objections_read on public.porra_result_objections for select using (true);
create policy confirms_read   on public.porra_result_confirms   for select using (true);
revoke all on public.porra_result_proposals, public.porra_result_objections, public.porra_result_confirms from anon, authenticated;
grant select on public.porra_result_proposals, public.porra_result_objections, public.porra_result_confirms to anon, authenticated;

-- Tokens de fusión invitado→cuenta (RT-06). Nadie los lee desde el cliente.
create table if not exists public.guest_merge_tokens (
  token      uuid primary key default gen_random_uuid(),
  guest_id   uuid not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
alter table public.guest_merge_tokens enable row level security;
revoke all on public.guest_merge_tokens from anon, authenticated;

-- ──────────────── RT-05 · push social directo: aplazar, no descartar ────────
alter table public.push_queue add column if not exists send_after timestamptz;

-- Buzón siempre; push SIEMPRE (sin tope diario/semanal) salvo preferencia
-- apagada. En horas de silencio (23–08 Madrid; por usuario llegará con FX-03)
-- se APLAZA a las 08:00 en vez de descartarse.
create or replace function public.notify_social_direct(
  p_user uuid, p_class text, p_title text, p_body text, p_url text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := cfg('push');
  v_quiet_from int := coalesce((v_cfg->'quiet_hours_local'->>0)::int, 23);
  v_quiet_to   int := coalesce((v_cfg->'quiet_hours_local'->>1)::int, 8);
  v_now  timestamptz := now();
  v_local timestamp := v_now at time zone 'Europe/Madrid';
  v_hour int := extract(hour from v_local)::int;
  v_after timestamptz := null;
begin
  insert into notifications (user_id, class, title, body, url)
  values (p_user, p_class, p_title, p_body, p_url);
  if exists (select 1 from push_prefs where user_id = p_user and class = p_class and not enabled) then
    return;
  end if;
  if v_hour >= v_quiet_from then
    v_after := (v_local::date + 1 + make_interval(hours => v_quiet_to)) at time zone 'Europe/Madrid';
  elsif v_hour < v_quiet_to then
    v_after := (v_local::date + make_interval(hours => v_quiet_to)) at time zone 'Europe/Madrid';
  end if;
  insert into push_queue (user_id, class, title, body, url, send_after)
  values (p_user, p_class, p_title, p_body, p_url, v_after);
end $$;
revoke execute on function public.notify_social_direct(uuid, text, text, text, text) from public, anon, authenticated;

-- Nombre visible de un perfil para avisos: display_name, si no @handle.
create or replace function public.profile_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p.is_anonymous, false) then coalesce(nullif(p.display_name, ''), 'Alguien')
    else coalesce(nullif(p.display_name, ''), '@' || p.handle)
  end from profiles p where p.id = p_id
$$;
revoke execute on function public.profile_name(uuid) from public, anon, authenticated;

-- ─────────────────── RT-01 · create_porra transaccional ─────────────────────
-- Crea de una vez: porra (+premio) + opciones + pick del creador (opcional:
-- «Solo organizo, no juego») + árbitro (opcional). Todo o nada: se acabaron
-- las porras a medias por un insert que falla a mitad. FX-04: las porras de
-- usuario nacen listed=false (no salen en el feed global ni en el sitemap).
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
  if p_stake_kind not in ('vinkos', 'prize') then raise exception 'VINKO_BAD_STAKE_KIND'; end if;
  v_closes := greatest(coalesce(p_closes_at, now() + interval '1 day'), now() + interval '5 minutes');
  v_resolves := greatest(coalesce(p_resolves_at, v_closes), v_closes);

  v_slug := left(trim(both '-' from regexp_replace(translate(lower(left(btrim(p_title), 40)), 'áéíóúñü¿?¡!,.:;', 'aeiounu'), '[^a-z0-9]+', '-', 'g')), 50)
            || '-' || substr(md5(gen_random_uuid()::text), 1, 5);

  insert into porras (slug, title, created_by, source, status, closes_at, visibility,
                      resolution_criteria, resolves_at, template_key, media_url, media_kind,
                      stake_kind, stake_text, listed)
  values (v_slug, left(btrim(p_title), 120), auth.uid(), 'user', 'open', v_closes,
          case when p_visibility in ('public', 'private') then p_visibility else 'public' end,
          left(coalesce(nullif(btrim(coalesce(p_criteria, '')), ''), 'Resuelve el juez con lo que se pueda comprobar.'), 280),
          v_resolves, p_template_key, p_media_url, p_media_kind,
          p_stake_kind, p_stake_text, coalesce(p_listed, false))
  returning id into v_id;

  for i in 1..v_n loop
    insert into porra_options (porra_id, idx, label) values (v_id, i - 1, left(btrim(p_options[i]), 40));
  end loop;

  if p_arbiter_handle is not null and btrim(p_arbiter_handle) <> '' then
    perform public.set_arbiter(v_id, lower(btrim(p_arbiter_handle)));
  end if;

  -- El pick del creador (RT-02 paso 2). En un reto prize cuesta 0.
  if p_my_option_idx is not null then
    select id into v_opt from porra_options where porra_id = v_id and idx = p_my_option_idx;
    perform public.make_pick(v_id, v_opt, null);
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;
revoke execute on function public.create_porra(text, text[], timestamptz, int, text, text, timestamptz, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_porra(text, text[], timestamptz, int, text, text, timestamptz, text, text, text, text, text, text, boolean) to authenticated;

-- ───────── RT-01/RT-05 · make_pick: retos prize a 0 + aviso en cada entrada ──
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

  -- RT-01: en un reto con premio no se ponen Vinkos (points_spent = 0).
  if v.stake_kind = 'prize' then
    v_stake := 0;
  else
    v_stake := coalesce(p_stake, v_min);
    if v_stake < v_min then raise exception 'VINKO_STAKE_MIN'; end if;
    if v_stake > v_max then raise exception 'VINKO_STAKE_MAX'; end if;
    update profiles set points = points - v_stake
      where id = auth.uid() and points >= v_stake;
    if not found then raise exception 'VINKO_NO_POINTS'; end if;
  end if;

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

  -- LOOP DEL CREADOR (+25 Vinkos, tope 20 participantes) y, RT-05, aviso al
  -- creador en CADA entrada con nombre, opción y premio (antes: solo 1/5/10/20
  -- con un texto genérico; una invitada a las 03:15 no avisaba nunca).
  if v.source = 'user' and v.created_by is not null and v.created_by <> auth.uid() then
    select count(*) into v_others from picks where porra_id = p_porra and user_id <> v.created_by and not coalesce(is_guest, false);
    if v_others <= 20 then
      update profiles set points = points + 25 where id = v.created_by;
      v_who := coalesce(public.profile_name(auth.uid()), 'Alguien');
      perform notify_social_direct(v.created_by, 'social',
        v_who || ' acepta tu reto: va con ' || v_opt_label,
        case when v.stake_kind = 'prize' then 'Os jugáis: ' || v.stake_text
             else 'En: ' || left(v.title, 60) end,
        '/p/' || v.slug);
    end if;
  end if;

  -- INVITACIÓN VALIDADA: en el primer pick del invitado cobran los dos.
  select count(*) into v_my_picks from picks where user_id = auth.uid() and not coalesce(is_guest, false);
  if v_my_picks = 1 then perform pay_referral(auth.uid()); end if;
end $$;

-- make_guest_pick: la versión de 2 argumentos (0040) se elimina para que
-- PostgREST no tenga dos sobrecargas ambiguas; la nueva lleva p_name opcional.
drop function if exists public.make_guest_pick(uuid, uuid);
-- make_guest_pick: ahora con nombre («¿Cómo te llamas? Ricardo lo verá») y
-- avisando al creador igual que un pick real. Mantiene la firma vieja además.
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
      case when v.stake_kind = 'prize' then 'Os jugáis: ' || v.stake_text
           else 'En: ' || left(v.title, 60) end || ' · sin cuenta todavía',
      '/p/' || v.slug);
  end if;
end $$;
revoke execute on function public.make_guest_pick(uuid, uuid, text) from public, anon;
grant execute on function public.make_guest_pick(uuid, uuid, text) to authenticated;

-- ───────────── RT-08 · reparto con Puntería solo cuando es habilidad ────────
-- porra_settle: el motor de reparto (antes el cuerpo de resolve_porra, 0042)
-- con dos cambios: (a) los retos prize no mueven Vinkos y avisan con el premio;
-- (b) la Puntería SOLO se concede si la porra puntúa (editorial, o porra de
-- usuario de Vinkos con ≥5 participantes reales y juez que NO juega).
create or replace function public.porra_settle(p_porra uuid, p_winning uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_total int; v_winners int;
  v_pot bigint; v_win_stake bigint;
  v_pay int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record;
  v_score int; v_win_label text; v_applied int;
  v_judge uuid; v_judge_picked boolean; v_scoring boolean;
  v_winner_names text; v_loser_names text;
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
      update profiles set points = points + v_pay where id = r.user_id;
      if v_scoring then
        v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
        if r.boost = 'double' then v_score := v_score * 2; end if;
        perform award_score(r.user_id, v_score, 'porra', p_porra);
        select ps.score into v_applied from pick_scores ps
          where ps.user_id = r.user_id and ps.source = 'porra' and ps.ref_id = p_porra;
        insert into porra_payouts (porra_id, user_id, amount, score, kind)
          values (p_porra, r.user_id, v_pay, coalesce(v_applied, 0), 'payout');
        perform notify_social_direct(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
          '+' || v_pay || ' Vinkos y +' || v_score || ' de puntería. Ganó "' || v_win_label || '".', '/p/' || v.slug);
      else
        -- RT-08: sin Puntería (reto entre pocos o con juez jugando): solo Vinkos.
        insert into porra_payouts (porra_id, user_id, amount, score, kind)
          values (p_porra, r.user_id, v_pay, 0, 'payout');
        perform notify_social_direct(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
          '+' || v_pay || ' Vinkos. Ganó "' || v_win_label || '".', '/p/' || v.slug);
      end if;

    else
      perform notify_user(r.user_id, 'resolucion', 'No acertaste: ' || left(v.title, 50),
        'Ganó "' || v_win_label || '". La próxima cae.', '/p/' || v.slug);
    end if;
  end loop;
end $$;
revoke execute on function public.porra_settle(uuid, uuid) from public, anon, authenticated;

-- resolve_porra conserva su firma y permisos (creador/árbitro tras el cierre;
-- admin desde /admin incluso antes) y delega el reparto en porra_settle.
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_admin boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if not v_admin
     and v.created_by is distinct from auth.uid()
     and not coalesce(v.arbiter_id = auth.uid() and v.arbiter_status = 'accepted', false) then
    raise exception 'VINKO_NOT_CREATOR';
  end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  if v.closes_at > now() and not v_admin then raise exception 'VINKO_NOT_CLOSED'; end if;
  perform public.porra_settle(p_porra, p_winning);
end $$;
revoke execute on function public.resolve_porra(uuid, uuid) from public, anon;
grant execute on function public.resolve_porra(uuid, uuid) to authenticated;

-- ───────────── RT-07 · propuesta de resultado + 48 h para objetar ───────────
create or replace function public.reto_objection_threshold(p_participants int) returns int
language sql immutable as $$ select greatest(1, ceil(0.30 * greatest(p_participants, 0))::int) $$;
grant execute on function public.reto_objection_threshold(int) to anon, authenticated;

-- El juez propone (solo porras de usuario, tras el cierre). Re-proponer tras un
-- desacuerdo sustituye la propuesta y limpia objeciones/confirmaciones.
create or replace function public.propose_result(p_porra uuid, p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_label text; r record; v_judge_name text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.source <> 'user' then raise exception 'VINKO_NOT_USER_PORRA'; end if;
  if public.porra_judge(v) is distinct from auth.uid() and not public.is_admin() then
    raise exception 'VINKO_NOT_JUDGE';
  end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  if v.closes_at > now() then raise exception 'VINKO_NOT_CLOSED'; end if;
  select label into v_label from porra_options where id = p_option and porra_id = p_porra;
  if v_label is null then raise exception 'VINKO_BAD_OPTION'; end if;

  delete from porra_result_objections where porra_id = p_porra;
  delete from porra_result_confirms where porra_id = p_porra;
  insert into porra_result_proposals (porra_id, option_id, proposed_by, deadline_at)
  values (p_porra, p_option, auth.uid(), now() + interval '48 hours')
  on conflict (porra_id) do update
    set option_id = excluded.option_id, proposed_by = excluded.proposed_by,
        proposed_at = now(), deadline_at = excluded.deadline_at;

  v_judge_name := coalesce(public.profile_name(auth.uid()), 'El juez');
  for r in select distinct k.user_id from picks k
            where k.porra_id = p_porra and k.option_id <> p_option
              and not coalesce(k.is_guest, false) and k.user_id <> auth.uid() loop
    perform notify_social_direct(r.user_id, 'resolucion',
      v_judge_name || ' dice que ganó ' || v_label, '¿Estás de acuerdo? Tienes 48 horas.', '/p/' || v.slug);
  end loop;
end $$;
revoke execute on function public.propose_result(uuid, uuid) from public, anon;
grant execute on function public.propose_result(uuid, uuid) to authenticated;

-- Objetar (solo quien perdería). En 1v1 una objeción basta; en grupo, el 30 %
-- (mínimo 1). Si se alcanza → «Sin acuerdo»: cae la propuesta y se avisa al juez.
create or replace function public.object_result(p_porra uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; pr porra_result_proposals%rowtype; v_n int; v_obj int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found or v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  select * into pr from porra_result_proposals where porra_id = p_porra;
  if not found or pr.deadline_at <= now() then raise exception 'VINKO_NO_PROPOSAL'; end if;
  if not exists (select 1 from picks where porra_id = p_porra and user_id = auth.uid()
                   and option_id <> pr.option_id and not coalesce(is_guest, false)) then
    raise exception 'VINKO_NOT_LOSER';
  end if;
  insert into porra_result_objections (porra_id, user_id) values (p_porra, auth.uid())
  on conflict do nothing;

  select count(*) into v_n from picks where porra_id = p_porra and not coalesce(is_guest, false);
  select count(*) into v_obj from porra_result_objections where porra_id = p_porra;
  if v_obj >= public.reto_objection_threshold(v_n) then
    delete from porra_result_proposals where porra_id = p_porra;
    delete from porra_result_objections where porra_id = p_porra;
    delete from porra_result_confirms where porra_id = p_porra;
    perform notify_social_direct(pr.proposed_by, 'resolucion',
      'Sin acuerdo en: ' || left(v.title, 50),
      'Hay quien no está de acuerdo con el resultado. Propón otra vez o cancela el reto.', '/p/' || v.slug);
  end if;
end $$;
revoke execute on function public.object_result(uuid) from public, anon;
grant execute on function public.object_result(uuid) to authenticated;

-- Confirmar (quien perdería). Si TODOS los que perderían confirman, se liquida ya.
create or replace function public.confirm_result(p_porra uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; pr porra_result_proposals%rowtype; v_losers int; v_conf int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found or v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  select * into pr from porra_result_proposals where porra_id = p_porra;
  if not found or pr.deadline_at <= now() then raise exception 'VINKO_NO_PROPOSAL'; end if;
  if not exists (select 1 from picks where porra_id = p_porra and user_id = auth.uid()
                   and option_id <> pr.option_id and not coalesce(is_guest, false)) then
    raise exception 'VINKO_NOT_LOSER';
  end if;
  insert into porra_result_confirms (porra_id, user_id) values (p_porra, auth.uid())
  on conflict do nothing;

  select count(*) into v_losers from picks
    where porra_id = p_porra and option_id <> pr.option_id and not coalesce(is_guest, false) and user_id <> pr.proposed_by;
  select count(*) into v_conf from porra_result_confirms where porra_id = p_porra;
  if v_conf >= v_losers then
    perform public.porra_settle(p_porra, pr.option_id);
  end if;
end $$;
revoke execute on function public.confirm_result(uuid) from public, anon;
grant execute on function public.confirm_result(uuid) to authenticated;

-- Cron del flujo de resultado: liquida propuestas vencidas, recuerda al juez a
-- las 24 h y cancela con devolución a las 72 h sin resultado.
create or replace function public.cron_result_flow() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v porras%rowtype; k record; pz porras%rowtype;
begin
  -- (a) Propuestas con las 48 h cumplidas y sin desacuerdo → se liquidan.
  for r in select pr.porra_id, pr.option_id from porra_result_proposals pr
            join porras p on p.id = pr.porra_id
           where pr.deadline_at <= now() and p.status = 'open' loop
    perform public.porra_settle(r.porra_id, r.option_id);
  end loop;

  -- (b) Recordatorio al juez a las 24 h del cierre sin propuesta.
  for pz in select * from porras p
           where p.source = 'user' and p.status = 'open'
             and p.closes_at between now() - interval '25 hours' and now() - interval '24 hours'
             and not exists (select 1 from porra_result_proposals pr where pr.porra_id = p.id) loop
    if public.porra_judge(pz) is not null and not exists (
      select 1 from notifications n where n.user_id = public.porra_judge(pz)
        and n.url = '/p/' || pz.slug and n.title like 'Tu reto%' and n.created_at > now() - interval '2 days') then
      perform notify_social_direct(public.porra_judge(pz), 'resolucion',
        'Tu reto «' || left(pz.title, 40) || '» sigue sin resultado',
        'Di quién ha ganado o se cancelará solo.', '/p/' || pz.slug);
    end if;
  end loop;

  -- (c) A las 72 h sin resultado: cancelación automática con devolución.
  for r in select p.* from porras p
           where p.source = 'user' and p.status = 'open'
             and p.closes_at <= now() - interval '72 hours'
             and not exists (select 1 from porra_result_proposals pr where pr.porra_id = p.id) loop
    update porras set status = 'taken_down', void_reason = 'sin resultado del juez (72 h)' where id = r.id;
    for k in select user_id, points_spent from picks where porra_id = r.id and not coalesce(is_guest, false) loop
      if k.points_spent > 0 then
        update profiles set points = points + k.points_spent where id = k.user_id;
      end if;
      perform notify_user(k.user_id, 'resolucion', 'Reto cancelado: ' || left(r.title, 50),
        case when k.points_spent > 0 then 'El juez no puso resultado. Se te devuelven ' || k.points_spent || ' Vinkos.'
             else 'El juez no puso resultado. Nadie paga nada.' end, '/p/' || r.slug);
    end loop;
  end loop;
end $$;
revoke execute on function public.cron_result_flow() from public, anon, authenticated;
do $$ begin perform cron.unschedule('vinko-reto-results'); exception when others then null; end $$;
select cron.schedule('vinko-reto-results', '*/10 * * * *', $$select public.cron_result_flow()$$);

-- Aviso de cierre (RT-05): además de a quien jugó, al JUEZ («Hora de decidir»),
-- con el texto del reto para los participantes.
create or replace function public.cron_closed_pickers() returns void
language plpgsql security definer set search_path = public as $$
declare r porras%rowtype; v_judge uuid; v_judge_name text;
begin
  for r in
    select * from porras po
    where po.status = 'open' and po.closes_at between now() - interval '20 minutes' and now()
  loop
    v_judge := public.porra_judge(r);
    if r.source = 'user' and v_judge is not null and not exists (
      select 1 from notifications n where n.user_id = v_judge
        and n.url = '/p/' || r.slug and n.title like 'Hora de decidir%') then
      perform notify_social_direct(v_judge, 'resolucion',
        'Hora de decidir: ¿qué pasó con «' || left(r.title, 40) || '»?',
        'Elige quién ha ganado. Los demás esperan.', '/p/' || r.slug);
    end if;
    v_judge_name := coalesce(public.profile_name(v_judge), 'El juez');
    perform notify_user(k.user_id, 'evento', 'Cerró: ' || left(r.title, 50),
      case when r.source = 'user' then 'Cerrado. ' || v_judge_name || ' dirá el resultado.'
           else 'Cerrada. Pronto sabrás si acertaste.' end, '/p/' || r.slug)
    from (select distinct user_id from picks
           where porra_id = r.id and not coalesce(is_guest, false) and user_id is distinct from v_judge
             and not exists (select 1 from notifications n where n.user_id = picks.user_id
               and n.url = '/p/' || r.slug and n.title like 'Cerró%' and n.created_at > now() - interval '3 hours')) k;
  end loop;
end $$;
revoke execute on function public.cron_closed_pickers() from public, anon, authenticated;

-- ───────────── RT-06 · invitado → cuenta, sin duplicados ────────────────────
create or replace function public.create_merge_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  delete from guest_merge_tokens where guest_id = auth.uid();
  insert into guest_merge_tokens (guest_id) values (auth.uid()) returning token into v_token;
  return v_token;
end $$;
revoke execute on function public.create_merge_token() from public, anon;
grant execute on function public.create_merge_token() to authenticated;

-- Pasa los picks del invitado a la cuenta real (si no tenía pick en esa porra),
-- copia display_name si falta y borra el perfil invitado (sus picks huérfanos
-- caen en cascada). Nunca bloquea el login: errores → 0 fusiones.
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

  -- Mover el pick y, como en convert_guest (0040), dejar de ser «de invitado»:
  -- en un reto prize pasa a real con coste 0; en una porra de Vinkos abierta se
  -- cobra la entrada si hay saldo (si no, se queda is_guest y no reparte).
  declare mp record; v_entry int := coalesce((cfg('economy') ->> 'pick_min')::int, 10);
  begin
    for mp in select k.porra_id, p.stake_kind, p.status, p.closes_at
                from picks k join porras p on p.id = k.porra_id
               where k.user_id = t.guest_id
                 and not exists (select 1 from picks k2 where k2.porra_id = k.porra_id and k2.user_id = auth.uid()) loop
      if mp.stake_kind = 'prize' then
        update picks set user_id = auth.uid(), is_guest = false
         where porra_id = mp.porra_id and user_id = t.guest_id;
      elsif mp.status = 'open' then
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

-- ───────────── porra_social: invitados con nombre, nunca @invitado_… ────────
create or replace function public.porra_social(p_porra uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'likes', (select count(*) from porra_likes where porra_id = p_porra),
    'liked', (select exists (select 1 from porra_likes where porra_id = p_porra and user_id = auth.uid())),
    'picks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'handle', case when coalesce(pr.is_anonymous, false) then null else pr.handle end,
        'name', case when coalesce(pr.is_anonymous, false)
                     then coalesce(nullif(pr.display_name, ''), 'Invitado')
                     else coalesce(nullif(pr.display_name, ''), pr.handle) end,
        'guest', coalesce(pr.is_anonymous, false),
        'avatar', pr.avatar_url, 'option', o.label, 'idx', o.idx,
        'mine', k.user_id = auth.uid()) order by k.created_at)
      from picks k join profiles pr on pr.id = k.user_id join porra_options o on o.id = k.option_id
      where k.porra_id = p_porra), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('handle', pr.handle, 'avatar', pr.avatar_url, 'body', c.body, 'ts', c.created_at,
        'option', (select o.label from picks k join porra_options o on o.id = k.option_id where k.porra_id = p_porra and k.user_id = c.user_id)) order by c.created_at)
      from porra_comments c join profiles pr on pr.id = c.user_id where c.porra_id = p_porra), '[]'::jsonb),
    'proposal', (
      select jsonb_build_object('option_id', pr.option_id, 'option', o.label,
                                'deadline', pr.deadline_at, 'by', public.profile_name(pr.proposed_by),
                                'mine_objected', exists (select 1 from porra_result_objections ob where ob.porra_id = p_porra and ob.user_id = auth.uid()),
                                'mine_confirmed', exists (select 1 from porra_result_confirms cf where cf.porra_id = p_porra and cf.user_id = auth.uid()))
      from porra_result_proposals pr join porra_options o on o.id = pr.option_id
      where pr.porra_id = p_porra and pr.deadline_at > now())
  );
$$;
grant execute on function public.porra_social(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
