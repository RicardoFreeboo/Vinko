-- 0066_fix_season_rotate — cron_season_rotate podía quedarse SIN temporada.
-- Calculaba el número de la nueva temporada como `v_last.number + 1`, donde
-- v_last era la de mayor ends_at. Si la temporada vigente se "termina" antes de
-- tiempo (su ends_at baja por debajo del de una temporada más antigua pero de
-- número menor), v_last pasa a ser esa antigua y rotate intenta reinsertar un
-- número que YA existe → `on conflict do nothing` no crea nada → bucle sin
-- efecto hasta el cinturón de seguridad, y no queda ninguna temporada que cubra
-- hoy. (Lo destapó FX-14 el 26-oct, el día en que arranca la Temporada 2.)
--
-- Arreglo: el número nuevo es max(number)+1 (nunca colisiona); la fecha sigue
-- encadenando desde la temporada que acaba más tarde (max(ends_at)+1). Mismo
-- comportamiento en el caso normal; deja de atascarse en el caso límite.
create or replace function public.cron_season_rotate() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_last_end date; v_next_num int; i int := 0;
begin
  loop
    exit when exists (select 1 from seasons where starts_at <= v_today and ends_at >= v_today);
    select max(ends_at), coalesce(max(number), 0) + 1 into v_last_end, v_next_num from seasons;
    if v_last_end is null then
      insert into seasons (number, name, starts_at, ends_at)
      values (1, 'Temporada 1', v_today, v_today + 41);
    else
      insert into seasons (number, name, starts_at, ends_at)
      values (v_next_num, 'Temporada ' || v_next_num, v_last_end + 1, v_last_end + 42)
      on conflict (number) do nothing;
    end if;
    i := i + 1;
    exit when i > 12; -- cinturón de seguridad
  end loop;
end $$;

notify pgrst, 'reload schema';
