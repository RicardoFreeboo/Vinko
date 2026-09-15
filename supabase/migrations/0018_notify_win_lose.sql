-- ============================================================================
-- VINKO — 0018: avisos al GANAR y al PERDER (§5) + aviso "resultado en camino"
-- cuando la porra cierra.
-- ============================================================================
create or replace function public.resolve_porra(p_porra uuid, p_winning uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v porras%rowtype; v_total int; v_winners int; v_share int;
  v_eco jsonb := cfg('economy'); v_base int := coalesce((v_eco->>'score_base')::int, 20);
  v_range int := coalesce((v_eco->>'score_range')::int, 100); v_p numeric; r record; v_score int; v_win_label text;
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
  select count(*) into v_total from picks where porra_id = p_porra;
  select count(*) into v_winners from picks where porra_id = p_porra and option_id = p_winning;
  if v_winners > 0 then
    v_share := floor((v_total * 10)::numeric / v_winners); v_p := v_winners::numeric / v_total;
  end if;
  for r in select k.user_id, k.option_id, k.boost from picks k where k.porra_id = p_porra loop
    if r.option_id = p_winning then
      update profiles set points = points + v_share where id = r.user_id;
      v_score := round((v_base + v_range * (1 - v_p)) * streak_mult(r.user_id));
      if r.boost = 'double' then v_score := v_score * 2; end if;
      perform award_score(r.user_id, v_score, 'porra', p_porra);
      perform notify_user(r.user_id, 'resolucion', '🎉 Acertaste: ' || left(v.title, 50),
        '+' || v_share || ' Vinkos y +' || v_score || ' de puntería. Ganó "' || v_win_label || '".', '/p/' || v.slug);
    else
      -- avisar también al que falló (§5)
      perform notify_user(r.user_id, 'resolucion', 'No acertaste: ' || left(v.title, 50),
        'Ganó "' || v_win_label || '". La próxima cae.', '/p/' || v.slug);
    end if;
  end loop;
end $$;

-- aviso "resultado en camino" a quien apostó, cuando la porra acaba de cerrar
create or replace function public.cron_closed_pickers() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct po.id, po.slug, left(po.title, 50) tt, k.user_id
    from porras po join picks k on k.porra_id = po.id
    where po.status = 'open' and po.closes_at between now() - interval '20 minutes' and now()
      and not exists (select 1 from notifications n where n.user_id = k.user_id
        and n.url = '/p/' || po.slug and n.title like 'Cerró%' and n.created_at > now() - interval '3 hours')
  loop
    perform notify_user(r.user_id, 'evento', 'Cerró: ' || r.tt,
      'Ya no se puede apostar. Pronto sabrás si acertaste.', '/p/' || r.slug);
  end loop;
end $$;

-- engancharlo al tick maestro
create or replace function public.cron_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  begin perform cron_open_daily();        exception when others then null; end;
  begin perform cron_closure_reminders(); exception when others then null; end;
  begin perform cron_closed_pickers();    exception when others then null; end;
  begin perform cron_streak_risk();       exception when others then null; end;
  begin perform cron_league_sunday();     exception when others then null; end;
  begin perform cron_league_close();      exception when others then null; end;
  begin perform cron_reactivation();      exception when others then null; end;
end $$;
