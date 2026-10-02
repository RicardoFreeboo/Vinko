-- ============================================================================
-- SEC-01 — profiles deja de ser un libro abierto.
-- Hasta ahora cualquiera con la anon key leía TODAS las columnas de TODOS los
-- perfiles (0003: policy using(true) sin revocar select): año de nacimiento,
-- pay_handle (Bizum/PayPal), país, safer_play, intereses, referred_by…
-- Ahora: select solo de las columnas PÚBLICAS que la app enseña en /u, feed y
-- rankings. Lo privado se lee SOLO del propio perfil vía la RPC me().
-- Idempotente: grants/revokes y create or replace se pueden re-ejecutar.
-- ============================================================================

-- display_name (RT-01 lo usa para invitados; se crea ya para poder concederla)
alter table public.profiles add column if not exists display_name text
  check (display_name is null or char_length(display_name) between 2 and 24);

-- Tu propio perfil, completo (datos propios: no expone a terceros).
create or replace function public.me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from public.profiles p where p.id = auth.uid()
$$;
revoke execute on function public.me() from public, anon;
grant execute on function public.me() to authenticated;

-- KPIs de /admin (kpi-chat): columnas agregadas que ya no son públicas.
create or replace function public.admin_kpi_profiles()
returns table (created_at timestamptz, referred_by uuid, points int, streak_days int, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  return query select p.created_at, p.referred_by, p.points, p.streak_days, p.role from profiles p;
end $$;
revoke execute on function public.admin_kpi_profiles() from public, anon;
grant execute on function public.admin_kpi_profiles() to authenticated;

-- El candado de columnas. La policy profiles_read (using true) se queda: el
-- recorte real lo hacen los privilegios de columna, igual que ya se hace con
-- points/role en escritura (0003).
revoke select on public.profiles from anon, authenticated;
grant select (id, handle, display_name, avatar_url, xp, marcador_total,
              division, title, points, streak_days, streak_best, created_at)
  on public.profiles to anon, authenticated;

notify pgrst, 'reload schema';
