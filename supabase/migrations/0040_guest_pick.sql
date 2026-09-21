-- ============================================================================
-- VINKO — 0040: pronóstico invitado y registro diferido (spec F-01)
--
-- Cualquiera pronostica en /p/[slug] sin cuenta: el navegador abre una sesión
-- ANÓNIMA de Supabase (auth.signInAnonymously; el JWT lleva is_anonymous=true y
-- usa el rol `authenticated`) y el pick se guarda contra ese usuario con
-- is_guest=true y 0 Vinkos. Cuenta en el termómetro (porra_tallies), no en la
-- clasificación ni en el reparto. Al convertir la cuenta (linkIdentity con
-- Google → mismo auth.users.id, is_anonymous pasa a false) convert_guest()
-- cobra la entrada de cada pick invitado en porras aún abiertas y lo activa.
--
--  · picks.is_guest            pick sin entrada, fuera del reparto
--  · profiles.is_anonymous     espejo de auth.users.is_anonymous
--  · profiles.guest_expires_at created_at + 30 días: los perfiles invitados sin
--                              convertir se identifican desde /admin; aquí NO
--                              hay purga automática (decisión de Ricardo).
--  · make_guest_pick(porra, opción)  solo JWT anónimo; 1 pick por porra; 0 Vinkos,
--                              0 XP, sin racha, sin loop del creador.
--  · convert_guest()           solo JWT NO anónimo; activa el perfil y cobra.
--  · handle_new_guest          trigger en auth.users que nace ANTES que
--                              handle_new_user (orden alfabético) y deja el
--                              perfil invitado con 0 puntos y handle invitado_…
--
-- Lo que NO hace (v1): picks invitados en porras ya resueltas no cobran ni
-- puntúan retroactivamente (se quedan is_guest=true). resolve_porra y
-- porra_ranking deben ignorar is_guest (se redefinen en otra migración).
-- Idempotente: se puede aplicar dos veces sin efecto adicional.
-- ============================================================================

-- ---------- columnas ----------
alter table public.picks    add column if not exists is_guest boolean not null default false;
alter table public.profiles add column if not exists is_anonymous boolean not null default false;
alter table public.profiles add column if not exists guest_expires_at timestamptz;

-- picks.points_spent: 0001 lo fijaba en 10 con un check; desde 0026 el importe
-- es variable y el pick invitado pone 0. Se deja un check >= 0 (idempotente).
alter table public.picks drop constraint if exists picks_points_spent_check;
alter table public.picks drop constraint if exists picks_points_spent_nonneg;
alter table public.picks add constraint picks_points_spent_nonneg check (points_spent >= 0);

create index if not exists picks_guest_user_idx on public.picks (user_id) where is_guest;
create index if not exists profiles_guest_expires_idx on public.profiles (guest_expires_at) where is_anonymous;

-- ---------- ¿la sesión actual es anónima? ----------
-- Lee el claim del JWT (no la tabla): así un perfil mal marcado no abre puertas.
create or replace function public.jwt_is_anonymous() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
revoke execute on function public.jwt_is_anonymous() from public;
grant execute on function public.jwt_is_anonymous() to anon, authenticated;

