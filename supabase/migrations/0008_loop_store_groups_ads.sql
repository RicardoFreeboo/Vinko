-- ============================================================================
-- VINKO — 0008: loop jugable v2 (pick con XP/racha/marcador), pronóstico del
-- día, tienda de boosts (sumideros §3.8), grupos (§3.6), referidos y ads v2
-- (placements R1–R6, §4.3). Crédito de anuncios: NUNCA marcador (§0.2).
-- ============================================================================

-- ---------- inventario / boosts (sumideros) ----------
create table public.store_items (
  code   text primary key,
  kind   text not null check (kind in ('shield','double','wildcard','frame','group_shield','feature')),
  cost   int  not null check (cost > 0),
  meta   jsonb not null default '{}',
  active boolean not null default true
);
alter table public.store_items enable row level security;
create policy store_read on public.store_items for select using (true);
create policy store_admin on public.store_items
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.store_items (code, kind, cost, meta) values
('shield_extra',  'shield',       500,  '{"name": "Escudo de racha extra"}'),
('double',        'double',       400,  '{"name": "Doble o nada"}'),
('wildcard',      'wildcard',     750,  '{"name": "Comodín: cambia un pronóstico"}'),
('frame_bronze',  'frame',        1000, '{"name": "Marco bronce"}'),
('frame_gold',    'frame',        2500, '{"name": "Marco dorado"}'),
('frame_legend',  'frame',        5000, '{"name": "Marco leyenda"}'),
('group_shield',  'group_shield', 3000, '{"name": "Escudo de grupo"}'),
('feature_porra', 'feature',      2000, '{"name": "Destacar porra 24 h"}');

create table public.user_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code       text not null references public.store_items(code),
  target_id  uuid,
  expires_at timestamptz,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.user_items enable row level security;
create policy items_read_own on public.user_items for select using (user_id = auth.uid());
create index user_items_user_idx on public.user_items (user_id, code);

create table public.purchases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code       text not null,
  cost       int  not null,
  created_at timestamptz not null default now()
);
alter table public.purchases enable row level security;
create policy purchases_read_own on public.purchases for select using (user_id = auth.uid());

alter table public.porras add column featured_until timestamptz;
alter table public.picks  add column boost text check (boost in ('double'));

