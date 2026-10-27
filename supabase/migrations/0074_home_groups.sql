-- 0074_home_groups — INICIO · tus grupos (VINKO_PANTALLAS 04) en una sola llamada.
-- La pestaña Grupos deja de ser una lista y pasa a ser el inicio del diseño:
--   · groups:   tus grupos con TU puesto de la semana (Puntería desde el corte
--               semanal, como la pestaña "Esta semana" de /g), a cuántos puntos
--               estás del de arriba y quién lidera.
--   · to_vote:  porras abiertas de tus grupos en las que aún no has votado, con
--               sus opciones (se vota desde el inicio) y quién ya votó (real).
--   · waiting:  tus votos pendientes de resultado («Tú: X · como 5 de 9»).
--   · resolved: tus últimos resultados (acierto/fallo, cuántos lo vieron y la
--               Puntería ganada) con enlace al recibo.
--   · unread:   avisos sin leer de Novedades (la campana).
-- Solo lectura, solo lo tuyo (auth.uid()). Idempotente: se re-aplica en cada
-- deploy (umbral 72). Todo lo social es real: recuentos y nombres de picks reales.
create or replace function public.home_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_cut   timestamptz := public.group_week_cutoff();
  v_stake int := coalesce((public.cfg('economy') ->> 'pick_min')::int, 10);
  v_groups jsonb := '[]'::jsonb;
  g record;
  lb record;
begin
  if v_me is null then raise exception 'VINKO_NO_AUTH'; end if;

  -- Tus grupos, el más activo primero (última porra creada en el grupo).
  for g in
    select gr.id, gr.name,
           (select count(*) from group_members m2 where m2.group_id = gr.id)::int as members,
           (select max(p.created_at) from porras p where p.group_id = gr.id) as last_porra
      from groups gr
      join group_members gm on gm.group_id = gr.id and gm.user_id = v_me
     order by 4 desc nulls last, gr.name
     limit 12
  loop
    -- Clasificación de la semana: mismo orden que GroupLeaderboard (semana,
    -- luego total, luego handle) para el líder; el PUESTO es compartido en los
    -- empates (rank: todos los de 0 puntos son «3.º», no 3.º/4.º/5.º por el
    -- alfabeto) y el hueco se mide al más cercano con MÁS puntos (con un
    -- empatado arriba saldría «a 0 pts de…»).
    with r as (
      select l.user_id, l.handle, l.avatar_url, l.skill_7d, l.skill_total,
             row_number() over (order by l.skill_7d desc, l.skill_total desc, l.handle) as pos,
             rank() over (order by l.skill_7d desc) as place
        from public.group_leaderboard_rows(g.id) l
    ), mine as (
      select * from r where user_id = v_me
    )
    select (select place from mine)::int                                 as my_rank,
           (select skill_7d from mine)::int                              as my_week,
           (select handle from r where pos = 1)                          as leader,
           (select avatar_url from r where pos = 1)                      as leader_avatar,
           (select skill_7d from r where pos = 1)::int                   as leader_week,
           (select r.handle from r, mine where r.skill_7d > mine.skill_7d
             order by r.skill_7d, r.pos desc limit 1)                    as above,
           (select r.skill_7d - mine.skill_7d from r, mine where r.skill_7d > mine.skill_7d
             order by r.skill_7d, r.pos desc limit 1)::int               as gap,
           (select r.handle from r, mine where r.skill_7d < mine.skill_7d
             order by r.skill_7d desc, r.pos limit 1)                    as below,
           (select mine.skill_7d - r.skill_7d from r, mine where r.skill_7d < mine.skill_7d
             order by r.skill_7d desc, r.pos limit 1)::int               as lead
      into lb;

    v_groups := v_groups || jsonb_build_object(
      'id', g.id, 'name', g.name, 'members', g.members,
      'rank', lb.my_rank, 'week', coalesce(lb.my_week, 0),
      'leader', lb.leader, 'leader_avatar', lb.leader_avatar, 'leader_week', coalesce(lb.leader_week, 0),
      'above', lb.above, 'gap', lb.gap, 'below', lb.below, 'lead', lb.lead
    );
  end loop;

  return jsonb_build_object(
    'week_ends', v_cut + interval '7 days',
    'stake', v_stake,
    'groups', v_groups,
    'unread', (select count(*) from notifications n where n.user_id = v_me and n.read_at is null)::int,

    'to_vote', coalesce((
      select jsonb_agg(x.j order by x.closes_at)
      from (
        select p.closes_at, jsonb_build_object(
          'id', p.id, 'slug', p.slug, 'title', p.title, 'closes_at', p.closes_at,
          'group', gr.name,
          'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'idx', o.idx, 'label', o.label) order by o.idx)
                        from porra_options o where o.porra_id = p.id),
          'voters', (select count(*) from picks k where k.porra_id = p.id)::int,
          'faces', coalesce((
            select jsonb_agg(jsonb_build_object('handle', pr.handle, 'avatar_url', pr.avatar_url,
                                                'name', public.profile_name(pr.id)) order by f.created_at desc)
              from (select k.user_id, k.created_at from picks k where k.porra_id = p.id
                     order by k.created_at desc limit 3) f
              join profiles pr on pr.id = f.user_id
          ), '[]'::jsonb)
        ) as j
          from porras p
          join groups gr on gr.id = p.group_id
          join group_members gm on gm.group_id = p.group_id and gm.user_id = v_me
         where p.status = 'open' and not p.is_template and p.closes_at > now()
           and not exists (select 1 from picks k where k.porra_id = p.id and k.user_id = v_me)
         order by p.closes_at
         limit 10
      ) x
    ), '[]'::jsonb),

    'waiting', coalesce((
      select jsonb_agg(x.j order by x.closes_at)
      from (
        select p.closes_at, jsonb_build_object(
          'slug', p.slug, 'title', p.title, 'closes_at', p.closes_at,
          'group', gr.name,
          'mine', (select o.label from porra_options o where o.id = k.option_id),
          'same', (select count(*) from picks k2 where k2.porra_id = p.id and k2.option_id = k.option_id)::int,
          'total', (select count(*) from picks k3 where k3.porra_id = p.id)::int
        ) as j
          from picks k
          join porras p on p.id = k.porra_id
          left join groups gr on gr.id = p.group_id
         where k.user_id = v_me and p.status = 'open' and not p.is_template
         order by p.closes_at
         limit 10
      ) x
    ), '[]'::jsonb),

    'resolved', coalesce((
      select jsonb_agg(x.j order by x.resolved_at desc nulls last)
      from (
        select p.resolved_at, jsonb_build_object(
          'slug', p.slug, 'title', p.title,
          'won', k.option_id = p.winning_option_id,
          'winner', (select o.label from porra_options o where o.id = p.winning_option_id),
          'winners', (select count(*) from picks w where w.porra_id = p.id and w.option_id = p.winning_option_id)::int,
          'total', (select count(*) from picks a where a.porra_id = p.id)::int,
          'punteria', coalesce((select ps.score from pick_scores ps
                                 where ps.user_id = v_me and ps.source = 'porra' and ps.ref_id = p.id), 0)
        ) as j
          from picks k
          join porras p on p.id = k.porra_id
         where k.user_id = v_me and p.status = 'resolved' and not p.is_template
         order by p.resolved_at desc nulls last
         limit 3
      ) x
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.home_groups() from public, anon;
grant execute on function public.home_groups() to authenticated;

notify pgrst, 'reload schema';
