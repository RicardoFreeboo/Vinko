-- 0053_security_hardening — Correcciones del repaso de seguridad (23-sep-2026).
-- Todas endurecen; ninguna abre nada. No tocan reglas de oro (esos quedan a
-- confirmación de Ricardo).

-- 1) revenue_share_summary(): era SECURITY DEFINER y ejecutable por PUBLIC/anon
-- (nunca se revocó), saltando la RLS admin de revenue_share_statements. Se le
-- pone guard is_admin y se revoca de public/anon (como su gemela _record).
create or replace function public.revenue_share_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  return (select jsonb_build_object(
    'statements', coalesce((select jsonb_agg(to_jsonb(s) order by s.period desc) from revenue_share_statements s), '[]'::jsonb),
    'settled_pools', (select count(*) from money_pools where status = 'settled'),
    'total_share_minor', coalesce((select sum(vinko_share_minor) from revenue_share_statements where paid_at is not null), 0),
    'pending_share_minor', coalesce((select sum(vinko_share_minor) from revenue_share_statements where paid_at is null), 0)
  ));
end $$;
revoke execute on function public.revenue_share_summary() from public, anon;
grant execute on function public.revenue_share_summary() to authenticated;

-- 2) Opciones y picks de porras PRIVADAS eran legibles conociendo el porra_id
-- (options_read/picks_read_resolved filtraban por estado, no por visibility).
-- Se replica el MISMO predicado de porras_read (0042): pública, propia, admin o
-- privada compartiendo grupo. Para porras públicas el comportamiento no cambia.
drop policy if exists options_read on public.porra_options;
create policy options_read on public.porra_options for select using (
  exists (
    select 1 from public.porras p
    where p.id = porra_id
      and (
        (p.visibility = 'public' and p.status in ('open','resolved','disputed'))
        or p.created_by = auth.uid()
        or public.is_admin()
        or (p.visibility = 'private' and public.shares_group(p.created_by))
      )
  )
);

drop policy if exists picks_read_resolved on public.picks;
create policy picks_read_resolved on public.picks for select using (
  exists (
    select 1 from public.porras p
    where p.id = porra_id and p.status in ('resolved','disputed')
      and (
        p.visibility = 'public'
        or p.created_by = auth.uid()
        or public.is_admin()
        or (p.visibility = 'private' and public.shares_group(p.created_by))
      )
  )
);

-- 3) system_health(): 0015 la reexpuso a anon (sin guard). Se revoca de anon y
-- public; el panel /admin/health la llama como admin (authenticated), que sigue.
revoke execute on function public.system_health() from anon, public;

-- 4) Falta gate +18 al CREAR una porra de dinero P2P (regla de oro 8). Solo el
-- join lo comprobaba. Se añade el check en p2p_pool_create (redefinición 1:1 de
-- 0048 + la comprobación de edad declarada).
create or replace function public.p2p_pool_create(
  p_group uuid, p_title text, p_options text[], p_stake_minor int,
  p_currency text default 'EUR', p_closes_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_close timestamptz; p profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
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

notify pgrst, 'reload schema';
