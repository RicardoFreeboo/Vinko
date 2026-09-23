-- 0047_revshare — Parte B de VINKO_BILLING_SPEC: conciliación del rev-share.
-- La comisión (rake) de las bolsas la cobra el OPERADOR LICENCIADO dentro del
-- bote y te paga tu parte como acuerdo B2B (rev-share). Esta tabla SOLO REGISTRA
-- lo que el operador te liquida, para contabilidad y conciliación. NUNCA mueve el
-- bote, ni cobra tarjetas, ni depende de que Vinko tenga custodia. Es lectura y
-- registro. El importe efectivo por bolsa lo reporta el operador; aquí se totaliza.
-- Se rellena cuando exista un operador (legal_basis_ref); mientras, queda vacía.

create table if not exists public.revenue_share_statements (
  id                bigint generated always as identity primary key,
  provider          text not null,                 -- 'partner_x' | 'vinko_money'
  period            text not null,                 -- p. ej. '2026-10'
  gross_rake_minor  bigint not null default 0,     -- comisión bruta del operador en el periodo (informativo)
  vinko_share_minor bigint not null default 0,     -- lo que el operador liquida a Vinko (ingreso B2B)
  currency          char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_at           timestamptz,                   -- cuándo lo pagó el operador (null = pendiente)
  invoice_ref       text,                          -- referencia de factura/transferencia
  legal_basis_ref   text,                          -- contrato del operador (opaco)
  recorded_by       uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  unique (provider, period)
);
comment on table public.revenue_share_statements is 'Rev-share B2B que el operador licenciado liquida a Vinko. No son fondos ni saldo de usuarios.';
create index if not exists revenue_share_period_idx on public.revenue_share_statements (period desc);

alter table public.revenue_share_statements enable row level security;
drop policy if exists revshare_admin_read on public.revenue_share_statements;
create policy revshare_admin_read on public.revenue_share_statements for select using (public.is_admin());
revoke all on public.revenue_share_statements from anon, authenticated;
grant select on public.revenue_share_statements to authenticated;  -- RLS lo restringe a admin

-- Registrar/actualizar una liquidación (solo admin, o service role al conciliar por API).
create or replace function public.revenue_share_record(
  p_provider text, p_period text, p_gross_minor bigint, p_share_minor bigint,
  p_currency text, p_paid_at timestamptz default null, p_invoice text default null, p_legal_basis_ref text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if p_period !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'VINKO_BAD_PERIOD'; end if;
  if coalesce(p_currency,'') !~ '^[A-Z]{3}$' then raise exception 'VINKO_BAD_CURRENCY'; end if;
  if coalesce(p_gross_minor,0) < 0 or coalesce(p_share_minor,0) < 0 then raise exception 'VINKO_BAD_AMOUNT'; end if;
  insert into revenue_share_statements (provider, period, gross_rake_minor, vinko_share_minor, currency, paid_at, invoice_ref, legal_basis_ref, recorded_by)
    values (p_provider, p_period, coalesce(p_gross_minor,0), coalesce(p_share_minor,0), upper(p_currency), p_paid_at, p_invoice, p_legal_basis_ref, auth.uid())
    on conflict (provider, period) do update set
      gross_rake_minor = excluded.gross_rake_minor, vinko_share_minor = excluded.vinko_share_minor,
      currency = excluded.currency, paid_at = excluded.paid_at, invoice_ref = excluded.invoice_ref,
      legal_basis_ref = excluded.legal_basis_ref, recorded_by = auth.uid();
end $$;
revoke execute on function public.revenue_share_record(text, text, bigint, bigint, text, timestamptz, text, text) from public, anon;
grant execute on function public.revenue_share_record(text, text, bigint, bigint, text, timestamptz, text, text) to authenticated;

-- Resumen para el panel: comisión estimada por bolsa (rake_bps de money_pools,
-- informativo) y total del rev-share ya liquidado. Solo lectura.
create or replace function public.revenue_share_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'statements', coalesce((select jsonb_agg(to_jsonb(s) order by s.period desc) from revenue_share_statements s), '[]'::jsonb),
    'settled_pools', (select count(*) from money_pools where status = 'settled'),
    'total_share_minor', coalesce((select sum(vinko_share_minor) from revenue_share_statements where paid_at is not null), 0),
    'pending_share_minor', coalesce((select sum(vinko_share_minor) from revenue_share_statements where paid_at is null), 0)
  );
$$;
grant execute on function public.revenue_share_summary() to authenticated;

notify pgrst, 'reload schema';
