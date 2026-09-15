-- ============================================================================
-- VINKO — 0027: REPARTO PARIMUTUEL correcto con apuesta variable.
--
-- Bug que corrige: resolve_porra calculaba el bote como (nº de picks × 10) y
-- pagaba lo MISMO a todos los acertantes. Con importes variables (0026) eso
-- significaba que quien ponía 500 cobraba igual que quien ponía 10, y el bote
-- no cuadraba (se creaban o destruían Vinkos).
--
-- Ahora:  bote   = Σ de lo apostado por todos
--         pago_i = floor(apostado_i × bote / Σ apostado por los acertantes)
--         Σ pagos ≤ bote SIEMPRE (el floor garantiza que nunca se crean Vinkos).
--
-- La PUNTERÍA sigue calculándose por NÚMERO de acertantes, nunca por importe
-- (regla de oro: el dinero-puntos no compra mérito ni premios).
-- Si no acierta nadie, se DEVUELVE lo apostado en vez de destruirlo.
-- ============================================================================
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype;
  v_total int; v_winners int;          -- recuentos (para la puntería)
  v_pot bigint; v_win_stake bigint;    -- Vinkos (para el reparto)
  v_pay int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record;
  v_score int; v_win_label text;
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
      -- Nadie acertó: se devuelve lo apostado (no se destruyen Vinkos).
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
