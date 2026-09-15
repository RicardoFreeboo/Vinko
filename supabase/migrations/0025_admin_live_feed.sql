-- ============================================================================
-- VINKO — 0025: feed LIVE real para /admin/live (PASO 5d).
-- El panel era una maqueta estática: siempre decía "Nadie ahora." aunque
-- hubiera actividad. La tabla events_mirror de la spec nunca existió, así que
-- leemos la actividad REAL que ya vive en la base: picks, porras creadas y
-- recompensas de anuncio. Sin filas inventadas: si no hay nada, no hay nada.
-- ============================================================================
create or replace function public.admin_live_feed(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'VINKO_FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ts desc), '[]'::jsonb) into v
  from (
    -- un pronóstico de una persona real sobre una porra
    select k.created_at as ts, 'pick_made'::text as evento,
           pr.handle::text as handle, po.slug::text as slug, po.source::text as origen
      from picks k
      join profiles pr on pr.id = k.user_id
      join porras   po on po.id = k.porra_id
    union all
    -- porra creada por una persona real (las plantillas quedan fuera)
    select po.created_at, 'porra_created',
           pr.handle::text, po.slug::text, po.source::text
      from porras po
      join profiles pr on pr.id = po.created_by
     where po.is_template = false
    union all
    -- porra resuelta por su juez
    select po.created_at, 'porra_resolved',
           pr.handle::text, po.slug::text, po.source::text
      from porras po
      join profiles pr on pr.id = po.created_by
     where po.status = 'resolved'
    union all
    -- recompensa de anuncio concedida por el servidor
    select ai.created_at, 'ad_reward_granted',
           pr.handle::text, null::text, ai.slot::text
      from ad_impressions ai
      join profiles pr on pr.id = ai.user_id
     where ai.status = 'granted'
    order by ts desc
    limit greatest(least(p_limit, 200), 1)
  ) x;

  return v;
end $$;

revoke execute on function public.admin_live_feed(int) from public, anon;
grant execute on function public.admin_live_feed(int) to authenticated;
