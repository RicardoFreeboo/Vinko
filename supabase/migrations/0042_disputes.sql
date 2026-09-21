-- ============================================================================
-- VINKO — 0042: IMPUGNACIÓN de resultados, libro mayor de pagos y reputación
-- del juez (F-04 del spec de lanzamiento, pregunta 4 de §12). 21-sep-2026.
--
--   (a) porras.status admite 'disputed' (público como 'resolved'): policies
--       porras_read / options_read / picks_read_resolved recreadas.
--   (b) porra_payouts: libro mayor SOLO-AÑADIR de lo que reparte resolve_porra
--       (pago, devolución) y de lo que deshace resolve_dispute (reversal).
--   (c) resolve_porra: mismo cuerpo parimutuel de 0031 + picks invitados
--       (is_guest, 0040) fuera de los totales (ni cobran ni puntúan) + fila
--       en el libro mayor por cada pago/devolución.
--   (d) porra_disputes + dispute_porra: participante real, porra 'resolved',
--       ≤ 24 h desde resolved_at. Umbral max(3, ceil(30 % participantes)) →
--       'disputed', aviso al juez y a los admins (clase 'sistema').
--   (e) resolve_dispute (admin): 'uphold' → vuelve a 'resolved'; 'reverse' →
--       asientos compensatorios (nunca saldo < 0: el déficit queda en
--       shortfall), puntería deshecha, porra 'open' sin ganadora y, si se da
--       p_new_winning, resolve_porra de nuevo en la MISMA transacción.
--   (f) judge_stats(p_user): {resolved, disputed, upheld, median_sla_minutes}.
--   (g) admin_disputes(): cola de impugnadas con motivos (solo admin).
-- Invariante: Σ pagos ≤ Vinkos en juego (floor de 0027). Tras un 'reverse'
-- cada saldo vuelve al estado previo a la resolución salvo el déficit anotado.
-- Idempotente: se puede aplicar dos veces sin efecto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) Estado 'disputed' + columnas de la impugnación + policies de lectura.
-- ---------------------------------------------------------------------------
alter table public.porras drop constraint if exists porras_status_check;
alter table public.porras add constraint porras_status_check
  check (status in ('open','resolved','taken_down','disputed'));

alter table public.porras add column if not exists disputed_at timestamptz;
alter table public.porras add column if not exists dispute_resolved_at timestamptz;
alter table public.porras add column if not exists dispute_outcome text
  check (dispute_outcome in ('upheld','reversed'));

-- Guardia: la 0040 (otro constructor) crea picks.is_guest; si aún no está, la
-- columna nace aquí con el mismo tipo/default para que este fichero compile.
alter table public.picks add column if not exists is_guest boolean not null default false;

-- Mismo predicado que 0019 + 'disputed' visible como 'resolved'.
drop policy if exists porras_read on public.porras;
create policy porras_read on public.porras for select using (
  (visibility = 'public' and status in ('open','resolved','disputed'))
  or created_by = auth.uid()
  or public.is_admin()
  or (visibility = 'private' and public.shares_group(created_by))
);

-- Mismo predicado que 0003 + 'disputed' (sin esto el anon no vería las opciones).
drop policy if exists options_read on public.porra_options;
create policy options_read on public.porra_options
  for select using (
    exists (
      select 1 from public.porras p
      where p.id = porra_id
        and (p.status in ('open','resolved','disputed') or p.created_by = auth.uid() or public.is_admin())
    )
  );

-- Mismo predicado que 0003 + 'disputed' (el reparto provisional es público).
drop policy if exists picks_read_resolved on public.picks;
create policy picks_read_resolved on public.picks
  for select using (
    exists (select 1 from public.porras p where p.id = porra_id and p.status in ('resolved','disputed'))
  );

