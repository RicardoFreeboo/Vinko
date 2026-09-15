-- ============================================================================
-- VINKO — 0021: perfil de usuario con sus porras (creadas y jugadas), como el
-- apk4. Funciones security-definer: muestran las públicas/resueltas de cualquiera
-- (sin filtrar picks por RLS) y TODAS si miras tu propio perfil. Nunca filtran
-- porras privadas de terceros.
-- ============================================================================
create or replace function public.profile_created(p_user uuid)
returns setof public.porras
language sql stable security definer set search_path = public as $$
  select * from porras
  where created_by = p_user and not is_template
    and (visibility = 'public' or status = 'resolved' or created_by = auth.uid())
  order by created_at desc limit 40;
$$;
grant execute on function public.profile_created(uuid) to anon, authenticated;

create or replace function public.profile_played(p_user uuid)
returns setof public.porras
language sql stable security definer set search_path = public as $$
  select p.* from porras p join picks k on k.porra_id = p.id
  where k.user_id = p_user and not p.is_template
    and (p.visibility = 'public' or p.status = 'resolved'
         or p_user = auth.uid() or p.created_by = auth.uid())
  order by p.created_at desc limit 40;
$$;
grant execute on function public.profile_played(uuid) to anon, authenticated;

-- conteos para las estadísticas del perfil
create or replace function public.profile_stats(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'created', (select count(*) from porras where created_by = p_user and source = 'user'),
    'played',  (select count(*) from picks where user_id = p_user),
    'hits',    (select count(*) from picks k join porras p on p.id = k.porra_id
                where k.user_id = p_user and p.status = 'resolved' and k.option_id = p.winning_option_id)
  );
$$;
grant execute on function public.profile_stats(uuid) to anon, authenticated;