create or replace function public.buy_item(p_code text, p_target uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare it store_items%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into it from store_items where code = p_code and active for update;
  if not found then raise exception 'VINKO_NO_ITEM'; end if;
  update profiles set points = points - it.cost
    where id = auth.uid() and points >= it.cost;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;
  insert into purchases (user_id, code, cost) values (auth.uid(), p_code, it.cost);

  if it.kind = 'shield' then
    update profiles set streak_shields = least(streak_shields + 1, 2) where id = auth.uid();
  elsif it.kind = 'double' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    update picks set boost = 'double'
      where porra_id = p_target and user_id = auth.uid() and boost is null
      and exists (select 1 from porras p where p.id = p_target and p.status = 'open' and p.closes_at > now());
    if not found then raise exception 'VINKO_BAD_TARGET'; end if;
  elsif it.kind = 'wildcard' then
    insert into user_items (user_id, code) values (auth.uid(), p_code);
  elsif it.kind = 'frame' then
    insert into user_cosmetics (user_id, code, kind) values (auth.uid(), p_code, 'frame')
      on conflict do nothing;
    update profiles set frame = p_code where id = auth.uid();
  elsif it.kind = 'group_shield' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    insert into user_items (user_id, code, target_id) values (auth.uid(), p_code, p_target);
  elsif it.kind = 'feature' then
    if p_target is null then raise exception 'VINKO_NO_TARGET'; end if;
    update porras set featured_until = now() + interval '24 hours'
      where id = p_target and created_by = auth.uid() and status = 'open';
    if not found then raise exception 'VINKO_BAD_TARGET'; end if;
  end if;
end $$;
grant execute on function public.buy_item(text, uuid) to authenticated;

-- comodín: cambiar un pronóstico ya enviado antes del cierre (consume 1 wildcard)
create or replace function public.change_pick(p_porra uuid, p_option uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_item uuid;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select id into v_item from user_items
    where user_id = auth.uid() and code = 'wildcard' and used_at is null
    order by created_at limit 1 for update;
  if v_item is null then raise exception 'VINKO_NO_WILDCARD'; end if;
  if not exists (select 1 from porras p where p.id = p_porra and p.status = 'open' and p.closes_at > now()) then
    raise exception 'VINKO_CLOSED';
  end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update picks set option_id = p_option
    where porra_id = p_porra and user_id = auth.uid();
  if not found then raise exception 'VINKO_NO_PICK'; end if;
  update user_items set used_at = now(), target_id = p_porra where id = v_item;
end $$;
grant execute on function public.change_pick(uuid, uuid) to authenticated;

-- ---------- loop v2: pick con XP (cap 5/día) + racha ----------
create or replace function public.make_pick(p_porra uuid, p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_eco jsonb := cfg('economy');
  v_xp_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' or v.closes_at <= now() then raise exception 'VINKO_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_option and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update profiles set points = points - 10 where id = auth.uid() and points >= 10;
  if not found then raise exception 'VINKO_NO_POINTS'; end if;
  insert into picks (porra_id, user_id, option_id) values (p_porra, auth.uid(), p_option);

  -- XP por participar (cap diario) + racha
  select count(*) into v_xp_today from picks
    where user_id = auth.uid()
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_xp_today <= coalesce((v_eco->>'pick_xp_daily_cap')::int, 5) then
    perform award_xp(auth.uid(), coalesce((v_eco->>'pick_xp')::int, 15));
  end if;
  perform touch_streak(auth.uid());
end $$;

-- crear porra: XP (cap 3/día) + racha, vía trigger (el insert es del cliente)
create or replace function public.on_porra_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_eco jsonb := cfg('economy'); v_today int;
begin
  if new.source = 'user' and new.created_by is not null then
    select count(*) into v_today from porras
      where created_by = new.created_by and source = 'user'
        and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
    if v_today <= coalesce((v_eco->>'create_xp_daily_cap')::int, 3) then
      perform award_xp(new.created_by, coalesce((v_eco->>'create_xp')::int, 100));
    end if;
    perform touch_streak(new.created_by);
  end if;
  return new;
end $$;
drop trigger if exists trg_porra_created on public.porras;
create trigger trg_porra_created after insert on public.porras
  for each row execute function public.on_porra_created();

-- resolver v2: bote de PTS (igual) + MARCADOR ponderado por dificultad (§3.2)
-- score = round((20 + 100×(1−p_correcta)) × mult_racha) [× doble-o-nada]
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_total int; v_winners int; v_share int;
  v_eco jsonb := cfg('economy');
  v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100);
  v_p numeric;
  r record;
  v_score int;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.created_by is distinct from auth.uid() then raise exception 'VINKO_NOT_CREATOR'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  if not exists (select 1 from porra_options where id = p_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update porras set status = 'resolved', winning_option_id = p_winning where id = p_porra;
  select count(*) into v_total   from picks where porra_id = p_porra;
  select count(*) into v_winners from picks where porra_id = p_porra and option_id = p_winning;
  if v_winners > 0 then
    v_share := floor((v_total * 10)::numeric / v_winners);
    v_p := v_winners::numeric / v_total;  -- p_correcta congelada al resolver
    for r in select k.user_id, k.boost from picks k
             where k.porra_id = p_porra and k.option_id = p_winning loop
      update profiles set points = points + v_share where id = r.user_id;
      v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
      if r.boost = 'double' then v_score := v_score * 2; end if;
      perform award_score(r.user_id, v_score, 'porra', p_porra);
      perform notify_user(r.user_id, 'resolucion',
        'Acertaste: ' || left(v.title, 60),
        '+' || v_share || ' puntos y +' || v_score || ' al marcador.', '/p/' || v.slug);
    end loop;
  end if;
  -- doble-o-nada fallido = marcador 0 (ya es 0) y aviso a los no acertantes con boost
  for r in select k.user_id from picks k
           where k.porra_id = p_porra and k.option_id <> p_winning and k.boost = 'double' loop
    perform notify_user(r.user_id, 'resolucion',
      'Doble o nada: esta vez nada', 'Fallaste el pronóstico con doble o nada.', '/p/' || v.slug);
  end loop;
end $$;

-- ---------- pronóstico del día (§3.3) ----------
create or replace function public.answer_daily(p_day uuid, p_idx smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d daily_picks%rowtype;
  v_eco jsonb := cfg('economy');
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into d from daily_picks where id = p_day for update;
  if not found or d.status <> 'open' then raise exception 'VINKO_CLOSED'; end if;
  if d.scheduled_for <> madrid_today() then raise exception 'VINKO_CLOSED'; end if;
  if p_idx < 0 or p_idx >= jsonb_array_length(d.options) then raise exception 'VINKO_BAD_OPTION'; end if;
  insert into daily_pick_answers (day_id, user_id, option_idx, pts, xp)
    values (p_day, auth.uid(), p_idx,
      coalesce((v_eco->>'daily_pick_pts')::int, 150),
      coalesce((v_eco->>'daily_pick_xp')::int, 10));
  update profiles set points = points + coalesce((v_eco->>'daily_pick_pts')::int, 150)
    where id = auth.uid();
  perform award_xp(auth.uid(), coalesce((v_eco->>'daily_pick_xp')::int, 10));
  perform touch_streak(auth.uid());
end $$;
grant execute on function public.answer_daily(uuid, smallint) to authenticated;

-- resolver el día (admin): PTS + XP extra a acertantes + marcador §3.2
create or replace function public.resolve_daily(p_day uuid, p_correct smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d daily_picks%rowtype;
  v_eco jsonb := cfg('economy');
  v_total int; v_hits int; v_p numeric;
  r record; v_score int;
  v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100);
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into d from daily_picks where id = p_day for update;
  if not found or d.status not in ('open') then raise exception 'VINKO_BAD_STATE'; end if;
  update daily_picks set status = 'resolved', correct_idx = p_correct where id = p_day;
  select count(*) into v_total from daily_pick_answers where day_id = p_day;
  if v_total = 0 then return; end if;
  select count(*) into v_hits from daily_pick_answers where day_id = p_day and option_idx = p_correct;
  update daily_pick_answers set correct = (option_idx = p_correct) where day_id = p_day;
  if v_hits = 0 then return; end if;
  v_p := v_hits::numeric / v_total;
  for r in select user_id from daily_pick_answers where day_id = p_day and option_idx = p_correct loop
    v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
    update profiles set points = points + coalesce((v_eco->>'daily_pick_hit_pts')::int, 300)
      where id = r.user_id;
    perform award_xp(r.user_id, coalesce((v_eco->>'daily_pick_hit_xp')::int, 25));
    perform award_score(r.user_id, v_score, 'daily', p_day);
    update daily_pick_answers set
      pts = pts + coalesce((v_eco->>'daily_pick_hit_pts')::int, 300),
      xp = xp + coalesce((v_eco->>'daily_pick_hit_xp')::int, 25),
      score = v_score
      where day_id = p_day and user_id = r.user_id;
    perform notify_user(r.user_id, 'resolucion',
      'Acertaste el pronóstico del día',
      '+' || coalesce((v_eco->>'daily_pick_hit_pts')::int, 300) || ' puntos y +' || v_score || ' al marcador.', '/hoy');
  end loop;
end $$;
grant execute on function public.resolve_daily(uuid, smallint) to authenticated;

-- ---------- grupos (§3.6) ----------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 3 and 40),
  invite_code text unique not null default encode(gen_random_bytes(4), 'hex'),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  shield      boolean not null default false,
  created_at  timestamptz not null default now()
);
create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table public.group_reactions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  porra_id   uuid not null,
  target_user uuid not null references public.profiles(id) on delete cascade,
  reactor    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('🔥','😂','👏','😮','💀')),
  created_at timestamptz not null default now(),
  unique (group_id, porra_id, target_user, reactor)
);
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.group_reactions enable row level security;
create policy groups_read_member on public.groups for select using (
  exists (select 1 from group_members m where m.group_id = id and m.user_id = auth.uid())
  or created_by = auth.uid() or public.is_admin()
);
create policy gm_read_member on public.group_members for select using (
  exists (select 1 from group_members m where m.group_id = group_members.group_id and m.user_id = auth.uid())
  or public.is_admin()
);
create policy gr_read_member on public.group_reactions for select using (
  exists (select 1 from group_members m where m.group_id = group_reactions.group_id and m.user_id = auth.uid())
);
create policy gr_insert_member on public.group_reactions for insert with check (
  reactor = auth.uid()
  and exists (select 1 from group_members m where m.group_id = group_reactions.group_id and m.user_id = auth.uid())
);

