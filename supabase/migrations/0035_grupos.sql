-- 0035 — Grupos que retienen (F-06 / R-02 del spec de lanzamiento, 21-sep-2026)
--  · groups.judge_id: juez del grupo, delegado por el admin (null = el admin).
--  · group_week_cutoff(): corte semanal FIJO domingo 20:00 UTC (el mismo que
--    la liga); el usuario ve su hora local en la UI.
--  · group_leaderboard(p_group): clasificación permanente por Puntería
--    (total + semana), solo miembros. Puntería = pick_scores (solo nace de
--    aciertos, nunca del importe). Fuera plantillas.
--  · set_group_judge(p_group, p_user): solo el admin del grupo; p_user miembro.
--  · group_streak(p_group): días seguidos (hora de Madrid) con ≥ 2 miembros
--    jugando (pick en porra o pique del día).
--  · group_recap(p_group, p_code, p_handle): datos del resumen semanal (PNG).
--    Accesible con el código de invitación —el mismo secreto que se comparte
--    por WhatsApp— para que el crawler de WhatsApp descargue la imagen sin
--    sesión. Sin código ni membresía → null.
-- Idempotente. No redefine funciones de otras migraciones. Ninguna función
-- escribe points.

alter table public.groups
  add column if not exists judge_id uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Corte semanal: último domingo 20:00 UTC ≤ p_at (= lunes 00:00 UTC − 4 h).
-- ---------------------------------------------------------------------------
create or replace function public.group_week_cutoff(p_at timestamptz default now())
returns timestamptz language sql stable as $$
  select (date_trunc('week', (p_at at time zone 'utc') + interval '4 hours') - interval '4 hours')
         at time zone 'utc'
