-- ============================================================================
-- VINKO — 0016: árbitro elegible en la porra (§5) + recompensa por compartir
-- (§6). El árbitro por defecto es el creador; se puede designar a otro (que
-- deberá aceptar — flujo social, capa de puntos, sin dinero: el modo dinero
-- sigue CONGELADO por las reglas de oro).
-- ============================================================================
alter table public.porras
  add column arbiter_id     uuid references public.profiles(id) on delete set null,
  add column arbiter_status text not null default 'creator'
    check (arbiter_status in ('creator','invited','accepted','declined'));

-- resolver: lo hace el creador O el árbitro aceptado.
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype; v_total int; v_winners int; v_share int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record; v_score int;
begin
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.created_by is distinct from auth.uid()
     and not (v.arbiter_id = auth.uid() and v.arbiter_status = 'accepted') then
    raise exception 'VINKO_NOT_CREATOR';
  end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  if not exists (select 1 from porra_options where id = p_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  update porras set status = 'resolved', winning_option_id = p_winning where id = p_porra;
  select count(*) into v_total from picks where porra_id = p_porra;
  select count(*) into v_winners from picks where porra_id = p_porra and option_id = p_winning;
  if v_winners > 0 then
    v_share := floor((v_total * 10)::numeric / v_winners); v_p := v_winners::numeric / v_total;
    for r in select k.user_id, k.boost from picks k where k.porra_id = p_porra and k.option_id = p_winning loop
      update profiles set points = points + v_share where id = r.user_id;
      v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
      if r.boost = 'double' then v_score := v_score * 2; end if;
      perform award_score(r.user_id, v_score, 'porra', p_porra);
      perform notify_user(r.user_id, 'resolucion', 'Acertaste: ' || left(v.title, 60),
        '+' || v_share || ' monedas y +' || v_score || ' de puntería.', '/p/' || v.slug);
    end loop;
  end if;
end $$;

-- designar árbitro (creador) → le llega invitación al buzón
create or replace function public.set_arbiter(p_porra uuid, p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_arb profiles%rowtype;
begin
  select * into v from porras where id = p_porra;
  if not found or v.created_by is distinct from auth.uid() then raise exception 'VINKO_NOT_CREATOR'; end if;
  select * into v_arb from profiles where handle = lower(p_handle);
  if not found then raise exception 'VINKO_NO_USER'; end if;
  update porras set arbiter_id = v_arb.id, arbiter_status = 'invited' where id = p_porra;
  perform notify_user(v_arb.id, 'social', '¿Aceptas ser árbitro?',
    'Te han pedido ser árbitro de: ' || left(v.title, 60), '/p/' || v.slug);
end $$;
grant execute on function public.set_arbiter(uuid, text) to authenticated;

-- el árbitro acepta / rechaza
create or replace function public.respond_arbiter(p_porra uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype;
begin
  select * into v from porras where id = p_porra;
  if not found or v.arbiter_id is distinct from auth.uid() then raise exception 'VINKO_NOT_ARBITER'; end if;
  update porras set arbiter_status = case when p_accept then 'accepted' else 'declined' end where id = p_porra;
  if v.created_by is not null then
    perform notify_user(v.created_by, 'social',
      case when p_accept then 'Árbitro aceptado' else 'Árbitro rechazado' end,
      'Tu porra "' || left(v.title, 40) || '"', '/p/' || v.slug);
  end if;
end $$;
grant execute on function public.respond_arbiter(uuid, boolean) to authenticated;

-- recompensa por compartir por WhatsApp (§6): +monedas, cap diario, 1 vez/porra
create table public.share_rewards (
  porra_id uuid not null references public.porras(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (porra_id, user_id)
);
alter table public.share_rewards enable row level security;
create policy sr_read on public.share_rewards for select using (user_id = auth.uid());

create or replace function public.grant_share_reward(p_porra uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_amt int := 50; v_today int;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if exists (select 1 from share_rewards where porra_id = p_porra and user_id = auth.uid()) then return 0; end if;
  select count(*) into v_today from share_rewards
    where user_id = auth.uid() and created_at::date = current_date;
  if v_today >= 5 then return 0; end if;   -- cap anti-farmeo
  insert into share_rewards (porra_id, user_id) values (p_porra, auth.uid());
  update profiles set points = points + v_amt where id = auth.uid();
  return v_amt;
end $$;
grant execute on function public.grant_share_reward(uuid) to authenticated;
