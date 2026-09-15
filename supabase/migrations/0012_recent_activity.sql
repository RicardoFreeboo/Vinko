-- ============================================================================
-- VINKO — 0012: recent_activity para el grafo de flujo del backstage (spec de
-- paneles §4). Función admin-gated (security definer) que devuelve los últimos
-- eventos REALES del sistema, ya mapeados a nodos origen/destino. El panel los
-- reproduce como haces de luz. Nada de datos inventados: si no hay eventos,
-- vuelve vacío. Excluye plantillas (is_seed) del conteo.
-- ============================================================================
create or replace function public.recent_activity(p_limit int default 40)
returns table (kind text, from_node text, to_node text, magnitude int, ts timestamptz, label text)
language sql security definer set search_path = public as $$
  select * from (
    -- señales entrando al agente
    select 'signal'::text, 'fuentes', 'agente', 1,
           created_at, coalesce(left(topic, 40), 'señal')
      from signals
    union all
    -- candidatas generadas (a la cola) y publicadas (a producción)
    select case when status = 'published' then 'publish' else 'candidate' end,
           'agente',
           case when status = 'published' then 'publicado' else 'aprobacion' end,
           coalesce(score, 1), created_at, left(title, 40)
      from topic_proposals
    union all
    -- picks reales de usuarios
    select 'pick', 'usuarios', 'porras', 1, created_at, 'pick'
      from picks
    union all
    -- resoluciones de porra (magnitud = bote de puntos)
    select 'resolve', 'porras', 'marcador',
           greatest((select count(*) from picks k where k.porra_id = p.id) * 10, 1),
           created_at, left(title, 40)
      from porras p where status = 'resolved'
    union all
    -- recompensas de anuncio → monedas
    select 'ad', 'anuncio', 'monedas', amount, created_at, slot
      from ad_impressions where status = 'granted'
    union all
    -- compras (sumidero)
    select 'buy', 'monedas', 'tienda', cost, created_at, code
      from purchases
    union all
    -- pushes enviados a jugadores
    select 'push', 'push', 'jugadores', 1, created_at, class
      from push_sent
  ) e(kind, from_node, to_node, magnitude, ts, label)
  where public.is_admin()
  order by ts desc
  limit greatest(least(p_limit, 200), 1);
$$;
revoke execute on function public.recent_activity(int) from public, anon;
grant execute on function public.recent_activity(int) to authenticated;

-- métricas reales para el dashboard de KPIs (conteos honestos, sin inventar).
create or replace function public.kpi_counts()
returns jsonb
language sql security definer set search_path = public as $$
  select case when not public.is_admin() then '{}'::jsonb else jsonb_build_object(
    'users',        (select count(*) from profiles),
    'pools',        (select count(*) from porras where source = 'user'),
    'picks',        (select count(*) from picks),
    'points_out',   (select coalesce(sum(amount),0) from ad_impressions where status='granted'),
    'points_burn',  (select count(*) * 10 from picks),
    'daily_answers',(select count(*) from daily_pick_answers),
    'groups',       (select count(*) from groups),
    'signals',      (select count(*) from signals),
    'queue',        (select count(*) from topic_proposals where status = 'pending_review'),
    'buffer_days',  (select count(*) from daily_picks where status = 'scheduled' and scheduled_for >= madrid_today())
  ) end;
$$;
revoke execute on function public.kpi_counts() from public, anon;
grant execute on function public.kpi_counts() to authenticated;
