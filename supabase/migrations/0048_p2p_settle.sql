-- 0048_p2p_settle — Porras con dinero P2P en grupos privados (SIN custodia).
-- Modelo "porra del bar entre amigos": la entrada es en dinero, pero el dinero
-- va DIRECTO de una persona a otra (Bizum/PayPal). La app solo calcula quién
-- paga a quién y guarda el estado (pendiente/pagado/confirmado): un registro de
-- liquidación estilo Splitwise (CLAUDE.md §3.5), nunca un saldo ni una cuenta.
-- Vinko NO toca fondos y NO cobra del reparto (regla de oro 1 y 4 original).
-- Juez = creador/juez del grupo (permitido aquí: sin custodia ni comisión).
-- Totalmente separado del módulo money_* (vía operador licenciado). Prefijo p2p_.

-- 0) Cómo te pagan los demás: dato de contacto (Bizum/PayPal/…), no una cuenta.
--    Opcional; el usuario lo edita en su perfil. Nunca IBAN/tarjeta completos.
alter table public.profiles add column if not exists pay_handle text
  check (pay_handle is null or char_length(pay_handle) between 3 and 80);
grant update (pay_handle) on public.profiles to authenticated;

do $$ begin create type public.p2p_status as enum ('open','closed','resolved','void');
exception when duplicate_object then null; end $$;
do $$ begin create type public.p2p_settle_status as enum ('pending','paid','confirmed');
exception when duplicate_object then null; end $$;

-- 1) La porra de dinero del grupo -------------------------------------------
create table if not exists public.p2p_pools (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 120),
  options      text[] not null check (array_length(options, 1) between 2 and 6),
  stake_minor  integer not null check (stake_minor between 100 and 50000),  -- entrada por persona (config), no saldo
  currency     char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status       public.p2p_status not null default 'open',
  winning_idx  smallint check (winning_idx is null or winning_idx between 0 and 5),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  closes_at    timestamptz not null,
  resolved_at  timestamptz
);
comment on table public.p2p_pools is 'Porra de dinero entre amigos de un grupo. Entrada fija por persona; el pago va directo entre personas. Vinko no custodia ni cobra.';
create index if not exists p2p_pools_group_idx on public.p2p_pools (group_id, status);

-- 2) Participación: opción elegida + cómo se le paga (copia al entrar) --------
create table if not exists public.p2p_entries (
  pool_id     uuid not null references public.p2p_pools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  option_idx  smallint not null check (option_idx between 0 and 5),
  pay_handle  text,
  created_at  timestamptz not null default now(),
  primary key (pool_id, user_id)
);

-- 3) Liquidación: quién paga a quién. Registro por porra, jamás un saldo. -----
create table if not exists public.p2p_settlements (
  id           uuid primary key default gen_random_uuid(),
  pool_id      uuid not null references public.p2p_pools(id) on delete cascade,
  from_user    uuid not null references public.profiles(id) on delete cascade,  -- paga
  to_user      uuid not null references public.profiles(id) on delete cascade,  -- cobra
  amount_minor integer not null check (amount_minor > 0),  -- de esta liquidación concreta, no un saldo
  currency     char(3) not null,
  status       public.p2p_settle_status not null default 'pending',
  to_handle    text,                                       -- cómo pagar a to_user (copia)
  created_at   timestamptz not null default now(),
  paid_at      timestamptz,
  confirmed_at timestamptz
);
create index if not exists p2p_settlements_pool_idx on public.p2p_settlements (pool_id);
create index if not exists p2p_settlements_from_idx on public.p2p_settlements (from_user, status);
create index if not exists p2p_settlements_to_idx   on public.p2p_settlements (to_user, status);

-- 4) RLS: solo miembros del grupo leen; escritura solo por RPC security definer.
alter table public.p2p_pools       enable row level security;
alter table public.p2p_entries     enable row level security;
alter table public.p2p_settlements enable row level security;

drop policy if exists p2p_pools_read on public.p2p_pools;
create policy p2p_pools_read on public.p2p_pools for select
  using (public.is_group_member(group_id) or public.is_admin());

drop policy if exists p2p_entries_read on public.p2p_entries;
create policy p2p_entries_read on public.p2p_entries for select
  using (exists (select 1 from p2p_pools p where p.id = pool_id
                 and (public.is_group_member(p.group_id) or public.is_admin())));

