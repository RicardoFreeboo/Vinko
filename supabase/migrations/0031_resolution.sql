-- 0031 — Resolución completa (21-sep-2026)
-- Antes NADIE podía resolver: sin botón en /p, 0 porras resueltas, 32 cerradas
-- con los Vinkos de sus participantes parados. Esta migración cierra el loop:
--   (a) resolve_porra: creador, árbitro aceptado o ADMIN; solo tras el cierre
--       (salvo admin) para congelar la dificultad. Reparto parimutuel de 0027.
--   (b) arbiter_respond: el árbitro invitado acepta o rechaza; avisa al creador.
--   (c) porra_ranking: quién puso qué y qué cobra (visible según porras_read).
--   (d) my_pending: lo que tengo pendiente (resolver, invitaciones de juez).
-- Idempotente: se puede aplicar dos veces sin efecto.

-- Índices que usan my_pending y el panel /admin/porras.
create index if not exists porras_created_by_idx on public.porras (created_by, status);
create index if not exists porras_arbiter_idx on public.porras (arbiter_id) where arbiter_id is not null;

-- ---------------------------------------------------------------------------
-- (a) resolve_porra — cuerpo parimutuel de 0027 + admin + cierre obligatorio.
--   bote   = Σ de lo puesto por todos
--   pago_i = floor(puesto_i × bote / Σ puesto por los acertantes)  (Σ pagos ≤ bote)
--   Puntería por NÚMERO de acertantes, nunca por importe. Nadie acierta → devolución.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_admin boolean := public.is_admin();
  v_total int; v_winners int;          -- recuentos (para la puntería)
  v_pot bigint; v_win_stake bigint;    -- Vinkos (para el reparto)
  v_pay int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record;
  v_score int; v_win_label text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if not v_admin
     and v.created_by is distinct from auth.uid()
     and not coalesce(v.arbiter_id = auth.uid() and v.arbiter_status = 'accepted', false) then
    raise exception 'VINKO_NOT_CREATOR';
  end if;
  if v.is_template then raise exception 'VINKO_TEMPLATE'; end if;
  if v.status <> 'open' then raise exception 'VINKO_BAD_STATE'; end if;
  -- Solo tras el cierre: congela la dificultad (nadie entra después de saber el
  -- resultado). El admin puede resolver antes (evento suspendido, error obvio).
  if v.closes_at > now() and not v_admin then raise exception 'VINKO_NOT_CLOSED'; end if;
  if not exists (select 1 from porra_options where id = p_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  select label into v_win_label from porra_options where id = p_winning;
  update porras set status = 'resolved', winning_option_id = p_winning where id = p_porra;

  select count(*), coalesce(sum(points_spent), 0) into v_total, v_pot
    from picks where porra_id = p_porra;
  select count(*), coalesce(sum(points_spent), 0) into v_winners, v_win_stake
    from picks where porra_id = p_porra and option_id = p_winning;
  v_p := case when v_total > 0 then v_winners::numeric / v_total else 0 end;

  for r in select k.user_id, k.option_id, k.boost, k.points_spent
             from picks k where k.porra_id = p_porra loop
    if v_winners = 0 then
      -- Nadie acertó: se devuelve lo puesto (no se destruyen Vinkos).
      update profiles set points = points + r.points_spent where id = r.user_id;
      perform notify_user(r.user_id, 'resolucion', 'Nadie acertó: ' || left(v.title, 50),
        'Se te devuelven ' || r.points_spent || ' Vinkos. Ganó "' || v_win_label || '".', '/p/' || v.slug);

    elsif r.option_id = p_winning then
      -- Reparto proporcional a lo que puso cada uno.
      v_pay := floor(r.points_spent::numeric * v_pot / v_win_stake);
      update profiles set points = points + v_pay where id = r.user_id;
      -- La puntería depende de la dificultad (cuánta gente acertó), NO del importe.
      v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
      if r.boost = 'double' then v_score := v_score * 2; end if;
      perform award_score(r.user_id, v_score, 'porra', p_porra);
      perform notify_user(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
        '+' || v_pay || ' Vinkos y +' || v_score || ' de puntería. Ganó "' || v_win_label || '".', '/p/' || v.slug);

    else
      perform notify_user(r.user_id, 'resolucion', 'No acertaste: ' || left(v.title, 50),
        'Ganó "' || v_win_label || '". La próxima cae.', '/p/' || v.slug);
    end if;
  end loop;
end $$;
revoke execute on function public.resolve_porra(uuid, uuid) from public, anon;
grant execute on function public.resolve_porra(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (b) arbiter_respond — solo el árbitro invitado; avisa al creador (buzón).
--     Si rechaza, el creador sigue siendo el juez (resolve_porra ya lo permite).
-- ---------------------------------------------------------------------------
create or replace function public.arbiter_respond(p_porra uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v porras%rowtype; v_handle text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found or v.arbiter_id is distinct from auth.uid() then raise exception 'VINKO_NOT_ARBITER'; end if;
  if v.arbiter_status <> 'invited' then raise exception 'VINKO_BAD_STATE'; end if;
  update porras set arbiter_status = case when p_accept then 'accepted' else 'declined' end where id = p_porra;
  if v.created_by is not null then
    select handle into v_handle from profiles where id = auth.uid();
    perform notify_user(v.created_by, 'social',
      case when p_accept then 'Juez confirmado' else 'El juez no acepta' end,
      case when p_accept
        then '@' || coalesce(v_handle, 'alguien') || ' decidirá el resultado de "' || left(v.title, 40) || '".'
        else 'Sigues siendo tú quien resuelve "' || left(v.title, 40) || '".' end,
      '/p/' || v.slug);
  end if;
end $$;
revoke execute on function public.arbiter_respond(uuid, boolean) from public, anon;
grant execute on function public.arbiter_respond(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- (c) porra_ranking — participantes con lo que pusieron y lo que cobran.
--     Visible solo si el que llama ve la porra (mismo predicado que porras_read,
--     más el árbitro). payout: 0 mientras está abierta; al resolver, reparto
--     parimutuel para los acertantes; si nadie acertó, devolución (= stake).
-- ---------------------------------------------------------------------------
create or replace function public.porra_ranking(p_porra uuid)
returns table (handle text, avatar_url text, option_id uuid, option_label text,
               stake int, won boolean, payout int)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from porras p
    where p.id = p_porra
      and ( (p.visibility = 'public' and p.status in ('open','resolved'))
            or p.created_by = auth.uid()
            or p.arbiter_id = auth.uid()
            or public.is_admin()
            or (p.visibility = 'private' and public.shares_group(p.created_by)) )
  ),
  tot as (
    select coalesce(sum(k.points_spent), 0)::bigint as pot,
           coalesce(sum(k.points_spent) filter (where k.option_id = v.winning_option_id), 0)::bigint as win_stake
    from v left join picks k on k.porra_id = v.id
  )
  select pr.handle, pr.avatar_url, k.option_id, o.label,
         k.points_spent::int,
         (v.status = 'resolved' and k.option_id = v.winning_option_id),
         case
           when v.status <> 'resolved' then 0
           when tot.win_stake = 0 then k.points_spent::int
           when k.option_id = v.winning_option_id
             then floor(k.points_spent::numeric * tot.pot / tot.win_stake)::int
           else 0
         end
  from v
  join picks k on k.porra_id = v.id
  join profiles pr on pr.id = k.user_id
  join porra_options o on o.id = k.option_id
  cross join tot
  order by 6 desc, 7 desc, 5 desc, k.created_at;
$$;
grant execute on function public.porra_ranking(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (d) my_pending — para el buzón: porras que me toca resolver (cerradas, soy
--     creador o árbitro aceptado), invitaciones de juez y cuántas mías siguen
--     abiertas. Sin sesión devuelve listas vacías.
-- ---------------------------------------------------------------------------
create or replace function public.my_pending() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'to_resolve', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'title', p.title, 'closes_at', p.closes_at)
                       order by p.closes_at)
      from porras p
      where p.status = 'open' and not p.is_template and p.closes_at <= now()
        and (p.created_by = auth.uid()
             or (p.arbiter_id = auth.uid() and p.arbiter_status = 'accepted'))
    ), '[]'::jsonb),
    'arbiter_invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title)
                       order by p.created_at desc)
      from porras p
      where p.status = 'open' and p.arbiter_id = auth.uid() and p.arbiter_status = 'invited'
    ), '[]'::jsonb),
    'open_created', (
      select count(*) from porras p
      where p.status = 'open' and not p.is_template and p.closes_at > now()
        and p.created_by = auth.uid()
    )
  );
$$;
revoke execute on function public.my_pending() from public, anon;
grant execute on function public.my_pending() to authenticated;

notify pgrst, 'reload schema';
