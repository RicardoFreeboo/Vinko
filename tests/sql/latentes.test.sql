-- ============================================================================
-- Tests SQL de 0059 (lo que SOBREVIVE en modo solo-puntos): límites de Juego
-- más seguro (§2.9) y profile_public (/u y OG tras SEC-01). Las secciones de
-- affiliate_go y club_apply_event se retiraron: 0060 elimina esas RPCs (dinero).
-- Corre con los stubs de tests/sql/run.sh (test.uid / test.jwt).
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
  u uuid; g uuid; d uuid;
  v jsonb;
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
end $$;
