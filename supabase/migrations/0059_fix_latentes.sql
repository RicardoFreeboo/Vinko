-- ============================================================================
-- 0059 — Fallos latentes (auditoría del 3-oct-2026). Idempotente: solo
-- create or replace + grants, se puede re-ejecutar.
--
--   1) safer_play_set_limit (0051). jsonb_set con create_missing solo crea la
--      ÚLTIMA clave de la ruta; como 'limits' no existía nunca, el límite no se
--      guardaba y la pantalla decía «guardado». Ahora se reconstruye el objeto
--      'limits'. Importe 0 = QUITAR el límite de ese periodo (no «0 €»).
--
--   1b) affiliate_go (0049) no miraba la autoexclusión (§5.11): un usuario
--      autoexcluido podía ir al operador en cuanto se encendiera la afiliación.
--      Ahora la rechaza en el servidor (el slot de la UI también la comprueba).
--
--   2) profile_public(handle) (tras SEC-01/0055). is_anonymous y deleted_at ya
--      no son legibles, así que /u/[handle] y su imagen OG dejaban ver perfiles
--      de invitados (0040) y de cuentas borradas (0037). La decisión se toma
--      aquí, en el servidor, y solo se devuelven columnas que YA eran públicas
--      (las del grant de 0055): no se expone nada nuevo.
--
--   3) club_apply_event (0046). Stripe no garantiza el orden de los eventos:
--      · checkout.session.completed suele llegar DESPUÉS de customer.subscription.*
--        y pisaba plan → 'monthly' y current_period_end / club_until → null.
--        Ahora un dato ausente (null) no pisa el guardado y el checkout no
--        cambia el estado de una suscripción ya conocida.
--      · 'incomplete' (o un estado desconocido) es solo el estado inicial de
--        Stripe: nunca degrada uno ya conocido. 'canceled' es definitivo (una
--        suscripción nueva trae un id nuevo): un evento viejo no la reactiva.
--      · Los estados que no caben en club_status se mapean en vez de romper el
--        webhook con 22P02.
--      · El derecho al Club sale de TODAS las suscripciones del usuario, no solo
--        de la del evento (una baja vieja no apaga una suscripción nueva).
--      · Evento de un usuario que ya no existe (cuenta purgada): se registra con
--        error y se responde OK, en vez de un 500 que Stripe reintenta en bucle.
--      Límite conocido: dos customer.subscription.updated con estados reales
--      (p. ej. past_due y active) que lleguen invertidos entre sí. Arreglarlo
--      exige guardar event.created (columna nueva + webhook); fuera de este parche.
--      El Club sigue sin tocar la economía de puntos.
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

