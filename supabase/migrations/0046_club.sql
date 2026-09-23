-- 0046_club — Vinko Club (VINKO_BILLING_SPEC Parte A). Suscripción/compras propias
-- por Stripe/PayPal. NO es el bote de nadie ni un % de ninguna porra: venta de
-- software (sin anuncios, cosméticos, más grupos). Legal sin licencia de juego.
-- Regla de oro 2 intacta: el Club NUNCA da Vinkos, multiplicadores ni ventaja.
-- El dinero lo cobra Stripe/PayPal; Vinko no toca tarjetas (PCI mínimo).

do $$ begin
  create type public.club_status as enum ('none','active','past_due','canceled','trialing');
exception when duplicate_object then null; end $$;

create table if not exists public.billing_customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  paypal_payer_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.club_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('stripe','paypal')),
  external_subscription_id text not null,
  status public.club_status not null default 'none',
  plan text not null,                       -- 'monthly' | 'annual'
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_subscription_id)
);
create index if not exists club_subscriptions_user_idx on public.club_subscriptions (user_id);

create table if not exists public.billing_events (
  event_id text primary key,                -- idempotencia del webhook
  provider text not null,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- Entitlement derivado, cacheado para lectura rápida (lo escribe SOLO el webhook).
alter table public.profiles add column if not exists club_active boolean not null default false;
alter table public.profiles add column if not exists club_until timestamptz;

-- RLS: el dueño lee su suscripción y su cliente; billing_events solo servicio.
alter table public.billing_customers enable row level security;
alter table public.club_subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists billing_customers_own on public.billing_customers;
create policy billing_customers_own on public.billing_customers for select using (user_id = auth.uid());
drop policy if exists club_subscriptions_own on public.club_subscriptions;
create policy club_subscriptions_own on public.club_subscriptions for select using (user_id = auth.uid() or public.is_admin());

revoke all on public.billing_customers, public.club_subscriptions, public.billing_events from anon, authenticated;
grant select on public.billing_customers, public.club_subscriptions to authenticated;

-- Config del Club (precio sin hardcode).
insert into public.remote_config (key, value) values ('club', $j$
{
  "enabled": true,
  "monthly_minor": 399,
  "annual_minor": 3499,
  "currency": "EUR",
  "trial_days": 0,
  "invoicing_entity": null,
  "perks": ["no_ads", "cosmetics", "stats", "more_groups", "focus_monthly"]
}$j$::jsonb) on conflict (key) do nothing;

-- Registrar el cliente de Stripe/PayPal del usuario (lo llama /api/club/checkout
-- con service role o el propio usuario autenticado; nunca escribe entitlement).
create or replace function public.club_set_customer(p_user uuid, p_stripe text default null, p_paypal text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user and not public.is_admin() then raise exception 'VINKO_NOT_ALLOWED'; end if;
  insert into billing_customers (user_id, stripe_customer_id, paypal_payer_id)
    values (p_user, p_stripe, p_paypal)
    on conflict (user_id) do update set
      stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_customers.stripe_customer_id),
      paypal_payer_id = coalesce(excluded.paypal_payer_id, billing_customers.paypal_payer_id);
end $$;
revoke execute on function public.club_set_customer(uuid, text, text) from public, anon;
grant execute on function public.club_set_customer(uuid, text, text) to authenticated;

-- Aplicar un evento de facturación YA verificado (firma comprobada en la Edge
-- Function billing-webhook). Idempotente por event_id. Actualiza la suscripción
-- y el entitlement. SOLO service role (auth.uid() nulo). El Club jamás toca points/xp.
create or replace function public.club_apply_event(
  p_event_id text, p_provider text, p_type text, p_payload jsonb,
  p_user uuid, p_sub_id text, p_status text, p_plan text,
  p_period_end timestamptz, p_cancel boolean
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_active boolean;
begin
  if auth.uid() is not null then raise exception 'VINKO_SERVICE_ONLY'; end if;
  insert into billing_events (event_id, provider, type, payload) values (p_event_id, p_provider, p_type, p_payload)
    on conflict (event_id) do nothing;
  if not found then return false; end if;   -- duplicado
  if p_user is not null and p_sub_id is not null then
    insert into club_subscriptions (user_id, provider, external_subscription_id, status, plan, current_period_end, cancel_at_period_end)
      values (p_user, p_provider, p_sub_id, coalesce(p_status,'none')::club_status, coalesce(p_plan,'monthly'), p_period_end, coalesce(p_cancel,false))
      on conflict (provider, external_subscription_id) do update set
        status = excluded.status, plan = excluded.plan, current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
    v_active := coalesce(p_status,'') in ('active','trialing');
    update profiles set club_active = v_active,
      club_until = case when v_active then p_period_end else club_until end
      where id = p_user;
  end if;
  update billing_events set processed_at = now() where event_id = p_event_id;
  return true;
end $$;
revoke execute on function public.club_apply_event(text, text, text, jsonb, uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;

-- Conciliación diaria por si se pierde un webhook: caduca el Club vencido.
create or replace function public.cron_club_expire() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set club_active = false
    where club_active = true and club_until is not null and club_until < now();
end $$;
revoke execute on function public.cron_club_expire() from public, anon;

do $$ begin perform cron.unschedule('vinko-club-expire'); exception when others then null; end $$;
select cron.schedule('vinko-club-expire', '30 3 * * *', 'select public.cron_club_expire()');

notify pgrst, 'reload schema';
