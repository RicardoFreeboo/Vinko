-- 0063_racha_solo_votar — La racha se gana VOTANDO, no por abrir la app.
-- make_pick y make_guest_pick ya llaman a touch_streak, así que pronosticar (y
-- el regalo diario explícito, claim_daily_bonus) siguen contando. Lo que se
-- quita es el disparador de "abrir la app": 0052 hizo que la racha subiera solo
-- con entrar, lo que premia abrir-y-cerrar en vez de jugar. Revertimos eso.
--
-- daily_open() no lo llama ningún cron ni trigger; solo lo invocaban dos sitios
-- de cliente (AppNav y el feed), que se quitan en este mismo cambio. Se elimina
-- la función para no dejar un RPC muerto que siempre daría 404.
drop function if exists public.daily_open();

notify pgrst, 'reload schema';