drop policy if exists p2p_settlements_read on public.p2p_settlements;
create policy p2p_settlements_read on public.p2p_settlements for select
  using (exists (select 1 from p2p_pools p where p.id = pool_id
                 and (public.is_group_member(p.group_id) or public.is_admin())));

revoke all on public.p2p_pools, public.p2p_entries, public.p2p_settlements from anon, authenticated;
grant select on public.p2p_pools, public.p2p_entries, public.p2p_settlements to authenticated;

-- 5) Crear una porra de dinero (cualquier miembro del grupo) ------------------
create or replace function public.p2p_pool_create(
  p_group uuid, p_title text, p_options text[], p_stake_minor int,
  p_currency text default 'EUR', p_closes_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_close timestamptz;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  if not public.is_group_member(p_group) then raise exception 'VINKO_P2P_NOT_MEMBER'; end if;
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

-- 6) Unirse / cambiar de opción (miembro real +18, con la porra abierta) ------
create or replace function public.p2p_pool_join(p_pool uuid, p_option_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare v_pool p2p_pools%rowtype; p profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
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

-- Salirse antes del cierre (no puntúa, no hay dinero movido todavía).
create or replace function public.p2p_pool_leave(p_pool uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pool p2p_pools%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_pool from p2p_pools where id = p_pool;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if v_pool.status <> 'open' or v_pool.closes_at <= now() then raise exception 'VINKO_P2P_CLOSED'; end if;
  delete from p2p_entries where pool_id = p_pool and user_id = auth.uid();
end $$;
revoke execute on function public.p2p_pool_leave(uuid) from public, anon;
grant execute on function public.p2p_pool_leave(uuid) to authenticated;

-- 7) Resolver: el juez del grupo pone el resultado y la app calcula el reparto.
--    Perdedores pagan su entrada; el total se reparte a partes iguales entre
--    los acertantes. Emparejamiento voraz determinista (≤ n-1 transferencias).
--    Sin acertantes o sin perdedores → nadie paga a nadie (todos se quedan lo suyo).
create or replace function public.p2p_pool_resolve(p_pool uuid, p_winning_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool p2p_pools%rowtype; g groups%rowtype; v_judge uuid;
  v_n int; v_w int; v_l int; v_pot bigint; v_base bigint; v_rem int;
  cre_users uuid[]; cre_amt bigint[]; k int; j int;
  d record; owe bigint; m bigint; v_to_handle text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_pool from p2p_pools where id = p_pool for update;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if v_pool.status not in ('open', 'closed') then raise exception 'VINKO_P2P_DONE'; end if;
  select * into g from groups where id = v_pool.group_id;
  v_judge := coalesce(g.judge_id, g.created_by);
  if auth.uid() <> v_judge and not public.is_admin() then raise exception 'VINKO_P2P_NOT_JUDGE'; end if;
  if p_winning_idx < 0 or p_winning_idx >= array_length(v_pool.options, 1) then raise exception 'VINKO_P2P_BAD_OPTION'; end if;

  select count(*) into v_n from p2p_entries where pool_id = p_pool;
  if v_n < 2 then raise exception 'VINKO_P2P_TOO_FEW'; end if;
  select count(*) into v_w from p2p_entries where pool_id = p_pool and option_idx = p_winning_idx;
  v_l := v_n - v_w;

  update p2p_pools set status = 'resolved', winning_idx = p_winning_idx, resolved_at = now() where id = p_pool;
  delete from p2p_settlements where pool_id = p_pool;

  if v_w = 0 or v_l = 0 then return; end if;  -- nadie acertó, o acertaron todos: sin transferencias

  v_pot  := v_l::bigint * v_pool.stake_minor;   -- lo que mueven los perdedores
  v_base := v_pot / v_w;
  v_rem  := (v_pot - v_base * v_w)::int;         -- céntimos sobrantes → a los primeros acertantes

  -- Acreedores (acertantes) ordenados de forma determinista; reparto entero exacto.
  select array_agg(user_id order by user_id) into cre_users
    from p2p_entries where pool_id = p_pool and option_idx = p_winning_idx;
  cre_amt := array[]::bigint[];
  for k in 1 .. v_w loop
    cre_amt := cre_amt || (v_base + case when k <= v_rem then 1 else 0 end);
  end loop;

  j := 1;  -- cursor de acreedor
  for d in (select user_id from p2p_entries where pool_id = p_pool and option_idx <> p_winning_idx order by user_id) loop
    owe := v_pool.stake_minor;
    while owe > 0 loop
      m := least(owe, cre_amt[j]);
      select coalesce(e.pay_handle, pr.pay_handle) into v_to_handle
        from profiles pr left join p2p_entries e on e.pool_id = p_pool and e.user_id = cre_users[j]
        where pr.id = cre_users[j];
      insert into p2p_settlements (pool_id, from_user, to_user, amount_minor, currency, to_handle)
        values (p_pool, d.user_id, cre_users[j], m::int, v_pool.currency, v_to_handle);
      owe := owe - m;
      cre_amt[j] := cre_amt[j] - m;
      if cre_amt[j] = 0 then j := j + 1; end if;
    end loop;
    perform notify_user(d.user_id, 'social',
      'Tienes un pago pendiente en ' || g.name,
      'Ya está el resultado de «' || v_pool.title || '». Mira a quién pagar.',
      '/g/' || g.id);
  end loop;
end $$;
revoke execute on function public.p2p_pool_resolve(uuid, int) from public, anon;
grant execute on function public.p2p_pool_resolve(uuid, int) to authenticated;

-- Anular antes de resolver (juez/creador/admin): sin resultado, sin pagos.
create or replace function public.p2p_pool_void(p_pool uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_pool p2p_pools%rowtype; g groups%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_pool from p2p_pools where id = p_pool for update;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if v_pool.status not in ('open', 'closed') then raise exception 'VINKO_P2P_DONE'; end if;
  select * into g from groups where id = v_pool.group_id;
  if auth.uid() <> coalesce(g.judge_id, g.created_by) and auth.uid() <> v_pool.created_by and not public.is_admin() then
    raise exception 'VINKO_P2P_NOT_JUDGE';
  end if;
  update p2p_pools set status = 'void', resolved_at = now() where id = p_pool;
end $$;
revoke execute on function public.p2p_pool_void(uuid) from public, anon;
grant execute on function public.p2p_pool_void(uuid) to authenticated;

-- 8) Marcar pagado (quien debe) / confirmar recibido (quien cobra) ------------
create or replace function public.p2p_settle_mark_paid(p_settlement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s p2p_settlements%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into s from p2p_settlements where id = p_settlement;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if s.from_user <> auth.uid() then raise exception 'VINKO_P2P_NOT_PAYER'; end if;
  if s.status = 'confirmed' then raise exception 'VINKO_P2P_DONE'; end if;
  update p2p_settlements set status = 'paid', paid_at = now() where id = p_settlement;
  perform notify_user(s.to_user, 'social', 'Te han marcado un pago',
    'Confirma cuando lo recibas.', '/g/' || (select group_id from p2p_pools where id = s.pool_id));
end $$;
revoke execute on function public.p2p_settle_mark_paid(uuid) from public, anon;
grant execute on function public.p2p_settle_mark_paid(uuid) to authenticated;

-- Deshacer "pagado" (quien debe, si se equivocó y aún no está confirmado).
create or replace function public.p2p_settle_unmark(p_settlement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s p2p_settlements%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into s from p2p_settlements where id = p_settlement;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if s.from_user <> auth.uid() then raise exception 'VINKO_P2P_NOT_PAYER'; end if;
  if s.status <> 'paid' then raise exception 'VINKO_P2P_BAD_STATE'; end if;
  update p2p_settlements set status = 'pending', paid_at = null where id = p_settlement;
end $$;
revoke execute on function public.p2p_settle_unmark(uuid) from public, anon;
grant execute on function public.p2p_settle_unmark(uuid) to authenticated;

create or replace function public.p2p_settle_confirm(p_settlement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s p2p_settlements%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into s from p2p_settlements where id = p_settlement;
  if not found then raise exception 'VINKO_P2P_UNKNOWN'; end if;
  if s.to_user <> auth.uid() then raise exception 'VINKO_P2P_NOT_PAYEE'; end if;
  update p2p_settlements set status = 'confirmed', confirmed_at = now(),
    paid_at = coalesce(paid_at, now()) where id = p_settlement;
end $$;
revoke execute on function public.p2p_settle_confirm(uuid) from public, anon;
grant execute on function public.p2p_settle_confirm(uuid) to authenticated;

-- 9) Lectura para la UI (miembro del grupo) ----------------------------------
-- Lista de porras de dinero de un grupo con lo mínimo para las tarjetas.
create or replace function public.p2p_group_list(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (public.is_group_member(p_group) or public.is_admin()) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'options', to_jsonb(p.options),
      'stake_minor', p.stake_minor, 'currency', p.currency, 'status', p.status,
      'winning_idx', p.winning_idx, 'closes_at', p.closes_at,
      'participants', (select count(*) from p2p_entries e where e.pool_id = p.id),
      'my_option', (select e.option_idx from p2p_entries e where e.pool_id = p.id and e.user_id = auth.uid())
    ) order by p.created_at desc) from p2p_pools p where p.group_id = p_group), '[]'::jsonb)
  end;
$$;
revoke execute on function public.p2p_group_list(uuid) from public, anon;
grant execute on function public.p2p_group_list(uuid) to authenticated;

-- Detalle de una porra: participantes, reparto y mi papel.
create or replace function public.p2p_pool_get(p_pool uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_pool p2p_pools%rowtype; g groups%rowtype; v_out jsonb;
begin
  select * into v_pool from p2p_pools where id = p_pool;
  if not found then return null; end if;
  if not (public.is_group_member(v_pool.group_id) or public.is_admin()) then return null; end if;
  select * into g from groups where id = v_pool.group_id;
  select jsonb_build_object(
    'id', v_pool.id, 'group_id', v_pool.group_id, 'group_name', g.name,
    'title', v_pool.title, 'options', to_jsonb(v_pool.options),
    'stake_minor', v_pool.stake_minor, 'currency', v_pool.currency,
    'status', v_pool.status, 'winning_idx', v_pool.winning_idx, 'closes_at', v_pool.closes_at,
    'is_judge', (auth.uid() = coalesce(g.judge_id, g.created_by)) or public.is_admin(),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', e.user_id, 'handle', pr.handle, 'avatar_url', pr.avatar_url,
        'option_idx', e.option_idx, 'is_me', e.user_id = auth.uid())
      order by pr.handle) from p2p_entries e join profiles pr on pr.id = e.user_id where e.pool_id = p_pool), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'from_user', s.from_user, 'from_handle', fp.handle, 'from_avatar', fp.avatar_url,
        'to_user', s.to_user, 'to_handle', tp.handle, 'to_avatar', tp.avatar_url,
        'pay_handle', s.to_handle, 'amount_minor', s.amount_minor, 'currency', s.currency, 'status', s.status,
        'i_pay', s.from_user = auth.uid(), 'i_receive', s.to_user = auth.uid())
      order by fp.handle) from p2p_settlements s
      join profiles fp on fp.id = s.from_user join profiles tp on tp.id = s.to_user
      where s.pool_id = p_pool), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.p2p_pool_get(uuid) from public, anon;