-- ────────────── 1b) Afiliación: la autoexclusión también la apaga ───────────
-- Mismo cuerpo que 0049 + la comprobación de autoexclusión tras el +18.
create or replace function public.affiliate_go(p_operator text, p_country text, p_porra uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_link affiliate_links%rowtype; p profiles%rowtype; v_cc text; v_subid text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  v_cc := upper(coalesce(p_country, ''));
  if v_cc !~ '^[A-Z]{2}$' then raise exception 'VINKO_AFFILIATE_BAD_COUNTRY'; end if;
  -- afiliación habilitada para el país (y sin kill switch global)
  if coalesce((cfg('money')->'global'->>'kill_switch')::boolean, false)
     or not coalesce((cfg('money')->'countries'->v_cc->'affiliate'->>'enabled')::boolean, false) then
    raise exception 'VINKO_AFFILIATE_OFF';
  end if;
  -- +18 declarado (age-gate de la regla de oro 8)
  select * into p from profiles where id = auth.uid();
  if p.birth_year is null or extract(year from now())::int - p.birth_year < 18 then
    raise exception 'VINKO_AFFILIATE_UNDERAGE';
  end if;
  -- autoexclusión vigente (§5.11): nada de enviar al operador
  if nullif(p.safer_play->>'self_excluded_until', '')::timestamptz > now() then
    raise exception 'VINKO_AFFILIATE_SELF_EXCLUDED';
  end if;
  select * into v_link from affiliate_links where country = v_cc and operator = p_operator and enabled;
  if not found then raise exception 'VINKO_AFFILIATE_UNKNOWN'; end if;
  -- subid pseudónimo (no reversible al id en claro) para atribución del operador
  v_subid := substr(md5(auth.uid()::text || ':' || p_operator || ':' || v_cc), 1, 16);
  insert into affiliate_clicks (user_hash, operator, country, porra_id)
    values (substr(md5(auth.uid()::text || ':vinko-affiliate'), 1, 32), p_operator, v_cc, p_porra);
  perform emit_event('affiliate_click', auth.uid(),
    jsonb_build_object('operator', p_operator, 'country', v_cc, 'has_porra', p_porra is not null));
  return replace(v_link.url_template, '{subid}', v_subid);
end $$;
revoke execute on function public.affiliate_go(text, text, uuid) from public, anon;
grant execute on function public.affiliate_go(text, text, uuid) to authenticated;

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

-- ─────────────── 3) Club: eventos de Stripe en cualquier orden ──────────────
create or replace function public.club_apply_event(
  p_event_id text, p_provider text, p_type text, p_payload jsonb,
  p_user uuid, p_sub_id text, p_status text, p_plan text,
  p_period_end timestamptz, p_cancel boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_status      club_status;
  v_keep_status boolean;
  v_active      boolean;
  v_until       timestamptz;
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  insert into billing_events (event_id, provider, type, payload) values (p_event_id, p_provider, p_type, p_payload)
    on conflict (event_id) do nothing;
  if not found then return false; end if;   -- duplicado
  -- Cuenta purgada: se registra y se responde OK (un 500 haría reintentar a Stripe en bucle).
  if p_user is not null and not exists (select 1 from profiles where id = p_user) then
    update billing_events set processed_at = now(), error = 'VINKO_USER_GONE' where event_id = p_event_id;
    return true;
  end if;
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
    -- No cambian el estado de una suscripción YA conocida: el checkout (solo
    -- confirma el alta), un evento sin estado, y 'incomplete'/desconocido (es
    -- el estado inicial de Stripe: si la fila existe, el evento es más viejo).
    v_keep_status := p_status is null or p_type = 'checkout.session.completed' or v_status = 'none';
    insert into club_subscriptions (user_id, provider, external_subscription_id, status, plan, current_period_end, cancel_at_period_end)
      values (p_user, p_provider, p_sub_id, v_status, coalesce(p_plan, 'monthly'), p_period_end, coalesce(p_cancel, false))
      on conflict (provider, external_subscription_id) do update set
        -- 'canceled' es definitivo en Stripe: un evento viejo no la reactiva.
        status               = case when v_keep_status or club_subscriptions.status = 'canceled'
                                    then club_subscriptions.status else excluded.status end,
        plan                 = coalesce(p_plan, club_subscriptions.plan),
        current_period_end   = coalesce(p_period_end, club_subscriptions.current_period_end),
        cancel_at_period_end = coalesce(p_cancel, club_subscriptions.cancel_at_period_end),
        updated_at           = now();
  end if;
  if p_user is not null then
    -- Derecho al Club = CUALQUIER suscripción viva del usuario, no solo la del evento.
    select coalesce(bool_or(cs.status in ('active', 'trialing')), false),
           max(cs.current_period_end) filter (where cs.status in ('active', 'trialing'))
      into v_active, v_until
      from club_subscriptions cs where cs.user_id = p_user;
    update profiles set club_active = v_active,
      club_until = case when v_active then coalesce(v_until, club_until) else club_until end
      where id = p_user;
  end if;
  update billing_events set processed_at = now() where event_id = p_event_id;
  return true;
end $$;
revoke execute on function public.club_apply_event(text, text, text, jsonb, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