-- ---------------------------------------------------------------------------
-- (b) porra_payouts — libro mayor solo-añadir. amount > 0 en payout/refund,
--     < 0 en reversal. score = puntería concedida (+) o deshecha (−).
--     shortfall = parte del pago que NO se pudo recuperar en un reversal porque
--     el saldo ya se había gastado (política: nunca saldo negativo).
-- ---------------------------------------------------------------------------
create table if not exists public.porra_payouts (
  id         bigint generated always as identity primary key,
  porra_id   uuid not null references public.porras(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int  not null,
  score      int  not null default 0,
  kind       text not null check (kind in ('payout','refund','reversal')),
  shortfall  int  not null default 0 check (shortfall >= 0),
  reverses   bigint references public.porra_payouts(id), -- fila compensada (solo reversal)
  created_at timestamptz not null default now(),
  constraint porra_payouts_sign check (
    (kind in ('payout','refund') and amount >= 0 and reverses is null)
    or (kind = 'reversal' and amount <= 0 and reverses is not null)
  )
);
create index if not exists porra_payouts_porra_idx on public.porra_payouts (porra_id);
create index if not exists porra_payouts_user_idx on public.porra_payouts (user_id, created_at);
create unique index if not exists porra_payouts_reverses_uidx on public.porra_payouts (reverses)
  where reverses is not null; -- cada asiento se compensa como mucho una vez

alter table public.porra_payouts enable row level security;
drop policy if exists porra_payouts_read on public.porra_payouts;
create policy porra_payouts_read on public.porra_payouts
  for select using (user_id = auth.uid() or public.is_admin());
-- Sin policies de insert/update/delete: solo las funciones definer escriben.
revoke all on public.porra_payouts from anon, authenticated;
grant select on public.porra_payouts to authenticated;

-- Solo-añadir de verdad: ni siquiera el service role puede modificar una fila.
create or replace function public.porra_payouts_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'VINKO_LEDGER_APPEND_ONLY';
end $$;
drop trigger if exists porra_payouts_no_update on public.porra_payouts;
create trigger porra_payouts_no_update before update on public.porra_payouts
  for each row execute function public.porra_payouts_immutable();

-- ---------------------------------------------------------------------------
-- (c) resolve_porra — cuerpo de 0031 (parimutuel 0027 + admin + cierre
--     obligatorio) con dos añadidos:
--       · picks is_guest fuera de recuentos y totales: ni cobran ni puntúan
--         (F-01: hasta convertir la cuenta no cuentan);
--       · cada pago/devolución deja fila en porra_payouts.
--   Vinkos en juego = Σ de lo puesto por los participantes reales
--   pago_i = floor(puesto_i × en_juego / Σ puesto por los acertantes)  (Σ pagos ≤ en juego)
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
  v_score int; v_win_label text; v_applied int;
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

  -- Invitados (is_guest) fuera: no pusieron Vinkos y no cobran ni puntúan.
  select count(*), coalesce(sum(points_spent), 0) into v_total, v_pot
    from picks where porra_id = p_porra and not coalesce(is_guest, false);
  select count(*), coalesce(sum(points_spent), 0) into v_winners, v_win_stake
    from picks where porra_id = p_porra and option_id = p_winning and not coalesce(is_guest, false);
  v_p := case when v_total > 0 then v_winners::numeric / v_total else 0 end;

  for r in select k.user_id, k.option_id, k.boost, k.points_spent
             from picks k where k.porra_id = p_porra and not coalesce(k.is_guest, false) loop
    if v_winners = 0 then
      -- Nadie acertó: se devuelve lo puesto (no se destruyen Vinkos).
      update profiles set points = points + r.points_spent where id = r.user_id;
      insert into porra_payouts (porra_id, user_id, amount, score, kind)
        values (p_porra, r.user_id, r.points_spent, 0, 'refund');
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
      -- Lo que award_score aplicó de verdad (0 si ya existía un marcador de esta porra).
      select ps.score into v_applied from pick_scores ps
        where ps.user_id = r.user_id and ps.source = 'porra' and ps.ref_id = p_porra;
      insert into porra_payouts (porra_id, user_id, amount, score, kind)
        values (p_porra, r.user_id, v_pay, coalesce(v_applied, 0), 'payout');
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
-- porra_ranking (0031) — misma firma; 'disputed' muestra el reparto
-- PROVISIONAL y los picks invitados quedan fuera (no están en el reparto).
-- ---------------------------------------------------------------------------
create or replace function public.porra_ranking(p_porra uuid)
returns table (handle text, avatar_url text, option_id uuid, option_label text,
               stake int, won boolean, payout int)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from porras p
    where p.id = p_porra
      and ( (p.visibility = 'public' and p.status in ('open','resolved','disputed'))
            or p.created_by = auth.uid()
            or p.arbiter_id = auth.uid()
            or public.is_admin()
            or (p.visibility = 'private' and public.shares_group(p.created_by)) )
  ),
  tot as (
    select coalesce(sum(k.points_spent), 0)::bigint as pot,
           coalesce(sum(k.points_spent) filter (where k.option_id = v.winning_option_id), 0)::bigint as win_stake
    from v left join picks k on k.porra_id = v.id and not coalesce(k.is_guest, false)
  )
  select pr.handle, pr.avatar_url, k.option_id, o.label,
         k.points_spent::int,
         (v.status in ('resolved','disputed') and k.option_id = v.winning_option_id),
         case
           when v.status not in ('resolved','disputed') then 0
           when tot.win_stake = 0 then k.points_spent::int
           when k.option_id = v.winning_option_id
             then floor(k.points_spent::numeric * tot.pot / tot.win_stake)::int
           else 0
         end
  from v
  join picks k on k.porra_id = v.id and not coalesce(k.is_guest, false)
  join profiles pr on pr.id = k.user_id
  join porra_options o on o.id = k.option_id
  cross join tot
  order by 6 desc, 7 desc, 5 desc, k.created_at;
