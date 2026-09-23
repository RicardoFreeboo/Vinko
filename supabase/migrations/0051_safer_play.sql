-- 0051_safer_play — Juego más seguro (diseño §5.11 / RD 176/2023; §8 del acuerdo
-- Luckia, Fase 0). Controles y mensajería configurables. La autoexclusión y los
-- límites de depósito del usuario se guardan como PREFERENCIAS (jsonb en el
-- perfil), nunca como saldos ni custodia. Gatean la UI de dinero (Fase 0).
-- Los parámetros productivos definitivos los valida el operador antes de activar.

alter table public.profiles add column if not exists safer_play jsonb not null default '{}'::jsonb;

-- Lectura del estado propio (autoexclusión + límites).
create or replace function public.safer_play_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_until timestamptz;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select safer_play into v from profiles where id = auth.uid();
  v := coalesce(v, '{}'::jsonb);
  v_until := nullif(v->>'self_excluded_until', '')::timestamptz;
  return jsonb_build_object(
    'self_excluded_until', v->>'self_excluded_until',
    'is_excluded', v_until is not null and v_until > now(),
    'limits', coalesce(v->'limits', '{}'::jsonb)
  );
end $$;
revoke execute on function public.safer_play_get() from public, anon;
grant execute on function public.safer_play_get() to authenticated;

-- Autoexclusión temporal (RGIAJ/operador la aplican de verdad en producción;
-- aquí es la preferencia del usuario que apaga su UI de dinero). Solo se puede
-- EXTENDER, nunca acortar antes de que venza (protección del usuario).
create or replace function public.safer_play_self_exclude(p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_prev timestamptz; v_new timestamptz;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_days not in (30, 90, 180, 365) then raise exception 'VINKO_SAFER_BAD_PERIOD'; end if;
  select coalesce(safer_play, '{}'::jsonb) into v from profiles where id = auth.uid();
  v_prev := nullif(v->>'self_excluded_until', '')::timestamptz;
  v_new := now() + make_interval(days => p_days);
  if v_prev is not null and v_prev > v_new then v_new := v_prev; end if; -- no acortar
  update profiles set safer_play = v || jsonb_build_object('self_excluded_until', to_char(v_new, 'YYYY-MM-DD"T"HH24:MI:SSOF'))
    where id = auth.uid();
  perform emit_event('self_exclusion_activated', auth.uid(), jsonb_build_object('days', p_days));
  return public.safer_play_get();
end $$;
revoke execute on function public.safer_play_self_exclude(int) from public, anon;
grant execute on function public.safer_play_self_exclude(int) to authenticated;

-- Fijar un límite de depósito (por periodo). Bajarlo es inmediato; subirlo o
-- quitarlo, en producción, tarda (RD 176/2023): aquí se guarda la preferencia.
create or replace function public.safer_play_set_limit(p_period text, p_minor int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_period not in ('daily', 'weekly', 'monthly') then raise exception 'VINKO_SAFER_BAD_PERIOD'; end if;
  if p_minor is null or p_minor < 0 or p_minor > 1000000000 then raise exception 'VINKO_SAFER_BAD_LIMIT'; end if;
  select coalesce(safer_play, '{}'::jsonb) into v from profiles where id = auth.uid();
  update profiles set safer_play =
    jsonb_set(v, array['limits', p_period || '_minor'], to_jsonb(p_minor), true)
    where id = auth.uid();
  perform emit_event('limit_changed', auth.uid(), jsonb_build_object('period', p_period));
  return public.safer_play_get();
end $$;
revoke execute on function public.safer_play_set_limit(text, int) from public, anon;
grant execute on function public.safer_play_set_limit(text, int) to authenticated;

notify pgrst, 'reload schema';
