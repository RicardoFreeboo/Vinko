-- ============================================================================
-- Tests SQL de 0059 (fallos latentes del 3-oct-2026): límites de Juego más
-- seguro, profile_public (/u y OG tras SEC-01) y club_apply_event (Stripe fuera
-- de orden). Corre con los stubs de tests/sql/run.sh (test.uid / test.jwt).
-- ============================================================================
\set ON_ERROR_STOP on

-- Mismo helper que reto.test.sql, redefinido aquí para no depender del orden.
create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', coalesce(p_uid::text, ''), false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  u uuid; u2 uuid; g uuid; d uuid;
  v jsonb; r boolean; s record;
  h_u text; h_g text; h_d text;
begin
  -- ── 1) safer_play_set_limit guarda, acumula y quita ─────────────────────────
  insert into auth.users (email) values ('lat.uno@test.dev') returning id into u;
  perform test_as(u);
  v := safer_play_set_limit('daily', 2000);
  if (v->'limits'->>'daily_minor')::int is distinct from 2000 then
    raise exception '1: no guardó el límite diario: %', v;
  end if;
  v := safer_play_set_limit('weekly', 5000);
  if (v->'limits'->>'daily_minor')::int is distinct from 2000 or (v->'limits'->>'weekly_minor')::int is distinct from 5000 then
    raise exception '1: el segundo límite borró el primero: %', v;
  end if;
  v := safer_play_set_limit('daily', 0);
  if (v->'limits') ? 'daily_minor' then raise exception '1: importe 0 debe quitar el límite: %', v; end if;
  if (v->'limits'->>'weekly_minor')::int is distinct from 5000 then raise exception '1: quitar uno no debe tocar otro: %', v; end if;
  v := safer_play_self_exclude(30);
  if not (v->>'is_excluded')::boolean or (v->'limits'->>'weekly_minor')::int is distinct from 5000 then
    raise exception '1: autoexclusión y límites deben convivir: %', v;
  end if;
  raise notice 'OK 0059.1 safer_play_set_limit: guarda, acumula, 0 quita, convive con la autoexclusión';

  -- ── 2) profile_public: reales sí; invitados y borrados no; nada privado ─────
  perform test_as(null);
  select handle into h_u from profiles where id = u;
  v := profile_public(h_u);
  if v is null or v->>'id' is distinct from u::text then raise exception '2: el perfil real debe verse: %', v; end if;
  if v ?| array['birth_year', 'country', 'is_anonymous', 'deleted_at', 'safer_play', 'role', 'referred_by', 'pay_handle'] then
    raise exception '2: profile_public expone columnas privadas: %', v;
  end if;
  insert into auth.users (email, is_anonymous) values (null, true) returning id into g;
  select handle into h_g from profiles where id = g;
  if h_g is null then raise exception '2: el trigger no creó el perfil del invitado'; end if;
  if profile_public(h_g) is not null then raise exception '2: un invitado no debe verse en /u'; end if;
  insert into auth.users (email) values ('lat.borrado@test.dev') returning id into d;
  update profiles set deleted_at = now() where id = d;
  select handle into h_d from profiles where id = d;
  if profile_public(h_d) is not null then raise exception '2: una cuenta borrada no debe verse en /u'; end if;
  if profile_public('no_existe_xyz_0059') is not null then raise exception '2: un handle inexistente devuelve null'; end if;
  if not has_function_privilege('anon', 'public.profile_public(text)', 'execute') then
    raise exception '2: anon debe poder llamar a profile_public (OG sin sesión)';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'is_anonymous', 'select') then
    raise exception '2: is_anonymous no debía ser legible (SEC-01)';
  end if;
  raise notice 'OK 0059.2 profile_public: reales sí, invitados/borrados no, sin columnas privadas';

  -- ── 3) club_apply_event: eventos de Stripe fuera de orden ───────────────────
  perform test_as(null); -- service role: auth.uid() nulo
  -- a) llega primero la suscripción (anual, con fecha)…
  r := club_apply_event('lat_evt_1', 'stripe', 'customer.subscription.created', '{}'::jsonb,
         u, 'lat_sub_1', 'active', 'annual', now() + interval '365 days', false);
  if not r then raise exception '3a: el primer evento debía aplicarse'; end if;
  -- b) …y DESPUÉS el checkout, sin plan ni fechas: no debe pisar nada
  r := club_apply_event('lat_evt_2', 'stripe', 'checkout.session.completed', '{}'::jsonb,
         u, 'lat_sub_1', 'active', null, null, null);
  select * into s from club_subscriptions where provider = 'stripe' and external_subscription_id = 'lat_sub_1';
  if s.plan is distinct from 'annual' then raise exception '3b: el checkout pisó el plan: %', s.plan; end if;
  if s.current_period_end is null then raise exception '3b: el checkout borró current_period_end'; end if;
  if (select club_until from profiles where id = u) is null then raise exception '3b: club_until quedó a null'; end if;
  if not (select club_active from profiles where id = u) then raise exception '3b: el Club debía seguir activo'; end if;
  -- c) baja y luego un checkout tardío: no reactiva
  r := club_apply_event('lat_evt_3', 'stripe', 'customer.subscription.deleted', '{}'::jsonb,
         u, 'lat_sub_1', 'canceled', 'annual', null, false);
  r := club_apply_event('lat_evt_4', 'stripe', 'checkout.session.completed', '{}'::jsonb,
         u, 'lat_sub_1', 'active', null, null, null);
  if (select status::text from club_subscriptions where external_subscription_id = 'lat_sub_1') <> 'canceled' then
    raise exception '3c: un checkout tardío reactivó una suscripción cancelada';
  end if;
  if (select club_active from profiles where id = u) then raise exception '3c: el Club debía quedar inactivo'; end if;
  -- d) estados de Stripe fuera del enum: se mapean, no rompen
  r := club_apply_event('lat_evt_5', 'stripe', 'customer.subscription.updated', '{}'::jsonb,
         u, 'lat_sub_2', 'incomplete_expired', null, null, null);
  if (select status::text from club_subscriptions where external_subscription_id = 'lat_sub_2') <> 'canceled' then
    raise exception '3d: incomplete_expired debe quedar canceled';
  end if;
  r := club_apply_event('lat_evt_6', 'stripe', 'customer.subscription.updated', '{}'::jsonb,
         u, 'lat_sub_2', 'unpaid', null, null, null);
  if (select status::text from club_subscriptions where external_subscription_id = 'lat_sub_2') <> 'past_due' then
    raise exception '3d: unpaid debe quedar past_due';
  end if;
  -- e) idempotencia por event_id
  if club_apply_event('lat_evt_6', 'stripe', 'customer.subscription.updated', '{}'::jsonb,
       u, 'lat_sub_2', 'unpaid', null, null, null) then
    raise exception '3e: un event_id repetido debe devolver false';
  end if;
  -- f) checkout como PRIMER evento sigue activando al momento; luego se completa
  insert into auth.users (email) values ('lat.club2@test.dev') returning id into u2;
  r := club_apply_event('lat_evt_7', 'stripe', 'checkout.session.completed', '{}'::jsonb,
         u2, 'lat_sub_3', 'active', null, null, null);
  if not (select club_active from profiles where id = u2) then raise exception '3f: el checkout como primer evento debe activar'; end if;
  r := club_apply_event('lat_evt_8', 'stripe', 'customer.subscription.created', '{}'::jsonb,
         u2, 'lat_sub_3', 'active', 'annual', now() + interval '365 days', false);
  if (select plan from club_subscriptions where external_subscription_id = 'lat_sub_3') is distinct from 'annual' then
    raise exception '3f: la suscripción debe completar el plan';
  end if;
  if (select club_until from profiles where id = u2) is null then raise exception '3f: club_until debe quedar fijado'; end if;
  -- g) solo service role
  perform test_as(u);
  begin
    perform club_apply_event('lat_evt_9', 'stripe', 'x', '{}'::jsonb, u, 'lat_sub_9', 'active', null, null, null);
    raise exception '3g: un usuario no debe poder aplicar eventos';
  exception when others then
    if sqlerrm not like '%VINKO_SERVICE_ONLY%' then raise; end if;
  end;
  raise notice 'OK 0059.3 club_apply_event: no pisa plan/fechas, checkout tardío no reactiva, estados mapeados, idempotente';
end $$;
