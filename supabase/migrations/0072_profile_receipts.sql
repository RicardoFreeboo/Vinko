-- 0072_profile_receipts — datos para el PERFIL rediseñado (VINKO_PANTALLAS 13)
-- La pantalla de perfil muestra "Visionario ×N" y "Mis mejores recibos" (los
-- aciertos del usuario donde pocos lo vieron venir). Eso no existía como consulta.
-- profile_receipts(p_user) devuelve, como el resto de RPC de perfil (SECURITY
-- DEFINER, datos públicos agregados):
--   · visionario: nº de aciertos marcados visionario (0065).
--   · receipts:   hasta 6 aciertos (su opción fue la ganadora en una porra
--                 resuelta), con el % que lo vio (pct_at_pick, 0065), si fue
--                 visionario y la Puntería ganada (pick_scores.score, 0006).
-- Solo lectura; no toca nada. pick_scores ya es legible por todos (0006).
create or replace function public.profile_receipts(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'visionario', (
      select count(*)::int
      from picks k
      join porras po on po.id = k.porra_id
      where k.user_id = p_user and po.status = 'resolved'
        and k.option_id = po.winning_option_id and coalesce(k.visionario, false)
    ),
    'receipts', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select po.title                      as title,
               k.pct_at_pick                 as pct,
               coalesce(k.visionario, false) as visionario,
               coalesce(ps.score, 0)         as punteria
        from picks k
        join porras po on po.id = k.porra_id
        left join pick_scores ps
          on ps.user_id = k.user_id and ps.source = 'porra' and ps.ref_id = k.porra_id
        where k.user_id = p_user and po.status = 'resolved'
          and k.option_id = po.winning_option_id
        order by k.pct_at_pick asc nulls last, coalesce(ps.score, 0) desc
        limit 6
      ) r
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.profile_receipts(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
