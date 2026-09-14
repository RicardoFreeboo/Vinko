-- ============================================================================
-- VINKO ALFA — 0002: funciones y triggers
-- points SOLO se modifican aquí (security definer) o vía Edge Function service
-- role. El cliente jamás hace UPDATE de points.
-- ============================================================================

-- ¿el usuario actual es admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- Perfil automático al primer login (Google o magic link): handle desde el
-- email, avatar si viene de Google, points=100. birth_year se pide después
-- en la pantalla +18 (copy de limitación declarada, ver ALPHA FREEZE).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; cand text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'user'), '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 20);
  cand := base;
  while exists (select 1 from profiles where handle = cand) loop
    n := n + 1;
    cand := base || (floor(random() * 9000) + 1000)::int::text;
    if n > 20 then cand := left('user' || replace(gen_random_uuid()::text, '-', ''), 24); end if;
  end loop;
  insert into profiles (id, handle, avatar_url)
  values (
    new.id,
    cand,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_alpha_new_user on auth.users;
create trigger trg_alpha_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pick: gasta 10 puntos fijos, uno por (porra, usuario), no se cambia.
-- Las plantillas NUNCA escriben en picks (ALPHA FREEZE, reglas de datos).
create or replace function public.make_pick(p_porra uuid, p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update profiles set points = points - 10 where id = auth.uid() and points >= 10;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;
  insert into picks (porra_id, user_id, option_id) values (p_porra, auth.uid(), p_option);
  -- la PK (porra_id, user_id) hace que el segundo intento falle: el pick no se cambia
end $$;

-- Resolver: SOLO el creador. Marca ganadora y reparte el bote (10 × picks)
-- entre los acertantes, a partes iguales (resto se descarta hacia abajo).
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_total int; v_winners int; v_share int;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.created_by is distinct from auth.uid() then raise exception 'VINKO_NOT_CREATOR'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  if not exists (select 1 from porra_options where id = p_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update porras set status = 'resolved', winning_option_id = p_winning where id = p_porra;
  select count(*) into v_total from picks where porra_id = p_porra;
  select count(*) into v_winners from picks where porra_id = p_porra and option_id = p_winning;
  if v_winners > 0 then
    v_share := floor((v_total * 10)::numeric / v_winners);
    update profiles pr set points = pr.points + v_share
      from picks k
      where k.porra_id = p_porra and k.option_id = p_winning and k.user_id = pr.id;
  end if;
end $$;

-- Solo usuarios autenticados ejecutan; anon no.
revoke execute on function public.make_pick(uuid, uuid) from public, anon;
revoke execute on function public.resolve_porra(uuid, uuid) from public, anon;
grant execute on function public.make_pick(uuid, uuid) to authenticated;
grant execute on function public.resolve_porra(uuid, uuid) to authenticated;
grant execute on function public.is_admin() to authenticated, anon;

-- Tallies agregados por opción (para pintar % sin exponer quién ha hecho pick
-- mientras la porra está abierta). Vista de owner: no filtra por RLS a propósito,
-- solo devuelve conteos.
create or replace view public.porra_tallies as
  select porra_id, option_id, count(*)::int as n
  from public.picks
  group by porra_id, option_id;
grant select on public.porra_tallies to anon, authenticated;
