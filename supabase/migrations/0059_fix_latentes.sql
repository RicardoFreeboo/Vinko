-- ============================================================================
-- 0059 — Tres fallos latentes (auditoría del 3-oct-2026). Idempotente: solo
-- create or replace + grants, se puede re-ejecutar.
--
--   1) safer_play_set_limit (0051). jsonb_set con create_missing solo crea la
--      ÚLTIMA clave de la ruta; como 'limits' no existía nunca, el límite no se
--      guardaba y la pantalla decía «guardado». Ahora se reconstruye el objeto
--      'limits'. Importe 0 = QUITAR el límite de ese periodo (no «0 €»).
--
--   2) profile_public(handle) (tras SEC-01/0055). is_anonymous y deleted_at ya
--      no son legibles, así que /u/[handle] y su imagen OG dejaban ver perfiles
--      de invitados (0040) y de cuentas borradas (0037). La decisión se toma
--      aquí, en el servidor, y solo se devuelven columnas que YA eran públicas
--      (las del grant de 0055): no se expone nada nuevo.
--
--   3) club_apply_event (0046). checkout.session.completed suele llegar DESPUÉS
--      de customer.subscription.* y pisaba plan → 'monthly' y
--      current_period_end / club_until → null (con club_until null el Club no
--      caduca nunca). Ahora: un dato ausente (null) no pisa el guardado; el
--      checkout no cambia el estado de una suscripción ya conocida; y los
--      estados de Stripe que no caben en club_status se mapean en vez de romper
--      el webhook con 22P02. El Club sigue sin tocar la economía de puntos.
-- ============================================================================

-- ─────────────────────── 1) Juego más seguro: límites ───────────────────────
create or replace function public.safer_play_set_limit(p_period text, p_minor int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; v_limits jsonb; v_key text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if p_period not in ('daily', 'weekly', 'monthly') then raise exception 'VINKO_SAFER_BAD_PERIOD'; end if;
  if p_minor is null or p_minor < 0 or p_minor > 1000000000 then raise exception 'VINKO_SAFER_BAD_LIMIT'; end if;
  select coalesce(safer_play, '{}'::jsonb) into v from profiles where id = auth.uid();
  v_key := p_period || '_minor';
  v_limits := case when jsonb_typeof(v->'limits') = 'object' then v->'limits' else '{}'::jsonb end;
  v_limits := case when p_minor = 0 then v_limits - v_key
                   else v_limits || jsonb_build_object(v_key, p_minor) end;
  update profiles set safer_play = v || jsonb_build_object('limits', v_limits)
    where id = auth.uid();
  perform emit_event('limit_changed', auth.uid(), jsonb_build_object('period', p_period));
  return public.safer_play_get();
end $$;
revoke execute on function public.safer_play_set_limit(text, int) from public, anon;
grant execute on function public.safer_play_set_limit(text, int) to authenticated;

-- ─────────────────── 2) Perfil público por handle (/u y OG) ─────────────────
-- null = no existe, es un invitado o es una cuenta borrada (no son personas
-- reales para /u). Solo columnas del grant público de 0055.
create or replace function public.profile_public(p_handle text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'handle', p.handle, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'points', p.points, 'xp', p.xp, 'marcador_total', p.marcador_total, 'division', p.division,
    'title', p.title, 'streak_days', p.streak_days, 'streak_best', p.streak_best, 'created_at', p.created_at)
  from public.profiles p
  where p.handle = p_handle
    and not coalesce(p.is_anonymous, false)
    and p.deleted_at is null
  limit 1
$$;
revoke execute on function public.profile_public(text) from public;
grant execute on function public.profile_public(text) to anon, authenticated;

-- ─────────────────── 3) Club: los eventos no se pisan entre sí ───────────────
create or replace function public.club_apply_event(
  p_event_id text, p_provider text, p_type text, p_payload jsonb,
  p_user uuid, p_sub_id text, p_status text, p_plan text,
  p_period_end timestamptz, p_cancel boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_status       club_status;
  v_keep_status  boolean;
  v_final_status club_status;
  v_final_end    timestamptz;
  v_active       boolean;
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  insert into billing_events (event_id, provider, type, payload) values (p_event_id, p_provider, p_type, p_payload)
    on conflict (event_id) do nothing;
  if not found then return false; end if;   -- duplicado
  if p_user is not null and p_sub_id is not null then
    -- Estados de Stripe → club_status. Los que no caben no rompen el webhook.
    -- unpaid/paused se pueden recuperar pagando → past_due (sin entitlement).
    v_status := (case lower(coalesce(p_status, ''))
      when 'active'             then 'active'
      when 'trialing'           then 'trialing'
      when 'past_due'           then 'past_due'
      when 'unpaid'             then 'past_due'
      when 'paused'             then 'past_due'
      when 'canceled'           then 'canceled'
      when 'incomplete_expired' then 'canceled'
      else 'none'
    end)::club_status;
    -- El checkout solo confirma el alta: si la suscripción ya existe (porque
    -- llegó antes customer.subscription.*), no toca su estado. Sin estado, tampoco.
    v_keep_status := p_status is null or p_type = 'checkout.session.completed';
    insert into club_subscriptions (user_id, provider, external_subscription_id, status, plan, current_period_end, cancel_at_period_end)
      values (p_user, p_provider, p_sub_id, v_status, coalesce(p_plan, 'monthly'), p_period_end, coalesce(p_cancel, false))
      on conflict (provider, external_subscription_id) do update set
        status               = case when v_keep_status then club_subscriptions.status else excluded.status end,
        plan                 = coalesce(p_plan, club_subscriptions.plan),
        current_period_end   = coalesce(p_period_end, club_subscriptions.current_period_end),
        cancel_at_period_end = coalesce(p_cancel, club_subscriptions.cancel_at_period_end),
        updated_at           = now()
      returning club_subscriptions.status, club_subscriptions.current_period_end
        into v_final_status, v_final_end;
    v_active := v_final_status in ('active', 'trialing');
    update profiles set club_active = v_active,
      club_until = case when v_active then coalesce(v_final_end, club_until) else club_until end
      where id = p_user;
  end if;
  update billing_events set processed_at = now() where event_id = p_event_id;
  return true;
end $$;
revoke execute on function public.club_apply_event(text, text, text, jsonb, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