-- ---------- handle del invitado ----------
-- El check de handle (0001) es ^[a-z0-9_]{3,24}$: sin guion → invitado_ + 6 hex
-- del md5 del id (determinista); si chocara, 12 hex.
create or replace function public.guest_handle(p_uid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v6 text := 'invitado_' || left(md5(p_uid::text), 6);
begin
  if not exists (select 1 from profiles where handle = v6) then return v6; end if;
  return 'invitado_' || left(md5(p_uid::text), 12);
end $$;
revoke execute on function public.guest_handle(uuid) from public, anon, authenticated;

-- ---------- handle real al convertir (misma regla que handle_new_user, 0002) ----------
create or replace function public.guest_handle_from_email(p_email text, p_uid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare base text; cand text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(split_part(p_email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 20);
  cand := base;
  while exists (select 1 from profiles where handle = cand and id <> p_uid) loop
    n := n + 1;
    cand := base || (floor(random() * 9000) + 1000)::int::text;
    if n > 20 then cand := left('user' || replace(gen_random_uuid()::text, '-', ''), 24); end if;
  end loop;
  return cand;
end $$;
revoke execute on function public.guest_handle_from_email(text, uuid) from public, anon, authenticated;

-- ---------- perfil invitado al nacer el usuario anónimo ----------
-- Trigger en auth.users con nombre que ordena ANTES que trg_alpha_new_user
-- ('0' < 'a'): inserta el perfil con 0 puntos, is_anonymous=true y caducidad;
-- el `on conflict do nothing` de handle_new_user ya no hace nada. to_jsonb(new)
-- evita depender de que exista la columna is_anonymous en auth antiguos.
-- Nunca lanza: un fallo aquí bloquearía TODAS las altas.
create or replace function public.handle_new_guest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false) then
      insert into profiles (id, handle, points, is_anonymous, guest_expires_at)
      values (new.id, public.guest_handle(new.id), 0, true, now() + interval '30 days')
      on conflict (id) do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function public.handle_new_guest() from public, anon, authenticated;
drop trigger if exists trg_0040_new_guest on auth.users;
create trigger trg_0040_new_guest after insert on auth.users
  for each row execute function public.handle_new_guest();

-- ---------- make_guest_pick ----------
-- Solo con JWT anónimo. Porra abierta, no plantilla, antes del cierre. Un pick
-- por (porra, usuario) — lo garantiza la PK de picks. 0 Vinkos, 0 XP, sin
-- racha, sin loop del creador y sin invitación: nada de eso hasta convertir.
create or replace function public.make_guest_pick(p_porra uuid, p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;

  -- Perfil invitado si el trigger no lo creó (0 puntos, handle invitado_…).
  insert into profiles (id, handle, points, is_anonymous, guest_expires_at)
  values (v_uid, public.guest_handle(v_uid), 0, true, now() + interval '30 days')
  on conflict (id) do nothing;
  -- Si lo creó handle_new_user (sin marca y con el regalo de alta por defecto),
  -- se marca ahora y se deja a 0: el regalo llega al convertir.
  update profiles
     set is_anonymous = true,
         points = 0,
         guest_expires_at = coalesce(guest_expires_at, created_at + interval '30 days')
   where id = v_uid and not is_anonymous;

  insert into picks (porra_id, user_id, option_id, points_spent, is_guest)
  values (p_porra, v_uid, p_option, 0, true);
  -- la PK (porra_id, user_id) hace que el segundo intento falle: el pick no se cambia
end $$;
revoke execute on function public.make_guest_pick(uuid, uuid) from public, anon;
grant execute on function public.make_guest_pick(uuid, uuid) to authenticated;

-- ---------- convert_guest ----------
-- La llama /auth/callback tras entrar (nunca bloquea el login). Solo con JWT
-- NO anónimo. Si el perfil era invitado:
--   1. is_anonymous=false, sin caducidad; handle desde el email y foto del
--      proveedor (como haría handle_new_user en un alta normal); regalo de alta
--      (cfg economy.signup_pts, 1000 por defecto) porque nació con 0.
--   2. Cada pick invitado en porra con status='open' (incluidas las cerradas
--      que esperan al juez: el pick se hizo antes del cierre) cobra la entrada
--      (cfg economy.pick_min, 10 por defecto) SOLO si hay saldo; queda
--      is_guest=false y points_spent=entrada. Sin saldo → sigue is_guest=true y
--      jamás cobra reparto. Nunca deja saldo negativo.
--   3. Picks invitados en porras ya resueltas: se quedan is_guest=true. Sin
--      pago retroactivo en v1 (spec F-01 lo pide <48 h; decisión pendiente).
--   4. Si cobró al menos un pick, es su "primer pick": paga la invitación
--      (pay_referral es idempotente; claim_referral corre antes en el callback).
-- Devuelve {converted, charged, pending, handle}.
create or replace function public.convert_guest() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_me      profiles%rowtype;
  v_eco     jsonb := cfg('economy');
  v_entry   int := coalesce((v_eco ->> 'pick_min')::int, 10);
  v_signup  int := coalesce((v_eco ->> 'signup_pts')::int, 1000);
  v_email   text; v_meta jsonb; v_provider text; v_photo text;
  v_handle  text;
  r         record;
  n_charged int := 0;
  n_left    int := 0;
  v_was_guest boolean := false;
begin
  if v_uid is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_STILL_GUEST'; end if;

  select * into v_me from profiles where id = v_uid for update;
  if not found then return jsonb_build_object('converted', false, 'reason', 'no_profile'); end if;

  if v_me.is_anonymous then
    v_was_guest := true;
    select u.email, u.raw_user_meta_data, u.raw_app_meta_data ->> 'provider'
      into v_email, v_meta, v_provider
      from auth.users u where u.id = v_uid;
    v_photo  := coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture');
    v_handle := v_me.handle;
    if v_me.handle like 'invitado\_%' then
      v_handle := public.guest_handle_from_email(v_email, v_uid);
    end if;

    update profiles
       set is_anonymous     = false,
           guest_expires_at = null,
           handle           = v_handle,
           avatar_url       = case
                                when v_photo is not null then v_photo
                                when v_handle <> v_me.handle then public.avatar_url_for(v_handle, 'thumbs')
                                else avatar_url
                              end,
           points           = points + v_signup
     where id = v_uid;
  end if;

  -- 2. Cobrar la entrada de los picks invitados en porras abiertas.
  for r in
    select k.porra_id
      from picks k join porras p on p.id = k.porra_id
     where k.user_id = v_uid and k.is_guest and p.status = 'open' and not p.is_template
     order by k.created_at
  loop
    update profiles set points = points - v_entry where id = v_uid and points >= v_entry;
    if found then
      update picks set is_guest = false, points_spent = v_entry
       where porra_id = r.porra_id and user_id = v_uid;
      n_charged := n_charged + 1;
    else
      n_left := n_left + 1;
    end if;
  end loop;

  -- 4. Invitación validada con el primer pick que cuenta (idempotente).
  if n_charged > 0 then
    begin
      perform public.pay_referral(v_uid);
    exception when others then null;
    end;
  end if;

  -- Evento de servidor (0038). Si emit_event no existe o falla, no pasa nada.
  if v_was_guest then
    begin
      perform public.emit_event('signup_completed', v_uid, jsonb_build_object(
        'method', coalesce(v_provider, 'unknown'), 'lang', v_me.lang,
        'ref', v_me.referred_by is not null, 'from_guest', true,
        'guest_picks_charged', n_charged, 'guest_picks_pending', n_left));
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'converted', v_was_guest,
    'charged',   n_charged,
    'pending',   n_left,
    'handle',    coalesce(v_handle, v_me.handle)
  );
end $$;
revoke execute on function public.convert_guest() from public, anon;
grant execute on function public.convert_guest() to authenticated;

-- ---------- lo que un invitado NO puede hacer ----------
-- El JWT anónimo usa el rol `authenticated`, así que las policies de 0003 le
-- dejarían crear porras. Policy RESTRICTIVA (se suma a las existentes): sin
-- registro no se crean porras. Las opciones dependen de una porra propia, así
-- que quedan cubiertas. Otros RPC (grupos, comentarios, likes, compartir…)
-- deben comprobar public.jwt_is_anonymous() en su propia migración.
drop policy if exists porras_no_guest_insert on public.porras;
create policy porras_no_guest_insert on public.porras
  as restrictive for insert
  with check (not public.jwt_is_anonymous());

comment on column public.picks.is_guest is
  'Pick de sesión anónima (F-01): 0 Vinkos, cuenta en el termómetro, fuera del reparto y la clasificación hasta convert_guest().';
comment on column public.profiles.is_anonymous is
  'Espejo de auth.users.is_anonymous: perfil invitado (handle invitado_…, 0 puntos) hasta convert_guest().';
comment on column public.profiles.guest_expires_at is
  'Perfil invitado: created_at + 30 días. Pasada la fecha sin convertir, candidato a purga MANUAL desde /admin (sin cron en 0040).';
