-- ============================================================================
-- VINKO — 0077: cada predicción de usuario lleva el mercado de quien la crea.
-- Descubrir (VINKO_PANTALLAS 05) separa «Colombia | Global»; 0064 añadió
-- porras.market pero nadie lo rellenaba. Mercado del creador = profiles.market
-- o, si no tiene, su país declarado cuando es un mercado activo (hoy CO).
-- Editoriales, plantillas y gente sin país: sin mercado (solo en Global).
-- Idempotente: se re-aplica en cada despliegue (MIGRATIONS_FROM).
-- ============================================================================

create or replace function public.porra_market_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.market is null and new.created_by is not null and new.source = 'user' then
    select coalesce(p.market, m.code) into new.market
      from profiles p
      left join markets m on m.code = p.country and m.active and m.code <> 'GLOBAL'
     where p.id = new.created_by;
  end if;
  return new;
end $$;

drop trigger if exists trg_porras_market on public.porras;
create trigger trg_porras_market before insert on public.porras
  for each row execute function public.porra_market_default();

-- Las que ya existían (solo las que siguen sin mercado).
update public.porras po
   set market = coalesce(p.market, m.code)
  from public.profiles p
  left join public.markets m on m.code = p.country and m.active and m.code <> 'GLOBAL'
 where po.created_by = p.id and po.market is null and po.source = 'user'
   and coalesce(p.market, m.code) is not null;
