-- ============================================================================
-- VINKO — 0007: rachas (§3.4), ligas (§3.5), temporada (§3.7) y motor de
-- monedas. Todas las mutaciones son security definer; el cliente jamás
-- escribe monedas.
-- ============================================================================

-- ---------- temporada ----------
create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  number     int unique not null,
  name       text not null,
  starts_at  date not null,
  ends_at    date not null
);
alter table public.seasons enable row level security;
create policy seasons_read on public.seasons for select using (true);
create policy seasons_admin on public.seasons
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.seasons (number, name, starts_at, ends_at)
values (1, 'Temporada 1', '2026-09-14', '2026-10-25');

create table public.season_progress (
  season_id uuid not null references public.seasons(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  xp        int not null default 0,
  tier      int not null default 0,
  primary key (season_id, user_id)
);
alter table public.season_progress enable row level security;
create policy sp_read on public.season_progress for select using (true);

-- cosméticos ganados (tiers, hitos, liga)
create table public.user_cosmetics (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code       text not null,
  kind       text not null check (kind in ('title','frame','emblem','shield')),
  season_num int,
  created_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.user_cosmetics enable row level security;
create policy cosmetics_read on public.user_cosmetics for select using (true);

-- ---------- ligas ----------
create table public.league_groups (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null,             -- lunes UTC (corte único domingo 23:59 UTC)
  division   text not null check (division in ('bronce','plata','oro','diamante','leyenda')),
  seq        int not null,
  closed     boolean not null default false,
  unique (week_start, division, seq)
);
create table public.league_members (
  group_id uuid not null references public.league_groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  score    int not null default 0,
  primary key (group_id, user_id)
);
create unique index league_one_group_per_week
  on public.league_members (user_id, group_id);
alter table public.league_groups  enable row level security;
alter table public.league_members enable row level security;
create policy lg_read on public.league_groups  for select using (true);
create policy lm_read on public.league_members for select using (true);

create or replace function public.league_week_start(p_at timestamptz default now())
returns date language sql stable as
$$ select (date_trunc('week', p_at at time zone 'UTC'))::date $$;

-- ---------- XP (progresión permanente; ancla de temporada) ----------
create or replace function public.award_xp(p_user uuid, p_amount int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons%rowtype;
  v_misc jsonb := cfg('misc');
  v_tier_xp int := coalesce((v_misc->>'season_tier_xp')::int, 1000);
  v_tiers   int := coalesce((v_misc->>'season_tiers')::int, 40);
  v_amount  int := greatest(p_amount, 0);
  v_prog season_progress%rowtype;
  v_new_tier int;
  v_boost boolean;
begin
  if v_amount = 0 then return; end if;
  -- boost temporal de anuncio R6 (+50% XP 2 h)
  select exists (
    select 1 from user_items where user_id = p_user and code = 'xp_boost_2h'
      and expires_at > now()
  ) into v_boost;
  if v_boost then v_amount := round(v_amount * 1.5); end if;

  select * into v_season from seasons
    where current_date between starts_at and ends_at
    order by number desc limit 1;

  if found then
    -- recuperación: ×1.5 en la última semana si va por debajo del 60% (§3.7)
    if v_season.ends_at - current_date < 7 then
      select * into v_prog from season_progress
        where season_id = v_season.id and user_id = p_user;
      if not found or v_prog.xp < (v_tier_xp * v_tiers
          * coalesce((v_misc->>'season_catchup_below')::numeric, 0.6)) then
        v_amount := round(v_amount * coalesce((v_misc->>'season_catchup_mult')::numeric, 1.5));
      end if;
    end if;
    insert into season_progress (season_id, user_id, xp)
      values (v_season.id, p_user, v_amount)
      on conflict (season_id, user_id) do update
      set xp = season_progress.xp + excluded.xp;
    -- tiers nuevos → cosmético + buzón
    select * into v_prog from season_progress
      where season_id = v_season.id and user_id = p_user;
    v_new_tier := least(v_prog.xp / v_tier_xp, v_tiers);
    if v_new_tier > v_prog.tier then
      update season_progress set tier = v_new_tier
        where season_id = v_season.id and user_id = p_user;
      insert into user_cosmetics (user_id, code, kind, season_num)
        values (p_user, 't' || v_season.number || '_tier_' || v_new_tier, 'emblem', v_season.number)
        on conflict do nothing;
      perform notify_user(p_user, 'sistema',
        'Nivel ' || v_new_tier || ' de temporada desbloqueado',
        'Sigue sumando pronósticos para el siguiente emblema.', '/temporada');
    end if;
  end if;

  update profiles set xp = xp + v_amount where id = p_user;
end $$;
revoke execute on function public.award_xp(uuid, int) from public, anon, authenticated;

-- ---------- marcador (§3.2) + liga semanal ----------
create or replace function public.award_score(
  p_user uuid, p_score int, p_source text, p_ref uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week date := league_week_start();
  v_div text;
  v_group uuid;
  v_size int := coalesce((cfg('misc')->>'league_size')::int, 25);
begin
  if p_score <= 0 then return; end if;
  insert into pick_scores (user_id, source, ref_id, score, week_start)
    values (p_user, p_source, p_ref, p_score, v_week)
    on conflict (user_id, source, ref_id) do nothing;
  if not found then return; end if;
  update profiles set marcador_total = marcador_total + p_score where id = p_user;

  -- asignación de liga: primer marcador de la semana te mete en un grupo
  -- de tu división con hueco (<25); si no hay, se abre otro (cohorte por orden
  -- de llegada — matchmaking simple del alfa).
  select division into v_div from profiles where id = p_user;
  select lm.group_id into v_group
    from league_members lm join league_groups lg on lg.id = lm.group_id
    where lm.user_id = p_user and lg.week_start = v_week;
  if v_group is null then
    perform pg_advisory_xact_lock(hashtext('league' || v_week::text || v_div));
    select lg.id into v_group
      from league_groups lg
      where lg.week_start = v_week and lg.division = v_div and not lg.closed
        and (select count(*) from league_members m where m.group_id = lg.id) < v_size
      order by lg.seq limit 1;
    if v_group is null then
      insert into league_groups (week_start, division, seq)
        values (v_week, v_div,
          coalesce((select max(seq) + 1 from league_groups
            where week_start = v_week and division = v_div), 1))
        returning id into v_group;
    end if;
    insert into league_members (group_id, user_id) values (v_group, p_user)
      on conflict do nothing;
  end if;
  update league_members set score = score + p_score
    where group_id = v_group and user_id = p_user;
end $$;
revoke execute on function public.award_score(uuid, int, text, uuid) from public, anon, authenticated;

-- ---------- racha (§3.4): cuenta PARTICIPACIÓN, no acierto ----------
create or replace function public.touch_streak(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_today date := madrid_today();
  v_gap int;
  v_eco jsonb := cfg('economy');
  v_mile jsonb;
begin
  select * into p from profiles where id = p_user for update;
  if not found then return; end if;

  -- regen de escudo: 1 gratis por semana (lunes)
  if p.shield_regen_week is distinct from date_trunc('week', v_today)::date then
    update profiles set
      streak_shields = greatest(streak_shields, 1),
      shield_regen_week = date_trunc('week', v_today)::date
      where id = p_user;
    select * into p from profiles where id = p_user;
  end if;

  if p.streak_last = v_today then return; end if;
  v_gap := coalesce(v_today - p.streak_last, 999);

  if v_gap = 1 then
    update profiles set streak_days = streak_days + 1, streak_last = v_today,
      streak_best = greatest(streak_best, streak_days + 1) where id = p_user;
  elsif v_gap = 2 and p.streak_shields > 0 then
    -- el escudo se aplica automáticamente al día fallado
    update profiles set streak_days = streak_days + 1, streak_last = v_today,
      streak_shields = streak_shields - 1,
      streak_best = greatest(streak_best, streak_days + 1) where id = p_user;
    perform notify_user(p_user, 'racha', 'Tu escudo salvó la racha',
      'Fallaste un día y el escudo lo cubrió. Sigues en ' || (p.streak_days + 1) || ' días.', '/hoy');
  else
    -- rota: si era ≥7, ventana de rescate de 24 h (placement R1)
    if p.streak_days >= 7 then
      update profiles set streak_broken_days = streak_days,
        streak_recover_until = now() + interval '24 hours',
        streak_days = 1, streak_last = v_today where id = p_user;
      perform notify_user(p_user, 'racha',
        'Puedes recuperar tu racha de ' || p.streak_days || ' días',
        'Tienes hasta mañana para recuperarla viendo un anuncio.', '/saldo');
    else
      update profiles set streak_days = 1, streak_last = v_today where id = p_user;
    end if;
  end if;

  -- hitos (3,7,14,30,60,100,365) con recompensa
  select * into p from profiles where id = p_user;
  v_mile := (v_eco->'streak_milestones') -> (p.streak_days::text);
  if v_mile is not null then
    update profiles set points = points + coalesce((v_mile->>'pts')::int, 0) where id = p_user;
    perform award_xp(p_user, coalesce((v_mile->>'xp')::int, 0));
    perform notify_user(p_user, 'racha',
      '¡Racha de ' || p.streak_days || ' días!',
      '+' || coalesce((v_mile->>'pts')::int, 0) || ' puntos y +' ||
      coalesce((v_mile->>'xp')::int, 0) || ' XP por tu constancia.', '/hoy');
  end if;
end $$;
revoke execute on function public.touch_streak(uuid) from public, anon, authenticated;

create or replace function public.streak_mult(p_user uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select 1 + least(coalesce((select streak_days from profiles where id = p_user), 0), 10)
    * coalesce((cfg('economy')->>'streak_multiplier_step')::numeric, 0.02)
$$;
revoke execute on function public.streak_mult(uuid) from public, anon, authenticated;

-- ---------- grifos de PTS: goteo + bonus diario (§3.8) ----------
create or replace function public.claim_drip() returns int
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_eco jsonb := cfg('economy');
  v_amt int := coalesce((v_eco->>'drip_amount')::int, 100);
  v_int int := coalesce((v_eco->>'drip_interval_h')::int, 4);
  v_cap int := coalesce((v_eco->>'cap_pts')::int, 7500);
  v_ticks int; v_grant int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if p.points >= v_cap then
    update profiles set last_drip = now() where id = p.id; -- el goteo no corre sobre el techo
    return 0;
  end if;
  v_ticks := floor(extract(epoch from (now() - p.last_drip)) / (v_int * 3600));
  if v_ticks <= 0 then return 0; end if;
  v_grant := least(v_ticks * v_amt, v_cap - p.points);
  update profiles set points = points + v_grant,
    last_drip = p.last_drip + (v_ticks * v_int || ' hours')::interval
    where id = p.id;
  return v_grant;
end $$;
grant execute on function public.claim_drip() to authenticated;

create or replace function public.claim_daily_bonus() returns int
language plpgsql security definer set search_path = public as $$
declare
  p profiles%rowtype;
  v_eco jsonb := cfg('economy');
  v_today date := madrid_today();
  v_step int; v_amt int;
  v_ladder jsonb := coalesce(v_eco->'daily_bonus', '[50,75,100,150,200,300,500]'::jsonb);
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into p from profiles where id = auth.uid() for update;
  if p.daily_bonus_last = v_today then return 0; end if;
  if p.daily_bonus_last = v_today - 1 then
    v_step := least(p.daily_bonus_step + 1, jsonb_array_length(v_ladder));
  else
    v_step := 1; -- se rompió la escalera
  end if;
  v_amt := coalesce((v_ladder ->> (v_step - 1))::int, 50);
  update profiles set points = points + v_amt,
    daily_bonus_step = v_step, daily_bonus_last = v_today where id = p.id;
  perform award_xp(p.id, 10);
  perform touch_streak(p.id);
  return v_amt;
end $$;
grant execute on function public.claim_daily_bonus() to authenticated;
