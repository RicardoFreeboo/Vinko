-- Motor de contenido: invariantes de programación de crons.
-- 0073: el barrido de España (vinko-agent-sweep) queda desprogramado hasta la F1,
-- aunque 0060 lo vuelva a programar al re-aplicar las migraciones.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vinko-agent-sweep') then
    raise exception 'vinko-agent-sweep sigue programado tras 0073';
  end if;
  -- el autopublicador viejo sigue fuera (0030)
  if exists (select 1 from cron.job where jobname = 'vinko-agent-publish') then
    raise exception 'vinko-agent-publish ha vuelto a programarse';
  end if;
  raise notice 'motor: barrido ES y autopublicador desprogramados';
end $$;

-- re-aplicar 0060 + 0073 (un proyecto desde cero o un umbral de deploy bajo) lo deja igual:
-- 0060 vuelve a programar el barrido y 0073 lo quita.
\ir ../../supabase/migrations/0060_cron_config_observabilidad.sql
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vinko-agent-sweep') then
    raise exception 'el test no reproduce el deploy: 0060 debía reprogramar el barrido';
  end if;
end $$;
\ir ../../supabase/migrations/0073_pausa_barrido_es.sql
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vinko-agent-sweep') then
    raise exception 'la pausa de 0073 no es idempotente';
  end if;
end $$;