grant execute on function public.p2p_pool_get(uuid) to authenticated;

-- 10) Invariante de dinero (0045 §10): el núcleo no lleva saldos de usuario.
--     Se refuerza para detectar también columnas de importe sobre from_user/to_user,
--     y se documentan las excepciones legítimas: config de entrada (stake) y los
--     registros de liquidación P2P (importe de CADA pago, no un saldo agregado).
create or replace function public.money_schema_invariant() returns table (table_name text, column_name text)
language sql stable security definer set search_path = public as $$
  with tu as (
    select distinct c.table_name::text from information_schema.columns c
    where c.table_schema = 'public' and c.column_name in ('user_id','created_by','profile_id','from_user','to_user')
    union select 'profiles'
  )
  select c.table_name::text, c.column_name::text
  from information_schema.columns c join tu on tu.table_name = c.table_name::text
  where c.table_schema = 'public'
    and (c.column_name ~* '(balance|wallet|iban|^pan$|card_|cents|_minor$|^amount_|_amount$|currency)')
    -- Excepción: configuración de la bolsa del operador licenciado (0045), no dinero de usuario.
    and not (c.table_name = 'money_pools' and c.column_name in ('stake_minor','currency'))
    -- Excepción: P2P de grupo (0048). Entrada fija y registro de liquidación (Splitwise), no saldos.
    and not (c.table_name = 'p2p_pools' and c.column_name in ('stake_minor','currency'))
    and not (c.table_name = 'p2p_settlements' and c.column_name in ('amount_minor','currency'))
$$;
grant execute on function public.money_schema_invariant() to anon, authenticated;

notify pgrst, 'reload schema';
