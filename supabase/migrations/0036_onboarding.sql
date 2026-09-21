-- ============================================================================
-- VINKO — 0036: onboarding en 3 pantallas (spec F-08) + avatares generados (D-12)
--  · profiles.interests (text[]) y profiles.onboarded_at.
--  · Regalo de bienvenida: +1 Escudo (streak_shields), UNA sola vez
--    (welcome_gift_at). Los Vinkos de registro siguen viniendo de
--    cfg('economy').signup_pts — aquí no se tocan puntos.
--  · Avatares DiceBear 9.x (semilla = handle): backfill de los perfiles sin
--    avatar y trigger BEFORE INSERT para los nuevos. La URL es idéntica a la
--    de lib/avatar.ts (avatarUrl).
--  · RPC complete_onboarding(p_interests, p_lang) y set_avatar(p_style).
-- Idempotente: se puede ejecutar dos veces sin efecto adicional.
-- ============================================================================

-- ---------- columnas ----------
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists welcome_gift_at timestamptz;

-- ---------- avatares (D-12) ----------
-- Estilos permitidos (los 6 que ofrece el onboarding). 'thumbs' es el de serie.
create or replace function public.avatar_style_ok(p_style text) returns boolean
language sql immutable as $$
  select p_style in ('thumbs','fun-emoji','bottts-neutral','adventurer-neutral','big-smile','pixel-art-neutral')
$$;

-- Misma URL que lib/avatar.ts → avatarUrl(handle, style). El handle ya es
-- ^[a-z0-9_]{3,24}$ (0001), así que no hace falta escaparlo.
create or replace function public.avatar_url_for(p_handle text, p_style text default 'thumbs')
returns text language sql immutable as $$
  select 'https://api.dicebear.com/9.x/'
      || case when public.avatar_style_ok(p_style) then p_style else 'thumbs' end
      || '/svg?seed=' || lower(p_handle)
$$;

-- Backfill: perfiles sin avatar (registro por email; Google trae foto).
update public.profiles
   set avatar_url = public.avatar_url_for(handle, 'thumbs')
 where avatar_url is null or btrim(avatar_url) = '';

-- Nuevos perfiles: si el proveedor no trae foto, avatar generado al nacer.
create or replace function public.profiles_fill_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is null or btrim(new.avatar_url) = '' then
    new.avatar_url := public.avatar_url_for(new.handle, 'thumbs');
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_fill_avatar on public.profiles;
create trigger trg_profiles_fill_avatar before insert on public.profiles
  for each row execute function public.profiles_fill_avatar();

-- El usuario elige uno de los 6 estilos (pantalla 3 del onboarding). Devuelve la URL.
create or replace function public.set_avatar(p_style text) returns text
language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not public.avatar_style_ok(p_style) then raise exception 'VINKO_BAD_STYLE'; end if;
  update profiles
     set avatar_url = public.avatar_url_for(handle, p_style)
   where id = auth.uid()
   returning avatar_url into v_url;
  if v_url is null then raise exception 'VINKO_NO_PROFILE'; end if;
  return v_url;
end $$;
revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

-- ---------- onboarding (F-08) ----------
-- Intereses válidos (pantalla 2). Ordenan el pique del día y las editoriales.
create or replace function public.interest_ok(p text) returns boolean
language sql immutable as $$
  select p in ('futbol','deportes','realities','musica','series','politica','tecnologia','memes','mi_vida')
$$;

-- Guarda intereses (1–5, sin repetidos) e idioma; marca onboarded_at la primera
-- vez y entrega el regalo de bienvenida (+1 Escudo, tope 2) UNA sola vez.
-- Volver a llamarla solo actualiza intereses/idioma. Puntos: no se tocan.
create or replace function public.complete_onboarding(p_interests text[], p_lang text default 'es')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me profiles%rowtype;
  v_int text[];
  v_gift boolean := false;
  v_first boolean := false;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_lang is null or p_lang not in ('es','en') then raise exception 'VINKO_BAD_LANG'; end if;

  -- normaliza: minúsculas, sin nulos, sin repetidos, solo los conocidos
  select coalesce(array_agg(distinct x order by x), '{}')
    into v_int
    from unnest(coalesce(p_interests, '{}')) as u(x)
   where x is not null and public.interest_ok(x);
  if coalesce(array_length(v_int, 1), 0) < 1 then raise exception 'VINKO_NO_INTERESTS'; end if;
  if array_length(v_int, 1) > 5 then raise exception 'VINKO_TOO_MANY_INTERESTS'; end if;

  select * into v_me from profiles where id = auth.uid() for update;
  if not found then raise exception 'VINKO_NO_PROFILE'; end if;

  v_first := v_me.onboarded_at is null;
  v_gift  := v_me.welcome_gift_at is null;

  update profiles
     set interests       = v_int,
         lang            = p_lang,
         onboarded_at    = coalesce(onboarded_at, now()),
         welcome_gift_at = coalesce(welcome_gift_at, now()),
         streak_shields  = case when v_gift then least(streak_shields + 1, 2) else streak_shields end
   where id = auth.uid()
   returning * into v_me;

  return jsonb_build_object(
    'first',        v_first,
    'gift_shield',  v_gift,
    'shields',      v_me.streak_shields,
    'interests',    to_jsonb(v_me.interests),
    'lang',         v_me.lang,
    'onboarded_at', v_me.onboarded_at
  );
end $$;
revoke execute on function public.complete_onboarding(text[], text) from public, anon;
grant execute on function public.complete_onboarding(text[], text) to authenticated;

-- El cliente ya puede escribir birth_year y lang directamente (grant de 0003);
-- interests y onboarded_at SOLO vía RPC (no se amplía el grant de columnas).
