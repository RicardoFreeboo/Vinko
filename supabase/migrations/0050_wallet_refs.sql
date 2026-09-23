-- 0050_wallet_refs — Motor de dinero (fase 2): cuentas y ESPEJO de ledger.
-- La custodia y el ledger de doble entrada AUTORITATIVO viven en el proveedor
-- licenciado. El núcleo guarda REFERENCIAS: la cuenta externa del usuario y un
-- espejo de solo lectura de los apuntes que el proveedor CONFIRMA por webhook
-- (para pintar movimientos). Nunca es dueño del dinero ni lo mueve (regla oro 1).
-- El saldo que se muestra es el que confirma el proveedor; el núcleo no lo calcula
-- como fuente de verdad. Todo apagado: sin proveedor no hay filas.
-- Separado del P2P (0048): esto es la vía operador licenciado (partner/own).

do $$ begin create type public.ledger_kind as enum ('deposit','withdraw','stake_hold','stake_release','payout','refund','rake');
exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_status as enum ('pending','completed','failed','reversed','in_review');
exception when duplicate_object then null; end $$;

-- 1) Cuenta del usuario en el proveedor (referencia, no un saldo) ------------
create table if not exists public.money_accounts (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  provider            text not null check (provider ~ '^(mock|partner_[a-z0-9_]+|vinko_money)$'),
  external_account_id text not null,
  currency            char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  country             char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  kyc_level           smallint not null default 0 check (kyc_level between 0 and 3),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.money_accounts is 'Referencia a la cuenta del usuario en el proveedor licenciado. Sin saldo: el dinero lo custodia el proveedor.';

-- 2) Espejo de ledger: apuntes que CONFIRMA el proveedor (solo lectura) -------
create table if not exists public.money_ledger_refs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  provider     text not null,
  external_ref text not null unique,                 -- id del apunte en el proveedor (idempotencia)
  kind         public.ledger_kind not null,
  amount_minor integer not null default 0 check (amount_minor >= 0),  -- importe del apunte que reporta el proveedor, no un saldo
  currency     char(3) not null default 'EUR',
  status       public.ledger_status not null default 'pending',
  porra_ref    text,                                 -- external_pool_id si el apunte es de una bolsa
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.money_ledger_refs is 'Espejo de solo lectura del ledger del proveedor (para mostrar movimientos). La fuente de verdad y la custodia están en el proveedor.';
create index if not exists money_ledger_user_idx on public.money_ledger_refs (user_id, created_at desc);

alter table public.money_accounts     enable row level security;
alter table public.money_ledger_refs  enable row level security;
drop policy if exists money_accounts_own on public.money_accounts;
create policy money_accounts_own on public.money_accounts for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists money_ledger_own on public.money_ledger_refs;
create policy money_ledger_own on public.money_ledger_refs for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.money_accounts, public.money_ledger_refs from anon, authenticated;
grant select on public.money_accounts, public.money_ledger_refs to authenticated;