$$;
grant execute on function public.porra_ranking(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (d) porra_disputes + dispute_porra
-- ---------------------------------------------------------------------------
create table if not exists public.porra_disputes (
  id          uuid primary key default gen_random_uuid(),
  porra_id    uuid not null references public.porras(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (char_length(reason) between 3 and 300),
  created_at  timestamptz not null default now(),
  outcome     text check (outcome in ('upheld','reversed')), -- null = pendiente
  resolved_at timestamptz
);
-- Una impugnación ABIERTA por (porra, usuario). Parcial en vez de unique(...)
-- para conservar el historial: tras una rectificación el nuevo resultado puede
-- impugnarse otra vez sin borrar los motivos de la primera ronda.
create unique index if not exists porra_disputes_open_uidx
  on public.porra_disputes (porra_id, user_id) where outcome is null;
create index if not exists porra_disputes_porra_idx on public.porra_disputes (porra_id, created_at);

alter table public.porra_disputes enable row level security;
drop policy if exists porra_disputes_read on public.porra_disputes;
create policy porra_disputes_read on public.porra_disputes
  for select using (user_id = auth.uid() or public.is_admin());
revoke all on public.porra_disputes from anon, authenticated;
grant select on public.porra_disputes to authenticated;

-- Juez efectivo de una porra: árbitro aceptado, si no el creador.
create or replace function public.porra_judge(p porras) returns uuid
language sql immutable as $$
  select case when p.arbiter_status = 'accepted' and p.arbiter_id is not null
              then p.arbiter_id else p.created_by end
$$;
revoke execute on function public.porra_judge(porras) from public, anon, authenticated;

-- Umbral de congelación: max(3, ceil(30 % de los participantes reales)).
create or replace function public.dispute_threshold(p_participants int) returns int
language sql immutable as $$
  select greatest(3, ceil(0.30 * greatest(p_participants, 0))::int)
$$;
grant execute on function public.dispute_threshold(int) to anon, authenticated;

create or replace function public.dispute_porra(p_porra uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype; v_reason text; v_n int; v_d int; v_thr int; v_judge uuid; a record;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.status <> 'resolved' then raise exception 'VINKO_BAD_STATE'; end if;
  -- Vinko ya revisó y mantuvo este resultado: no se reabre la ventana.
  if v.dispute_outcome = 'upheld' then raise exception 'VINKO_DISPUTE_CLOSED'; end if;
  -- Ventana: 24 h desde la resolución (resolved_at, 0033). Sin fecha = cerrada.
  if v.resolved_at is null or v.resolved_at < now() - interval '24 hours' then
    raise exception 'VINKO_WINDOW_CLOSED';
  end if;
  -- Solo quien participó con un pick real (no invitado).
  if not exists (select 1 from picks k where k.porra_id = p_porra and k.user_id = auth.uid()
                   and not coalesce(k.is_guest, false)) then
    raise exception 'VINKO_NOT_PARTICIPANT';
  end if;
  v_reason := left(btrim(coalesce(p_reason, '')), 300);
  if char_length(v_reason) < 3 then raise exception 'VINKO_BAD_REASON'; end if;

  insert into porra_disputes (porra_id, user_id, reason) values (p_porra, auth.uid(), v_reason)
    on conflict (porra_id, user_id) where outcome is null do nothing;

  select count(*) into v_n from picks where porra_id = p_porra and not coalesce(is_guest, false);
  select count(*) into v_d from porra_disputes where porra_id = p_porra and outcome is null;
  v_thr := dispute_threshold(v_n);

  if v_d >= v_thr then
    update porras set status = 'disputed', disputed_at = now() where id = p_porra;
    v_judge := porra_judge(v);
    if v_judge is not null then
      perform notify_user(v_judge, 'sistema', 'Resultado impugnado: ' || left(v.title, 50),
        v_d || ' participantes no están de acuerdo con el resultado. Vinko lo revisa en menos de 24 h.',
        '/p/' || v.slug);
    end if;
    for a in select id from profiles where role = 'admin' loop
      perform notify_user(a.id, 'sistema', 'Porra impugnada: ' || left(v.title, 50),
        v_d || ' de ' || v_n || ' participantes. Decidir en /admin/porras.', '/admin/porras');
    end loop;
  end if;

  return jsonb_build_object('disputes', v_d, 'participants', v_n, 'threshold', v_thr,
                            'frozen', v_d >= v_thr, 'mine', true);
end $$;
revoke execute on function public.dispute_porra(uuid, text) from public, anon;
grant execute on function public.dispute_porra(uuid, text) to authenticated;

-- Estado de la impugnación para /p (SSR): cuántos, umbral, si el que mira ya
-- impugnó, si puede (participante real) y hasta cuándo. null si no ve la porra.
create or replace function public.porra_dispute_state(p_porra uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (
    select * from porras p
    where p.id = p_porra
      and ( (p.visibility = 'public' and p.status in ('open','resolved','disputed'))
            or p.created_by = auth.uid()
            or p.arbiter_id = auth.uid()
            or public.is_admin()
            or (p.visibility = 'private' and public.shares_group(p.created_by)) )
  ),
  n as (
    select count(*)::int as participants
    from v join picks k on k.porra_id = v.id and not coalesce(k.is_guest, false)
  )
  select jsonb_build_object(
    'status', v.status,
    'disputes', (select count(*) from porra_disputes d where d.porra_id = v.id and d.outcome is null),
    'participants', n.participants,
    'threshold', dispute_threshold(n.participants),
    'mine', exists (select 1 from porra_disputes d where d.porra_id = v.id and d.user_id = auth.uid() and d.outcome is null),
    'participant', exists (select 1 from picks k where k.porra_id = v.id and k.user_id = auth.uid() and not coalesce(k.is_guest, false)),
    'window_until', case when v.resolved_at is null then null else v.resolved_at + interval '24 hours' end,
    'outcome', v.dispute_outcome
  )
  from v cross join n;
$$;
grant execute on function public.porra_dispute_state(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (e) resolve_dispute — solo admin, UNA transacción.
--   'uphold'  → status 'resolved' (mismo reparto), impugnaciones cerradas.
--   'reverse' → por cada payout/refund sin compensar: fila 'reversal' con el
--               importe en negativo; el saldo baja min(importe, saldo actual)
--               (nunca < 0; lo que falte queda en shortfall); la puntería de
--               esa porra se deshace (pick_scores + marcador_total + liga:
--               award_score ignora valores ≤ 0, así que se revierte a mano).
--               Después: 'open', sin ganadora, resolved_at a null (el trigger
--               de 0033 volverá a sellarlo) y, si p_new_winning, resolve_porra
--               de nuevo (vía admin). Sin p_new_winning el juez resuelve otra vez.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_dispute(p_porra uuid, p_action text, p_new_winning uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype; r record; d record;
  v_cur int; v_take int; v_s int; v_week date; v_reversed int := 0; v_short int := 0;
  v_judge uuid; v_label text;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if p_action not in ('uphold','reverse') then raise exception 'VINKO_BAD_ACTION'; end if;
  select * into v from porras where id = p_porra for update;
  if not found then raise exception 'VINKO_NO_PORRA'; end if;
  if v.status <> 'disputed' then raise exception 'VINKO_BAD_STATE'; end if;
  if p_new_winning is not null and p_action = 'uphold' then raise exception 'VINKO_BAD_ACTION'; end if;
  if p_new_winning is not null
     and not exists (select 1 from porra_options where id = p_new_winning and porra_id = p_porra) then
    raise exception 'VINKO_BAD_OPTION';
  end if;
  v_judge := porra_judge(v);

  if p_action = 'uphold' then
    update porras set status = 'resolved', dispute_outcome = 'upheld', dispute_resolved_at = now()
      where id = p_porra;
    for d in select distinct user_id from porra_disputes where porra_id = p_porra and outcome is null loop
      perform notify_user(d.user_id, 'sistema', 'Impugnación revisada: ' || left(v.title, 50),
        'Vinko ha revisado el resultado y lo mantiene.', '/p/' || v.slug);
    end loop;
    update porra_disputes set outcome = 'upheld', resolved_at = now()
      where porra_id = p_porra and outcome is null;
    if v_judge is not null then
      perform notify_user(v_judge, 'sistema', 'Tu resultado se mantiene: ' || left(v.title, 50),
        'Vinko revisó la impugnación y el resultado queda como lo dejaste.', '/p/' || v.slug);
    end if;
    return jsonb_build_object('action', 'uphold', 'status', 'resolved');
  end if;

  -- reverse: asientos compensatorios de cada pago/devolución aún sin compensar.
  for r in select pp.* from porra_payouts pp
            where pp.porra_id = p_porra and pp.kind in ('payout','refund')
              and not exists (select 1 from porra_payouts x where x.reverses = pp.id)
            order by pp.id loop
    select points into v_cur from profiles where id = r.user_id for update;
    v_take := least(r.amount, greatest(coalesce(v_cur, 0), 0));
    if v_take > 0 then
      update profiles set points = points - v_take where id = r.user_id;
    end if;
    v_s := 0;
    if r.score > 0 then
      delete from pick_scores ps where ps.user_id = r.user_id and ps.source = 'porra' and ps.ref_id = p_porra
        returning ps.score, ps.week_start into v_s, v_week;
      if v_s is not null and v_s > 0 then
        update profiles set marcador_total = greatest(0, marcador_total - v_s) where id = r.user_id;
        update league_members lm set score = greatest(0, lm.score - v_s)
          from league_groups lg
          where lg.id = lm.group_id and lm.user_id = r.user_id and lg.week_start = v_week;
      end if;
    end if;
    insert into porra_payouts (porra_id, user_id, amount, score, kind, shortfall, reverses)
      values (p_porra, r.user_id, -r.amount, -coalesce(v_s, 0), 'reversal', r.amount - v_take, r.id);
    v_reversed := v_reversed + 1;
    v_short := v_short + (r.amount - v_take);
  end loop;
  -- Con ≥ 1 pick real, resolve_porra siempre deja fila (pagos o devoluciones).
  -- Si no hay ninguna, la resolución es anterior al libro mayor: rectificar a
  -- ciegas pagaría dos veces. Se corrige a mano.
  if v_reversed = 0 and exists (select 1 from picks k where k.porra_id = p_porra and not coalesce(k.is_guest, false)) then
    raise exception 'VINKO_NO_LEDGER';
  end if;

  update porras set status = 'open', winning_option_id = null, resolved_at = null,
                    dispute_outcome = 'reversed', dispute_resolved_at = now()
    where id = p_porra;
  update porra_disputes set outcome = 'reversed', resolved_at = now()
    where porra_id = p_porra and outcome is null;

  if p_new_winning is not null then
    select label into v_label from porra_options where id = p_new_winning;
    -- Admin: resolve_porra permite resolver aunque closes_at ya pasó o no.
    perform public.resolve_porra(p_porra, p_new_winning);
    for d in select distinct k.user_id from picks k where k.porra_id = p_porra and not coalesce(k.is_guest, false) loop
      perform notify_user(d.user_id, 'sistema', 'Resultado rectificado: ' || left(v.title, 50),
        'Tras la impugnación, Vinko rectifica: gana "' || v_label || '". El reparto anterior queda deshecho.',
        '/p/' || v.slug);
    end loop;
  else
    for d in select distinct k.user_id from picks k where k.porra_id = p_porra and not coalesce(k.is_guest, false) loop
      perform notify_user(d.user_id, 'sistema', 'Resultado anulado: ' || left(v.title, 50),
        'Tras la impugnación, el reparto queda deshecho. El juez resolverá de nuevo.', '/p/' || v.slug);
    end loop;
    if v_judge is not null then
      perform notify_user(v_judge, 'sistema', 'Te toca resolver de nuevo: ' || left(v.title, 50),
        'Vinko ha deshecho el reparto tras la impugnación. Elige el resultado correcto.', '/p/' || v.slug);
    end if;
  end if;

  return jsonb_build_object('action', 'reverse', 'reversed', v_reversed, 'shortfall', v_short,
                            'status', case when p_new_winning is null then 'open' else 'resolved' end);
end $$;
revoke execute on function public.resolve_dispute(uuid, text, uuid) from public, anon;
grant execute on function public.resolve_dispute(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (f) judge_stats — reputación pública del juez ("Juez fiable: N porras ·
--     0 impugnaciones"). SLA = minutos entre el cierre y la resolución
--     (mediana; resolver antes del cierre cuenta como 0).
-- ---------------------------------------------------------------------------
create or replace function public.judge_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with j as (
    select p.* from porras p
    where not p.is_template and p.status <> 'taken_down' and porra_judge(p) = p_user
  )
  select jsonb_build_object(
    'handle',   (select handle from profiles where id = p_user),
    'resolved', (select count(*) from j where status in ('resolved','disputed')),
    'disputed', (select count(*) from j where disputed_at is not null),
    'upheld',   (select count(*) from j where dispute_outcome = 'upheld'),
    'reversed', (select count(*) from j where dispute_outcome = 'reversed'),
    'pending',  (select count(*) from j where status = 'open' and closes_at <= now()),
    'median_sla_minutes', (
      select round(percentile_cont(0.5) within group
               (order by greatest(0, extract(epoch from (resolved_at - closes_at)) / 60)))::int
      from j where status in ('resolved','disputed') and resolved_at is not null)
  );
$$;
grant execute on function public.judge_stats(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (g) admin_disputes — cola de impugnadas con motivos. Solo admin.
-- ---------------------------------------------------------------------------
create or replace function public.admin_disputes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select coalesce(jsonb_agg(row_j order by disputed_at), '[]'::jsonb) into v
  from (
    select p.disputed_at, jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'title', p.title, 'source', p.source,
      'closes_at', p.closes_at, 'resolved_at', p.resolved_at, 'disputed_at', p.disputed_at,
      'judge', (select handle from profiles where id = porra_judge(p)),
      'winning_option_id', p.winning_option_id,
      'winning_label', (select label from porra_options o where o.id = p.winning_option_id),
      'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.idx), '[]'::jsonb)
                  from porra_options o where o.porra_id = p.id),
      'participants', (select count(*) from picks k where k.porra_id = p.id and not coalesce(k.is_guest, false)),
      'pot', (select coalesce(sum(k.points_spent), 0) from picks k where k.porra_id = p.id and not coalesce(k.is_guest, false)),
      'threshold', dispute_threshold((select count(*)::int from picks k where k.porra_id = p.id and not coalesce(k.is_guest, false))),
      'disputes', (select coalesce(jsonb_agg(jsonb_build_object('handle', pr.handle, 'reason', d.reason, 'created_at', d.created_at)
                                             order by d.created_at), '[]'::jsonb)
                   from porra_disputes d join profiles pr on pr.id = d.user_id
                   where d.porra_id = p.id and d.outcome is null)
    ) as row_j
    from porras p where p.status = 'disputed'
  ) s;
  return v;
end $$;
revoke execute on function public.admin_disputes() from public, anon;
grant execute on function public.admin_disputes() to authenticated;

notify pgrst, 'reload schema';
