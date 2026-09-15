-- ============================================================================
-- VINKO — 0026: APUESTA VARIABLE. Cada persona decide cuántos Vinkos pone en
-- una porra, en vez de 10 fijos. Sigue siendo moneda virtual: no se compra ni
-- se canjea por dinero (regla de oro 2) y la PRECISIÓN no depende del importe
-- (§7.1: el marcador es mérito, no volumen), así que apostar más no compra
-- premios, solo reparte más bote de puntos.
-- Se reemplaza la firma de 2 argumentos por una con p_stake por defecto 10,
-- así el código antiguo que llama con 2 parámetros sigue funcionando.
-- ============================================================================
drop function if exists public.make_pick(uuid, uuid);

create or replace function public.make_pick(p_porra uuid, p_option uuid, p_stake int default 10)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_eco jsonb := cfg('economy');
  v_min int := coalesce((v_eco->>'pick_min')::int, 10);
  v_max int := coalesce((v_eco->>'pick_max')::int, 1000);
  v_stake int;
  v_xp_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;

  v_stake := coalesce(p_stake, v_min);
  if v_stake < v_min then raise exception 'VINKO_STAKE_MIN'; end if;
  if v_stake > v_max then raise exception 'VINKO_STAKE_MAX'; end if;

  update profiles set points = points - v_stake
    where id = auth.uid() and points >= v_stake;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;

  insert into picks (porra_id, user_id, option_id, points_spent)
    values (p_porra, auth.uid(), p_option, v_stake);

  -- XP por participar (cap diario) + racha. El XP NO escala con el importe:
  -- apostar más no debe comprar nivel.
  select count(*) into v_xp_today from picks
    where user_id = auth.uid()
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_xp_today <= coalesce((v_eco->>'pick_xp_daily_cap')::int, 5) then
    perform award_xp(auth.uid(), coalesce((v_eco->>'pick_xp')::int, 15));
  end if;
  perform touch_streak(auth.uid());
end $$;

grant execute on function public.make_pick(uuid, uuid, int) to authenticated;