create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  insert into groups (name, created_by) values (p_name, auth.uid()) returning id into g;
  insert into group_members (group_id, user_id) values (g, auth.uid());
  return g;
end $$;
grant execute on function public.create_group(text) to authenticated;

create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g groups%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into g from groups where invite_code = lower(p_code);
  if not found then raise exception 'VINKO_NO_GROUP'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid())
    on conflict do nothing;
  perform notify_user(g.created_by, 'social',
    'Alguien nuevo en ' || g.name,
    'Un amigo ha entrado en tu grupo.', '/g/' || g.id);
  return g.id;
end $$;
grant execute on function public.join_group(text) to authenticated;

-- ---------- referidos (200 a los dos, cap 10/día del invitador) ----------
alter table public.profiles add column referred_by uuid references public.profiles(id);
create or replace function public.claim_referral(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inviter profiles%rowtype;
  v_eco jsonb := cfg('economy');
  v_amt int := coalesce((v_eco->>'invite_pts')::int, 200);
  v_cap int := coalesce((v_eco->>'invite_daily_cap')::int, 10);
  v_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v_inviter from profiles where handle = lower(p_handle);
  if not found or v_inviter.id = auth.uid() then return; end if;
  if exists (select 1 from profiles where id = auth.uid() and referred_by is not null) then return; end if;
  select count(*) into v_today from profiles
    where referred_by = v_inviter.id
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  update profiles set referred_by = v_inviter.id, points = points + v_amt where id = auth.uid();
  if v_today < v_cap then
    update profiles set points = points + v_amt where id = v_inviter.id;
    perform award_xp(v_inviter.id, 50);
    perform notify_user(v_inviter.id, 'social', 'Tu invitación funcionó',
      '+' || v_amt || ' puntos: un amigo ha entrado con tu enlace.', '/grupos');
  end if;
end $$;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------- ads v2 (R1–R6): crédito SOLO servidor, JAMÁS marcador ----------
alter table public.ad_impressions
  drop constraint ad_impressions_amount_check,
  add column slot text not null default 'R2',
  add column reward_type text not null default 'pts';

create table public.user_unlocks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('analysis')),
  expires_at timestamptz not null,
  primary key (user_id, kind)
);
alter table public.user_unlocks enable row level security;
create policy unlocks_read_own on public.user_unlocks for select using (user_id = auth.uid());

