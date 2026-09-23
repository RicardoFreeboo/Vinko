-- 0054_p2p_gate — Kill-switch de las porras con dinero P2P (0048).
-- Decisión de Ricardo (23-sep-2026, confirmación por escrito regla de oro 7):
-- el P2P con dinero (juez humano, vida real) queda CONFIRMADO pero GATEADO —
-- APAGADO por defecto; el admin lo enciende. Resuelve el conflicto con la Money
-- Spec del 22-sep sin borrar nada: se apaga con un flag.

insert into public.remote_config (key, value) values ('p2p', '{"enabled": false}'::jsonb)
  on conflict (key) do nothing;

-- Toggle de admin.
create or replace function public.p2p_set_enabled(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update remote_config set value = jsonb_set(coalesce(value, '{}'::jsonb), '{enabled}', to_jsonb(p_on), true), updated_at = now()
    where key = 'p2p';
  if not found then insert into remote_config (key, value) values ('p2p', jsonb_build_object('enabled', p_on)); end if;
end $$;
revoke execute on function public.p2p_set_enabled(boolean) from public, anon;
grant execute on function public.p2p_set_enabled(boolean) to authenticated;

-- Gate en CREAR (redefine 0053 + check de flag) y UNIRSE (redefine 0048 + flag).
-- Las porras ya en curso pueden resolverse/pagarse; solo se bloquea crear/entrar.
create or replace function public.p2p_pool_create(
  p_group uuid, p_title text, p_options text[], p_stake_minor int,
  p_currency text default 'EUR', p_closes_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_close timestamptz; p profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  if not coalesce((cfg('p2p')->>'enabled')::boolean, false) then raise exception 'VINKO_P2P_OFF'; end if;
  if not public.is_group_member(p_group) then raise exception 'VINKO_P2P_NOT_MEMBER'; end if;
  select * into p from profiles where id = auth.uid();
  if p.birth_year is null or extract(year from now())::int - p.birth_year < 18 then raise exception 'VINKO_P2P_UNDERAGE'; end if;
  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 or array_length(p_options, 1) > 6 then
    raise exception 'VINKO_P2P_BAD_OPTIONS';
  end if;
  if p_stake_minor < 100 or p_stake_minor > 50000 then raise exception 'VINKO_P2P_BAD_STAKE'; end if;
  v_close := coalesce(p_closes_at, now() + interval '1 day');
  if v_close <= now() then raise exception 'VINKO_P2P_BAD_CLOSE'; end if;
  insert into p2p_pools (group_id, title, options, stake_minor, currency, created_by, closes_at)
    values (p_group, left(p_title, 120), p_options, p_stake_minor, upper(p_currency), auth.uid(), v_close)
    returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.p2p_pool_create(uuid, text, text[], int, text, timestamptz) from public, anon;
grant execute on function public.p2p_pool_create(uuid, text, text[], int, text, timestamptz) to authenticated;

create or replace function public.p2p_pool_join(p_pool uuid, p_option_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare v_pool p2p_pools%rowtype; p profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  if not coalesce((cfg('p2p')->>'enabled')::boolean, false) then raise exception 'VINKO_P2P_OFF'; end if;
  select * into v_pool from p2p_pools where id = p_pool;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if not public.is_group_member(v_pool.group_id) then raise exception 'VINKO_P2P_NOT_MEMBER'; end if;
  if v_pool.status <> 'open' or v_pool.closes_at <= now() then raise exception 'VINKO_P2P_CLOSED'; end if;
  if p_option_idx < 0 or p_option_idx >= array_length(v_pool.options, 1) then raise exception 'VINKO_P2P_BAD_OPTION'; end if;
  select * into p from profiles where id = auth.uid();
  if p.birth_year is null or extract(year from now())::int - p.birth_year < 18 then raise exception 'VINKO_P2P_UNDERAGE'; end if;
  insert into p2p_entries (pool_id, user_id, option_idx, pay_handle)
    values (p_pool, auth.uid(), p_option_idx, p.pay_handle)
    on conflict (pool_id, user_id) do update
      set option_idx = excluded.option_idx, pay_handle = coalesce(excluded.pay_handle, p2p_entries.pay_handle);
end $$;
revoke execute on function public.p2p_pool_join(uuid, int) from public, anon;
grant execute on function public.p2p_pool_join(uuid, int) to authenticated;

notify pgrst, 'reload schema';