-- 3) Aplicar un webhook de wallet/escrow YA verificado (firma HMAC en la Edge
-- Function). Servicio (service role) únicamente. Idempotente por event_id
-- (reutiliza money_events) y por external_ref (upsert del apunte). ------------
create or replace function public.money_ledger_apply(p_event_id text, p_provider text, p_type text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_ref text; v_kind public.ledger_kind; v_status public.ledger_status; v_amt int; v_cur text;
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  insert into money_events (event_id, provider, type, payload) values (p_event_id, p_provider, p_type, p_payload)
    on conflict (event_id) do nothing;
  if not found then return false; end if;

  if p_type = 'account.created' then
    v_user := (p_payload->>'user_id')::uuid;
    if v_user is null then raise exception 'VINKO_WALLET_NO_USER'; end if;
    insert into money_accounts (user_id, provider, external_account_id, currency, country, kyc_level)
      values (v_user, p_provider, coalesce(p_payload->>'external_account_id', p_provider || ':' || v_user),
              coalesce(nullif(p_payload->>'currency',''),'EUR'), nullif(p_payload->>'country',''),
              coalesce((p_payload->>'kyc_level')::int, 0))
      on conflict (user_id) do update set external_account_id = excluded.external_account_id,
        kyc_level = excluded.kyc_level, updated_at = now();

  elsif p_type like 'wallet.%' or p_type like 'escrow.%' then
    v_ref := p_payload->>'ledger_ref';
    if v_ref is null then raise exception 'VINKO_WALLET_NO_REF'; end if;
    select user_id into v_user from money_accounts where external_account_id = p_payload->>'external_account_id';
    v_kind := coalesce(nullif(p_payload->>'kind','')::public.ledger_kind, case
      when p_type like 'wallet.deposit%'  then 'deposit'
      when p_type like 'wallet.withdraw%' then 'withdraw'
      when p_type = 'escrow.held'         then 'stake_hold'
      when p_type = 'escrow.released'     then 'stake_release'
      when p_type = 'escrow.payout'       then 'payout'
      when p_type = 'escrow.refunded'     then 'refund'
      else 'deposit' end);
    v_status := case
      when p_type like '%.completed' or p_type in ('escrow.held','escrow.released','escrow.payout','escrow.refunded') then 'completed'
      when p_type like '%.failed' then 'failed'
      else 'pending' end;
    v_amt := coalesce((p_payload->>'amount_minor')::int, 0);
    v_cur := upper(coalesce(nullif(p_payload->>'currency',''),'EUR'));
    insert into money_ledger_refs (user_id, provider, external_ref, kind, amount_minor, currency, status, porra_ref)
      values (v_user, p_provider, v_ref, v_kind, greatest(v_amt,0), v_cur, v_status, nullif(p_payload->>'external_pool_id',''))
      on conflict (external_ref) do update set status = excluded.status, amount_minor = excluded.amount_minor, updated_at = now();

  else
    raise exception 'VINKO_WALLET_UNKNOWN_EVENT';
  end if;
  update money_events set processed_at = now() where event_id = p_event_id;
  return true;
end $$;
revoke execute on function public.money_ledger_apply(text, text, text, jsonb) from public, anon, authenticated;

-- 4) Cartera del usuario: cuenta + saldo estimado del espejo + movimientos.
-- El saldo es un reflejo de lo que el proveedor ha confirmado (no autoritativo:
-- el número real lo da el proveedor). Solo lectura, solo lo propio. -----------
create or replace function public.wallet_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_acc money_accounts%rowtype; v_avail bigint; v_locked bigint;
begin
  if v_uid is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_acc from money_accounts where user_id = v_uid;
  -- locked = retenido en bolsas abiertas; available = confirmado − retenido − retiradas
  select coalesce(sum(case when kind in ('deposit','payout','refund','stake_release') then amount_minor
                           when kind in ('withdraw','stake_hold') then -amount_minor else 0 end), 0)
    into v_avail from money_ledger_refs where user_id = v_uid and status = 'completed';
  select coalesce(sum(case when kind = 'stake_hold' then amount_minor
                           when kind in ('stake_release','refund') then -amount_minor else 0 end), 0)
    into v_locked from money_ledger_refs where user_id = v_uid and status = 'completed';
  return jsonb_build_object(
    'has_account', v_acc.user_id is not null,
    'provider', v_acc.provider,
    'currency', coalesce(v_acc.currency, 'EUR'),
    'kyc_level', coalesce(v_acc.kyc_level, 0),
    'available_minor', greatest(v_avail, 0),
    'locked_minor', greatest(v_locked, 0),
    'movements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'amount_minor', l.amount_minor, 'currency', l.currency,
        'status', l.status, 'porra_ref', l.porra_ref, 'created_at', l.created_at)
      order by l.created_at desc) from money_ledger_refs l where l.user_id = v_uid), '[]'::jsonb)
  );
end $$;
revoke execute on function public.wallet_get() from public, anon;
grant execute on function public.wallet_get() to authenticated;

-- 5) Invariante de dinero: eximir las columnas de config/espejo (no saldos).
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
    and not (c.table_name = 'money_pools' and c.column_name in ('stake_minor','currency'))
    and not (c.table_name = 'p2p_pools' and c.column_name in ('stake_minor','currency'))
    and not (c.table_name = 'p2p_settlements' and c.column_name in ('amount_minor','currency'))
    -- Fase 2: cuenta (config) y espejo de ledger (apuntes del proveedor), no saldos del núcleo.
    and not (c.table_name = 'money_accounts' and c.column_name = 'currency')
    and not (c.table_name = 'money_ledger_refs' and c.column_name in ('amount_minor','currency'))
$$;
grant execute on function public.money_schema_invariant() to anon, authenticated;

notify pgrst, 'reload schema';
