-- ============================================================================
-- VINKO ALFA — 0005: crédito de puntos por anuncio recompensado (regla de oro 2)
-- Atómico y seguro: +18 declarado, +10 fijos, máx. 5/día, idempotente por
-- impression_id. Solo lo ejecuta el service role (la Edge Function). El cliente
-- NUNCA suma puntos. Los puntos jamás se compran: solo se recargan viendo el
-- anuncio, con estos límites hardcodeados.
-- ============================================================================

create or replace function public.grant_ad_reward(p_user uuid, p_impression text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_used int; v_adult boolean; v_amount int := 10;
begin
  select (birth_year is not null and (extract(year from now())::int - birth_year) >= 18)
    into v_adult from profiles where id = p_user;
  if not coalesce(v_adult, false) then raise exception 'VINKO_NOT_ADULT'; end if;

  -- idempotencia: si ya se acreditó esta impresión, no vuelve a pagar
  if exists (select 1 from ad_impressions where impression_id = p_impression) then
    return 0;
  end if;

  -- cap diario 5/día
  select count(*) into v_used
    from ad_impressions
    where user_id = p_user and created_at::date = current_date and status = 'granted';
  if v_used >= 5 then raise exception 'VINKO_AD_CAP'; end if;

  insert into ad_impressions (user_id, impression_id, amount, status)
    values (p_user, p_impression, v_amount, 'granted');
  update profiles set points = points + v_amount where id = p_user;
  return v_amount;
end $$;

-- Solo el service role (Edge Function). Nadie más.
revoke execute on function public.grant_ad_reward(uuid, text) from public, anon, authenticated;
