-- ============================================================================
-- 0062 — SOLO-PUNTOS: edad mínima de registro 18 (R3 / §5.12). Idempotente.
-- Antes eran 14 (0030). Con anuncios y afiliación de operadores, el registro
-- es +18 en todos los mercados. Edad declarada por año de nacimiento (no es
-- verificación de identidad; el proveedor AgeAssurance llega apagado en C).
-- ============================================================================
create or replace function public.profiles_age_guard() returns trigger
language plpgsql as $$
begin
  if new.birth_year is not null and new.birth_year > extract(year from current_date)::int - 18 then
    raise exception 'VINKO_TOO_YOUNG';
  end if;
  return new;
end $$;
drop trigger if exists profiles_age_guard on public.profiles;
create trigger profiles_age_guard before insert or update of birth_year on public.profiles
  for each row execute function public.profiles_age_guard();

notify pgrst, 'reload schema';
