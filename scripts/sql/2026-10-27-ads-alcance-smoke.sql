-- Prueba de Vinko Ads · Fase 2 (0072) contra la base real, SIN escribir nada:
-- todo va en una transacción READ ONLY que acaba en ROLLBACK. Comprueba lo que
-- dejó la migración y llama a ads_estimate_reach() como lo haría la app (rol
-- authenticated con el uid de un admin real, de un uid que no es admin y como
-- anon). Solo imprime OK/FALLO y si se supera el mínimo de audiencia: nunca
-- cifras, uids ni datos de personas (el log de Actions es público mientras el
-- repo lo sea). La lanza .github/workflows/ads-alcance-smoke.yml.
\set ON_ERROR_STOP on
\set VERBOSITY terse
begin transaction read only;

-- 1) Lo que dejó la migración (como postgres, antes de cambiar de rol)
do $$
declare n int; fails int := 0;
begin
  select count(*) into n from profiles p
   where not exists (select 1 from ads_user_flags f where f.user_id = p.id);
  if n > 0 then fails := fails + 1; raise notice 'FALLO flags: hay perfiles sin fila en ads_user_flags';
  else raise notice 'OK  flags: todos los perfiles tienen su fila en ads_user_flags'; end if;

  select count(*) into n from ads_user_flags where ads_holdout <> (ads_holdout_bucket(user_id) < 5);
  if n > 0 then fails := fails + 1; raise notice 'FALLO grupo de control: no coincide con el uid';
  else raise notice 'OK  grupo de control: sale del uid en todas las filas'; end if;

  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and c.relname in ('ads_job_runs', 'ads_user_flags', 'ads_user_profile', 'ads_sides',
                       'ads_user_sides', 'ads_user_freq', 'ads_hides');
  if n > 0 then fails := fails + 1; raise notice 'FALLO RLS: hay tablas de la 0072 sin RLS';
  else raise notice 'OK  RLS activa en las 7 tablas de la 0072'; end if;

  select count(*) into n from cron.job
   where jobname in ('vinko-ads-profile-refresh', 'vinko-ads-sides-refresh');
  if n <> 2 then fails := fails + 1; raise notice 'FALLO cron: faltan los trabajos diarios de anuncios';
  else raise notice 'OK  cron: los dos trabajos diarios están programados'; end if;

  -- el uid del admin se guarda en la transacción; no se imprime
  perform set_config('smoke.admin', coalesce((select id::text from profiles where role = 'admin' limit 1), ''), true);
  perform set_config('smoke.fails', fails::text, true);
end $$;

-- 2) ads_estimate_reach con datos reales, como usuario con sesión
set local role authenticated;
do $$
declare
  adm   uuid := nullif(current_setting('smoke.admin'), '')::uuid;
  fails int := current_setting('smoke.fails')::int;
  uid   uuid;
  c     jsonb;
  r     jsonb;
  ok    boolean;
begin
  if adm is null then
    fails := fails + 1; raise notice 'FALLO no hay ningún perfil con role = admin para probar';
  end if;
  for c in select * from jsonb_array_elements('[
    {"n": "CO sin segmentar",          "t": {"market": "CO"},                          "tier": "broad"},
    {"n": "ES sin segmentar",          "t": {"market": "ES"},                          "tier": "broad"},
    {"n": "CO 18-24",                  "t": {"market": "CO", "age_bands": ["18-24"]},  "tier": "basic"},
    {"n": "CO interés fútbol",         "t": {"market": "CO", "interests": ["futbol"]}, "tier": "interest"},
    {"n": "CO en directo",             "t": {"market": "CO", "live": true},            "tier": "live"},
    {"n": "categoría sensible",        "t": {"interests": ["politica"]},               "err": "VINKO_ADS_SENSITIVE"},
    {"n": "interés desconocido",       "t": {"interests": ["inventado"]},              "err": "VINKO_ADS_BAD_INTEREST"},
    {"n": "franja de edad de menores", "t": {"age_bands": ["13-17"]},                  "err": "VINKO_ADS_BAD_AGE"},
    {"n": "usuario que no es admin",   "t": {"market": "CO"}, "as": "nadie",           "err": "VINKO_NOT_ADMIN"}
  ]'::jsonb) loop
    uid := case when c->>'as' = 'nadie' then gen_random_uuid() else adm end;
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
    begin
      r := public.ads_estimate_reach(c->'t');
      if c ? 'err' then
        fails := fails + 1; raise notice 'FALLO %: debía rechazarse con % y devolvió resultado', c->>'n', c->>'err';
      else
        ok := r->>'tier' = c->>'tier'
          and (r->>'min_audience')::int >= 1
          and r ? 'meets_minimum'
          and case when (r->>'meets_minimum')::boolean
                   then (r->>'people')::int >= (r->>'min_audience')::int and (r->>'people')::int % 100 = 0
                        and (r->>'max_votes')::int >= 0
                   else jsonb_typeof(r->'people') = 'null' and jsonb_typeof(r->'max_votes') = 'null' end
          and (c->>'tier' <> 'live' or r->>'live_window' = 'pending');
        if ok then
          raise notice 'OK  %: tramo %, supera el mínimo de %: %', c->>'n', r->>'tier', r->>'min_audience',
            case when (r->>'meets_minimum')::boolean then 'sí' else 'no (no da la cifra)' end;
        else
          fails := fails + 1; raise notice 'FALLO %: respuesta incoherente (tramo %)', c->>'n', r->>'tier';
        end if;
      end if;
    exception when others then
      if c ? 'err' and sqlerrm = c->>'err' then
        raise notice 'OK  %: rechazada con %', c->>'n', sqlerrm;
      else
        fails := fails + 1; raise notice 'FALLO %: error inesperado %', c->>'n', sqlerrm;
      end if;
    end;
  end loop;
  perform set_config('smoke.fails', fails::text, true);
end $$;

-- 3) Sin sesión (anon) no se puede llamar
set local role anon;
do $$
begin
  perform public.ads_estimate_reach('{"market": "CO"}'::jsonb);
  perform set_config('smoke.fails', (current_setting('smoke.fails')::int + 1)::text, true);
  raise notice 'FALLO anon: pudo llamar a ads_estimate_reach';
exception when insufficient_privilege then
  raise notice 'OK  anon: sin permiso para ads_estimate_reach';
end $$;

reset role;
do $$
begin
  if current_setting('smoke.fails')::int > 0 then
    raise exception 'La prueba de alcance tiene % fallo(s)', current_setting('smoke.fails');
  end if;
  raise notice 'TODO OK: la 0072 está bien aplicada y ads_estimate_reach responde con datos reales.';
end $$;
rollback;