create or replace function public.grant_ad_reward_v2(
  p_user uuid, p_impression text, p_slot text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ads jsonb := cfg('ads');
  v_slot jsonb := v_ads->'slots'->p_slot;
  v_adult boolean;
  v_completed_today int;
  v_slot_used int;
  v_reward text; v_value int;
  p profiles%rowtype;
begin
  if v_slot is null then raise exception 'VINKO_BAD_SLOT'; end if;
  select (birth_year is not null and (extract(year from now())::int - birth_year) >= 18)
    into v_adult from profiles where id = p_user;
  if not coalesce(v_adult, false) then raise exception 'VINKO_NOT_ADULT'; end if;
  if exists (select 1 from ad_impressions where impression_id = p_impression) then
    return jsonb_build_object('granted', 0, 'reward', 'duplicate');
  end if;
  -- tope global de completados (4/día, §4.3)
  select count(*) into v_completed_today from ad_impressions
    where user_id = p_user and status = 'granted'
      and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
  if v_completed_today >= coalesce((v_ads->>'rewarded_daily_complete_cap')::int, 4) then
    raise exception 'VINKO_AD_CAP';
  end if;
  -- topes por slot
  if v_slot ? 'cap_day' then
    select count(*) into v_slot_used from ad_impressions
      where user_id = p_user and slot = p_slot and status = 'granted'
        and (created_at at time zone 'Europe/Madrid')::date = madrid_today();
    if v_slot_used >= (v_slot->>'cap_day')::int then raise exception 'VINKO_AD_CAP'; end if;
  end if;
  if v_slot ? 'cap_week' then
    select count(*) into v_slot_used from ad_impressions
      where user_id = p_user and slot = p_slot and status = 'granted'
        and created_at >= date_trunc('week', now());
    if v_slot_used >= (v_slot->>'cap_week')::int then raise exception 'VINKO_AD_CAP'; end if;
  end if;
  if v_slot ? 'cap_month' then
    select count(*) into v_slot_used from ad_impressions
      where user_id = p_user and slot = p_slot and status = 'granted'
        and created_at >= date_trunc('month', now());
    if v_slot_used >= (v_slot->>'cap_month')::int then raise exception 'VINKO_AD_CAP'; end if;
  end if;

  v_reward := v_slot->>'reward';
  v_value  := coalesce((v_slot->>'value')::int, 0);
  insert into ad_impressions (user_id, impression_id, amount, status, slot, reward_type)
    values (p_user, p_impression, v_value, 'granted', p_slot, v_reward);

  if v_reward = 'pts' then
    update profiles set points = points + v_value where id = p_user;
  elsif v_reward = 'shield' then
    update profiles set streak_shields = least(streak_shields + 1, 2) where id = p_user;
  elsif v_reward = 'streak_recover' then
    select * into p from profiles where id = p_user for update;
    if p.streak_recover_until is null or p.streak_recover_until < now()
       or p.streak_broken_days <= 0 then
      raise exception 'VINKO_NO_RECOVERY';
    end if;
    update profiles set streak_days = p.streak_broken_days + 1,
      streak_best = greatest(streak_best, p.streak_broken_days + 1),
      streak_broken_days = 0, streak_recover_until = null,
      streak_last = madrid_today() where id = p_user;
    v_value := p.streak_broken_days;
  elsif v_reward = 'xp' then
    perform award_xp(p_user, v_value);       -- XP, jamás marcador (§0.2)
  elsif v_reward = 'analysis_24h' then
    insert into user_unlocks (user_id, kind, expires_at)
      values (p_user, 'analysis', now() + interval '24 hours')
      on conflict (user_id, kind) do update set expires_at = now() + interval '24 hours';
  elsif v_reward = 'xp_boost_2h' then
    insert into user_items (user_id, code, expires_at)
      values (p_user, 'xp_boost_2h', now() + interval '2 hours');
  end if;
  return jsonb_build_object('granted', 1, 'reward', v_reward, 'value', v_value);
end $$;
revoke execute on function public.grant_ad_reward_v2(uuid, text, text) from public, anon, authenticated;

-- xp_boost_2h no se compra: entra solo por anuncio (R6); alta como item pasivo
insert into public.store_items (code, kind, cost, meta, active)
  values ('xp_boost_2h', 'shield', 1, '{"name": "Boost XP 2h (solo anuncio)"}', false);
