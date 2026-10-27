-- ============================================================================
-- VINKO — 0062: arregla un deadlock latente (dependiente de fecha) en
-- cron_season_rotate() que rompía el gate (tests/sql FX-14) y podía dejar la
-- rotación de temporadas atascada en producción.
--
-- Bug: el número de la nueva temporada se tomaba del season con mayor ends_at
-- (`v_last.number + 1`). Si una temporada se acorta (o el orden por fecha deja
-- de coincidir con el orden por número), ese número puede chocar con una
-- temporada que YA existe → `on conflict (number) do nothing` no inserta nada →
-- el bucle no avanza y sale por el cinturón de seguridad SIN crear una temporada
-- que cubra hoy. Reproducible desde 2026-10-26 (cuando Temporada 2 dejó de ser
-- futura y ya no se borraba en el test).
--
-- Fix: el número sale de max(number)+1 (siempre único → sin choque); las fechas
-- siguen encadenando desde el último fin (mayor ends_at). En operación normal
-- (orden por número == orden por fecha) el comportamiento es idéntico.
-- ============================================================================
create or replace function public.cron_season_rotate() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today    date := (now() at time zone 'Europe/Madrid')::date;
  v_last_end date;
  v_next     int;
  i          int := 0;
begin
  loop
    exit when exists (select 1 from seasons where starts_at <= v_today and ends_at >= v_today);
    select ends_at into v_last_end from seasons order by ends_at desc limit 1;
    if not found then
      insert into seasons (number, name, starts_at, ends_at)
      values (1, 'Temporada 1', v_today, v_today + 41);
    else
      select coalesce(max(number), 0) + 1 into v_next from seasons;
      insert into seasons (number, name, starts_at, ends_at)
      values (v_next, 'Temporada ' || v_next, v_last_end + 1, v_last_end + 42)
      on conflict (number) do nothing;
    end if;
    i := i + 1;
    exit when i > 12; -- cinturón de seguridad
  end loop;
end $$;
