-- 0073_pausa_barrido_es — PARA el barrido del agente de tendencias hasta la F1
-- del motor de contenido (decisión de Ricardo, 27-oct-2026).
--
-- Por qué: trend-generate v3 es 100 % España (Google News con gl=ES, prompt de
-- «público español», hora de Madrid, catálogo de 0024). Vinko lanza en Colombia:
-- lo que mete en la cola de /admin/temas no sirve. La F1 lo vuelve a programar
-- ya con Colombia y con interruptor (remote_config.content_engine).
--
-- Por qué una migración y no un unschedule a mano: llega sola a prod con el
-- deploy y se re-aplica en cada merge (umbral ≥ 72). Y si se vuelve a aplicar
-- 0060 (un proyecto desde cero o un umbral más bajo), 0060 programa el barrido
-- otra vez; esta, al ir después, lo vuelve a quitar.
--
-- Idempotente: si el job no existe, no hace nada (pg_cron da error al
-- desprogramar un job inexistente). La búsqueda manual desde /admin/temas sigue
-- funcionando: solo se para el barrido automático cada 3 h.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vinko-agent-sweep') then
    perform cron.unschedule('vinko-agent-sweep');
  end if;
end $$;
