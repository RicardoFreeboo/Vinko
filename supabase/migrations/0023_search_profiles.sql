-- ============================================================================
-- VINKO — 0023: buscar perfiles (como Instagram). search_profiles(q) devuelve
-- perfiles públicos por @handle con su nº de porras públicas, para descubrir
-- gente y ver sus porras. Solo datos públicos (handle + avatar), que ya son
-- visibles en /u/[handle]. q vacío = descubrir (más activos primero).
-- ============================================================================
create or replace function public.search_profiles(q text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created desc, x.handle), '[]'::jsonb)
  from (
    select p.handle,
           p.avatar_url as avatar,
           (select count(*) from porras po
             where po.created_by = p.id and po.is_template = false
               and po.visibility = 'public' and po.status <> 'taken_down') as created
    from profiles p
    where p.handle is not null
      and (coalesce(trim(q), '') = '' or p.handle ilike '%' || q || '%')
    order by created desc, p.handle
    limit 24
  ) x;
$$;
grant execute on function public.search_profiles(text) to anon, authenticated;