$$;
grant execute on function public.group_week_cutoff(timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Filas internas de la clasificación (sin control de acceso: lo hacen los
-- envoltorios). rank = por Puntería total; la pestaña "Esta semana" reordena
-- en el cliente por skill_7d.
-- ---------------------------------------------------------------------------
create or replace function public.group_leaderboard_rows(p_group uuid)
returns table (user_id uuid, handle text, avatar_url text, title text,
               skill_total int, skill_7d int, picks_7d int, hits_7d int, rank int)
language sql stable security definer set search_path = public as $$
  with cut as (select public.group_week_cutoff() as at),
  m as (select gm.user_id from group_members gm where gm.group_id = p_group),
  sc as (
    -- Puntería: pick_scores de porras (no plantilla) y del pique del día.
    select s.user_id,
           sum(s.score)::int as total,
           coalesce(sum(s.score) filter (where s.created_at >= cut.at), 0)::int as week
    from pick_scores s
    cross join cut
    left join porras p on s.source = 'porra' and p.id = s.ref_id
    where s.user_id in (select user_id from m)
      and (s.source <> 'porra' or (p.id is not null and not p.is_template))
    group by s.user_id
  ),
  pk as (
    -- Actividad de la semana: picks hechos y aciertos resueltos desde el corte.
    select k.user_id,
           count(*) filter (where k.created_at >= cut.at)::int as picks_week,
           count(*) filter (where p.status = 'resolved' and p.resolved_at >= cut.at
                              and k.option_id = p.winning_option_id)::int as hits_week
    from picks k
    cross join cut
    join porras p on p.id = k.porra_id and not p.is_template
    where k.user_id in (select user_id from m)
    group by k.user_id
  )
  select m.user_id, pr.handle, pr.avatar_url, pr.title,
         coalesce(sc.total, 0), coalesce(sc.week, 0),
         coalesce(pk.picks_week, 0), coalesce(pk.hits_week, 0),
         (rank() over (order by coalesce(sc.total, 0) desc, coalesce(sc.week, 0) desc, pr.handle))::int
  from m
  join profiles pr on pr.id = m.user_id
  left join sc on sc.user_id = m.user_id
  left join pk on pk.user_id = m.user_id
  order by 9;
$$;
revoke execute on function public.group_leaderboard_rows(uuid) from public, anon, authenticated;

create or replace function public.group_leaderboard(p_group uuid)
returns table (user_id uuid, handle text, avatar_url text, title text,
               skill_total int, skill_7d int, picks_7d int, hits_7d int, rank int)
language sql stable security definer set search_path = public as $$
  select * from public.group_leaderboard_rows(p_group)
  where public.is_group_member(p_group) or public.is_admin();
$$;
revoke execute on function public.group_leaderboard(uuid) from public, anon;
grant execute on function public.group_leaderboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Juez del grupo: solo el admin (creador) lo nombra; debe ser miembro.
-- null = vuelve a ser el admin. Avisa al nuevo juez por el buzón.
-- ---------------------------------------------------------------------------
create or replace function public.set_group_judge(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g groups%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into g from groups where id = p_group for update;
  if not found then raise exception 'VINKO_NO_GROUP'; end if;
  if g.created_by <> auth.uid() and not public.is_admin() then
    raise exception 'VINKO_NOT_GROUP_ADMIN';
  end if;
  if p_user is not null
     and not exists (select 1 from group_members where group_id = p_group and user_id = p_user) then
    raise exception 'VINKO_NOT_MEMBER';
  end if;
  update groups set judge_id = p_user where id = p_group;
  if p_user is not null and p_user <> auth.uid() and p_user is distinct from g.judge_id then
    perform notify_user(p_user, 'social',
      'Eres el juez de ' || g.name,
      'El admin del grupo te ha nombrado juez: tú decides los resultados de sus porras.',
      '/g/' || g.id);
  end if;
end $$;
revoke execute on function public.set_group_judge(uuid, uuid) from public, anon;
grant execute on function public.set_group_judge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Racha de grupo (interna + envoltorio). Día = hora de Madrid. Cuenta hacia
-- atrás desde hoy si hoy ya cuenta; si no, desde ayer (el día aún no se ha
-- perdido). ≥ 2 miembros DISTINTOS con pick (porra no plantilla) o pique.
-- ---------------------------------------------------------------------------
create or replace function public.group_streak_days(p_group uuid)
returns int language sql stable security definer set search_path = public as $$
  with played as (
    select (k.created_at at time zone 'Europe/Madrid')::date as d, k.user_id
    from picks k join porras p on p.id = k.porra_id and not p.is_template
    where k.user_id in (select user_id from group_members where group_id = p_group)
      and k.created_at >= now() - interval '400 days'
    union all
    select (a.created_at at time zone 'Europe/Madrid')::date, a.user_id
    from daily_pick_answers a
    where a.user_id in (select user_id from group_members where group_id = p_group)
      and a.created_at >= now() - interval '400 days'
  ),
  days as (select d from played group by d having count(distinct user_id) >= 2),
  today as (select (now() at time zone 'Europe/Madrid')::date as d),
  anchor as (
    select case when exists (select 1 from days, today where days.d = today.d)
                then today.d else today.d - 1 end as d
    from today
  ),
  run as (
    select (anchor.d - days.d) as back,
           row_number() over (order by days.d desc) - 1 as rn
    from days, anchor where days.d <= anchor.d
  )
  -- back = rn mientras no haya hueco; al primer hueco back > rn para siempre.
  select coalesce((select count(*)::int from run where back = rn), 0);
$$;
revoke execute on function public.group_streak_days(uuid) from public, anon, authenticated;

create or replace function public.group_streak(p_group uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_group_member(p_group) or public.is_admin()
              then public.group_streak_days(p_group) else 0 end;
$$;
revoke execute on function public.group_streak(uuid) from public, anon;
grant execute on function public.group_streak(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen de la semana (datos del PNG). Acceso: miembro, admin o código de
-- invitación correcto (anon incluido: así WhatsApp descarga la imagen).
--   podium: top 3 por Puntería de la semana (desempate: total, handle)
--   me:     posición semanal de p_handle si es miembro (+ su mejor acierto)
--   best:   mejor acierto de la semana del grupo (score más alto)
-- ---------------------------------------------------------------------------
create or replace function public.group_recap(p_group uuid, p_code text default null, p_handle text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g groups%rowtype;
  v_cut timestamptz := public.group_week_cutoff();
  v_me uuid;
  v_out jsonb;
begin
  select * into g from groups where id = p_group;
  if not found then return null; end if;
  if not (public.is_group_member(p_group) or public.is_admin()
          or (p_code is not null and lower(p_code) = g.invite_code)) then
    return null;
  end if;
  if p_handle is not null then
    select pr.id into v_me from profiles pr
    join group_members gm on gm.user_id = pr.id and gm.group_id = p_group
    where pr.handle = lower(p_handle);
  end if;

  with lb as (
    select r.*, (rank() over (order by r.skill_7d desc, r.skill_total desc, r.handle))::int as rank_week
    from public.group_leaderboard_rows(p_group) r
  ),
  hits as (
    select s.user_id, pr.handle, s.score, p.title as porra_title
    from pick_scores s
    join porras p on p.id = s.ref_id and not p.is_template
    join profiles pr on pr.id = s.user_id
    where s.source = 'porra' and s.created_at >= v_cut
      and s.user_id in (select user_id from group_members where group_id = p_group)
  )
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'members', (select count(*) from lb),
    'streak', public.group_streak_days(p_group),
    'cutoff', v_cut,
    'podium', (select coalesce(jsonb_agg(jsonb_build_object(
                 'handle', r.handle, 'avatar_url', r.avatar_url,
                 'skill_7d', r.skill_7d, 'skill_total', r.skill_total, 'rank', r.rank_week)
                 order by r.rank_week, r.handle), '[]'::jsonb)
               from (select * from lb order by rank_week, handle limit 3) r),
    'me', case when v_me is null then null else
            (select jsonb_build_object(
               'handle', r.handle, 'rank', r.rank_week, 'skill_7d', r.skill_7d,
               'skill_total', r.skill_total,
               'best', (select jsonb_build_object('score', h.score, 'porra_title', h.porra_title)
                        from hits h where h.user_id = v_me order by h.score desc limit 1))
             from lb r where r.user_id = v_me) end,
    'best', (select jsonb_build_object('handle', h.handle, 'score', h.score, 'porra_title', h.porra_title)
             from hits h order by h.score desc, h.handle limit 1)
  ) into v_out;
  return v_out;
end $$;
revoke execute on function public.group_recap(uuid, text, text) from public;
grant execute on function public.group_recap(uuid, text, text) to anon, authenticated;

create index if not exists pick_scores_user_created_idx on public.pick_scores (user_id, created_at);
create index if not exists daily_pick_answers_user_created_idx on public.daily_pick_answers (user_id, created_at);

notify pgrst, 'reload schema';
