-- 0076_profile_receipts — datos para el PERFIL rediseñado (VINKO_PANTALLAS 13)
-- La pantalla de perfil muestra "Visionario ×N" y "Mis mejores recibos" (los
-- aciertos del usuario donde pocos lo vieron venir). Eso no existía como consulta.
-- profile_receipts(p_user) devuelve, como el resto de RPC de perfil (SECURITY
-- DEFINER, datos públicos agregados):
--   · visionario: nº de aciertos marcados visionario (0065).
--   · receipts:   hasta 6 aciertos (su opción fue la ganadora en una porra
--                 resuelta), los más raros primero, con:
--                   pct        % FINAL de la ganadora sobre todos los picks
--                              ("LO DIJE · 18 % LO VIO"): el mismo dato que la
--                              pantalla 07 ("Solo el X% lo vio") y el que decide
--                              Visionario (≤25 %, 0065). NO pct_at_pick: quien vota
--                              primero tiene 100 % aunque al final sea visionario.
--                   visionario si lo fue (0065)
--                   punteria   la Puntería ganada (pick_scores.score, 0006).
-- Solo lectura; no toca nada. Idempotente (se re-aplica en cada deploy ≥ 72).
create or replace function public.profile_receipts(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with won as (
    select po.title                      as title,
           coalesce(k.visionario, false) as visionario,
           coalesce(ps.score, 0)         as punteria,
           (select round(100.0 * count(*) filter (where a.option_id = po.winning_option_id)
                   / nullif(count(*), 0))::int
              from picks a where a.porra_id = po.id) as pct
    from picks k
    join porras po on po.id = k.porra_id
    left join pick_scores ps
      on ps.user_id = k.user_id and ps.source = 'porra' and ps.ref_id = k.porra_id
    where k.user_id = p_user and po.status = 'resolved'
      and k.option_id = po.winning_option_id
  )
  select jsonb_build_object(
    'visionario', (select count(*)::int from won where visionario),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object('title', r.title, 'pct', r.pct,
                                          'visionario', r.visionario, 'punteria', r.punteria)
                       order by r.pct asc nulls last, r.punteria desc)
      from (select * from won order by pct asc nulls last, punteria desc limit 6) r
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.profile_receipts(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
