-- ============================================================================
-- VINKO — 0013: scaffolding de vídeo de porra (spec vídeo A) + controles del
-- agente (B/C/D: botón actualizar + buscador de tema, con cooldown y tope).
-- El worker ffmpeg (Railway) y la generación IA (Higgsfield, con dry-run) van
-- aparte: aquí queda la BD y las reglas. La recompensa por vídeo NUNCA toca la
-- Puntería (§0.2). Nada se paga antes de aprobar (anti-farmeo).
-- ============================================================================

-- biblioteca de fondos por categoría (se rellena 1 vez con IA, con dry-run)
create table public.video_backgrounds (
  id         uuid primary key default gen_random_uuid(),
  category   text not null,
  url        text not null,            -- Bunny Stream
  duration_s numeric,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.video_backgrounds enable row level security;
create policy vbg_read on public.video_backgrounds for select using (true);
create policy vbg_admin on public.video_backgrounds
  for all using (public.is_admin()) with check (public.is_admin());

-- columnas de vídeo en porras
alter table public.porras
  add column video_url       text,     -- vídeo final servido (Bunny)
  add column user_video_url  text,     -- vídeo subido por el creador (sin moderar)
  add column video_status    text not null default 'none'
    check (video_status in ('none','pending','processing','ready','rejected')),
  add column category        text;     -- para elegir fondo/plantilla

-- recompensa por subir vídeo (se paga SOLO al aprobar; cap diario; nunca marcador)
create table public.video_rewards (
  porra_id   uuid primary key references public.porras(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null,
  created_at timestamptz not null default now()
);
alter table public.video_rewards enable row level security;
create policy vr_read_own on public.video_rewards for select using (user_id = auth.uid() or public.is_admin());

insert into public.remote_config (key, value) values
('video', '{
  "user_upload_reward_pts": 400, "user_upload_reward_xp": 50,
  "user_upload_daily_cap": 3, "max_duration_s": 15,
  "safe_top_px": 250, "safe_bottom_px": 320,
  "mvp_categories": ["futbol","reality","musica","internet"], "backgrounds_per_category": 3
}'::jsonb)
on conflict (key) do nothing;

-- aprobar vídeo de usuario (admin): marca ready + paga la recompensa (una vez,
-- cap diario). El vídeo NO es público hasta esto (antes: fallback ffmpeg).
create or replace function public.approve_user_video(p_porra uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_cfg jsonb := cfg('video'); v_amt int; v_xp int; v_today int;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into v from porras where id = p_porra for update;
  if not found or v.user_video_url is null then raise exception 'VINKO_NO_VIDEO'; end if;
  if exists (select 1 from video_rewards where porra_id = p_porra) then
    -- ya recompensado: solo re-publica
    update porras set video_url = user_video_url, video_status = 'ready' where id = p_porra;
    return 0;
  end if;
  v_amt := coalesce((v_cfg->>'user_upload_reward_pts')::int, 400);
  v_xp  := coalesce((v_cfg->>'user_upload_reward_xp')::int, 50);
  select count(*) into v_today from video_rewards
    where user_id = v.created_by and created_at::date = current_date;
  update porras set video_url = user_video_url, video_status = 'ready' where id = p_porra;
  if v.created_by is not null and v_today < coalesce((v_cfg->>'user_upload_daily_cap')::int, 3) then
    insert into video_rewards (porra_id, user_id, amount) values (p_porra, v.created_by, v_amt);
    update profiles set points = points + v_amt where id = v.created_by;
    perform award_xp(v.created_by, v_xp);   -- XP, jamás marcador (§0.2)
    perform notify_user(v.created_by, 'sistema', 'Tu vídeo fue aprobado',
      '+' || v_amt || ' monedas por tu vídeo de la porra.', '/p/' || v.slug);
    return v_amt;
  end if;
  return 0;
end $$;
revoke execute on function public.approve_user_video(uuid) from public, anon;
grant execute on function public.approve_user_video(uuid) to authenticated;

-- ---------- controles del agente (C/D): cooldown del barrido bajo demanda ----------
create table public.agent_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('sweep','search')),
  topic      text,
  created_at timestamptz not null default now()
);
alter table public.agent_runs enable row level security;
create policy ar_admin on public.agent_runs for all using (public.is_admin()) with check (public.is_admin());

-- ¿se puede lanzar otro barrido? (cooldown 60s, imposible saltárselo desde 2 clics)
create or replace function public.trend_cooldown_ok() returns boolean
language sql security definer set search_path = public as $$
  select not exists (
    select 1 from agent_runs where created_at > now() - interval '60 seconds'
  );
$$;
revoke execute on function public.trend_cooldown_ok() from public, anon;
grant execute on function public.trend_cooldown_ok() to authenticated;
