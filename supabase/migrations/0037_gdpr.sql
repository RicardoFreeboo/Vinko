-- ============================================================================
-- VINKO — 0037: RGPD (spec F-10). Borrado de cuenta self-service, exportación
-- de datos y etiqueta de cuentas internas.
--  · profiles.deleted_at: marca de borrado (la fila se conserva anonimizada).
--  · profiles.is_internal: equipo y alfa (etiquetados, no borrados). Los
--    rankings y cohortes KPI deben excluirlos (G-06); aquí solo la columna.
--  · delete_me(): anonimiza al usuario de la sesión. CONSERVA las filas de
--    picks (integridad del reparto de cada porra) pero quita todo dato
--    personal: handle → 'borrado_' + 8 hex (el check de 0001 no admite guion),
--    avatar/año de nacimiento/referido/título/marco fuera, points a 0 (solo
--    servidor), avisos, push, grupos y ligas fuera, comentarios → '[borrado]'.
--  · export_me(): jsonb con los datos del usuario (acceso y portabilidad).
--  · El borrado FINAL de auth.users (email, proveedor OAuth) es hoy un paso
--    MANUAL del admin en el panel de Supabase (Authentication → Users →
--    Delete user). Hasta entonces el usuario podría volver a entrar y vería la
--    cuenta anonimizada. Pendiente: cron/Edge Function con service role.
-- Idempotente: se puede ejecutar dos veces sin efecto adicional.
-- ============================================================================

-- ---------- columnas ----------
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists is_internal boolean not null default false;
create index if not exists profiles_deleted_idx on public.profiles (deleted_at) where deleted_at is not null;
create index if not exists profiles_internal_idx on public.profiles (is_internal) where is_internal;

-- Equipo (etiquetado, no borrado).
update public.profiles set is_internal = true
 where handle in ('hello', 'ricardocanogarcia94') and not is_internal;

-- ---------- export_me(): todos los datos del usuario de la sesión ----------
-- security definer filtrada SIEMPRE por auth.uid(): no lee nada de terceros.
create or replace function public.export_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null::jsonb else jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = auth.uid()),
    'picks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'porra_id', k.porra_id, 'slug', po.slug, 'title', po.title,
        'option', o.label, 'points_spent', k.points_spent, 'created_at', k.created_at,
        'hit', case when po.status = 'resolved' then (po.winning_option_id = k.option_id) end
      ) order by k.created_at), '[]'::jsonb)
      from picks k
      join porras po on po.id = k.porra_id
      left join porra_options o on o.id = k.option_id
      where k.user_id = auth.uid()
    ),
    'porras_created', (
      select coalesce(jsonb_agg((to_jsonb(po) || jsonb_build_object(
        'options', (select coalesce(jsonb_agg(x.label order by x.idx), '[]'::jsonb)
                    from porra_options x where x.porra_id = po.id)
      )) order by po.created_at), '[]'::jsonb)
      from porras po where po.created_by = auth.uid()
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'porra_id', c.porra_id, 'body', c.body, 'created_at', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from porra_comments c where c.user_id = auth.uid()
    ),
    'likes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'porra_id', l.porra_id, 'created_at', l.created_at
      ) order by l.created_at), '[]'::jsonb)
      from porra_likes l where l.user_id = auth.uid()
    ),
    'notifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'class', n.class, 'title', n.title, 'body', n.body, 'url', n.url,
        'created_at', n.created_at, 'read_at', n.read_at
      ) order by n.created_at), '[]'::jsonb)
      from notifications n where n.user_id = auth.uid()
    ),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'group_id', g.id, 'name', g.name, 'joined_at', m.joined_at
      ) order by m.joined_at), '[]'::jsonb)
      from group_members m join groups g on g.id = m.group_id
      where m.user_id = auth.uid()
    ),
    'daily_answers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day_id', a.day_id, 'option_idx', a.option_idx, 'correct', a.correct,
        'pts', a.pts, 'created_at', a.created_at
      ) order by a.created_at), '[]'::jsonb)
      from daily_pick_answers a where a.user_id = auth.uid()
    ),
    'ad_rewards', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'impression_id', i.impression_id, 'slot', i.slot, 'amount', i.amount,
        'status', i.status, 'created_at', i.created_at
      ) order by i.created_at), '[]'::jsonb)
      from ad_impressions i where i.user_id = auth.uid()
    ),
    'push_subscriptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'endpoint', s.endpoint, 'ua', s.ua, 'created_at', s.created_at, 'revoked_at', s.revoked_at
      ) order by s.created_at), '[]'::jsonb)
      from push_subscriptions s where s.user_id = auth.uid()
    )
  ) end
$$;
revoke execute on function public.export_me() from public, anon;
grant execute on function public.export_me() to authenticated;

-- ---------- delete_me(): anonimiza la cuenta de la sesión ----------
create or replace function public.delete_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid := auth.uid();
  v_handle text;
  n        int := 0;
begin
  if v_id is null then raise exception 'VINKO_NO_AUTH'; end if;
  if not exists (select 1 from profiles where id = v_id) then raise exception 'VINKO_NO_PROFILE'; end if;

  -- Ya borrada: no hay nada más que hacer (idempotente).
  if exists (select 1 from profiles where id = v_id and deleted_at is not null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Seudónimo estable. handle es ^[a-z0-9_]{3,24}$ (0001): guion bajo, no guion.
  v_handle := 'borrado_' || left(md5(v_id::text), 8);
  while exists (select 1 from profiles where handle = v_handle and id <> v_id) loop
    n := n + 1;
    v_handle := 'borrado_' || left(md5(v_id::text || n::text), 8);
  end loop;

  -- PII fuera. lang es NOT NULL (0001): vuelve al default. points a 0 en
  -- servidor (el cliente nunca los escribe). Contadores de juego a cero para
  -- que la cuenta no siga apareciendo en rankings.
  update profiles set
    handle         = v_handle,
    avatar_url     = null,
    birth_year     = null,
    lang           = 'es',
    referred_by    = null,
    points         = 0,
    title          = null,
    frame          = null,
    xp             = 0,
    marcador_total = 0,
    streak_days    = 0,
    streak_best    = 0,
    division       = 'bronce',
    deleted_at     = now()
  where id = v_id;

  -- Columnas de otras migraciones (0036 intereses, 0035 juez de grupo): solo si existen.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'interests') then
    execute 'update public.profiles set interests = ''{}'' where id = $1' using v_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'groups' and column_name = 'judge_id') then
    execute 'update public.groups set judge_id = null where judge_id = $1' using v_id;
  end if;

  -- Avisos, push, grupos y ligas: fuera.
  delete from notifications      where user_id = v_id;
  delete from push_subscriptions where user_id = v_id;
  delete from push_prefs         where user_id = v_id;
  delete from push_queue         where user_id = v_id and status = 'queued';
  delete from group_members      where user_id = v_id;
  delete from league_members     where user_id = v_id;

  -- Comentarios: se conserva el hilo, sin el texto.
  update porra_comments set body = '[borrado]' where user_id = v_id and body <> '[borrado]';

  -- Porras donde era juez invitado: vuelve a decidir el creador.
  update porras set arbiter_id = null, arbiter_status = 'creator'
   where arbiter_id = v_id and status = 'open';

  -- Los picks (y pick_scores, daily_pick_answers, ad_impressions) se quedan:
  -- son el reparto de cada porra y el libro de anuncios, ya sin nombre.
  return jsonb_build_object('ok', true, 'handle', v_handle);
end $$;
revoke execute on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
