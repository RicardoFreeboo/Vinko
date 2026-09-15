-- ============================================================================
-- VINKO — 0022: capa social (likes + comentarios con "quién va con qué" para la
-- polémica) + AUTO-PUBLICADO del agente (el scraper mete porras reales en la
-- app, no plantillas). El auto-publish SOLO saca las limpias/seguras/resolubles;
-- las dudosas se quedan en la cola para revisión humana.
-- ============================================================================

-- ---------- likes ----------
create table public.porra_likes (
  porra_id uuid not null references public.porras(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (porra_id, user_id)
);
alter table public.porra_likes enable row level security;
create policy likes_read on public.porra_likes for select using (true);

-- ---------- comentarios ----------
create table public.porra_comments (
  id uuid primary key default gen_random_uuid(),
  porra_id uuid not null references public.porras(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  body     text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.porra_comments enable row level security;
create policy comments_read on public.porra_comments for select using (true);

create or replace function public.toggle_like(p_porra uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_liked boolean;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if exists (select 1 from porra_likes where porra_id = p_porra and user_id = auth.uid()) then
    delete from porra_likes where porra_id = p_porra and user_id = auth.uid(); v_liked := false;
  else
    insert into porra_likes (porra_id, user_id) values (p_porra, auth.uid()); v_liked := true;
  end if;
  return jsonb_build_object('liked', v_liked, 'count', (select count(*) from porra_likes where porra_id = p_porra));
end $$;
grant execute on function public.toggle_like(uuid) to authenticated;

create or replace function public.add_comment(p_porra uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v porras%rowtype;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if char_length(trim(p_body)) < 1 then raise exception 'VINKO_EMPTY'; end if;
  if public.content_unsafe(p_body) then raise exception 'VINKO_UNSAFE'; end if;
  insert into porra_comments (porra_id, user_id, body) values (p_porra, auth.uid(), left(trim(p_body), 300));
  select * into v from porras where id = p_porra;
  if v.created_by is not null and v.created_by <> auth.uid() then
    perform notify_user(v.created_by, 'social', 'Nuevo comentario en tu porra',
      left(p_body, 60), '/p/' || v.slug);
  end if;
end $$;
grant execute on function public.add_comment(uuid, text) to authenticated;

-- social de una porra: likes, quién apostó qué, y comentarios (con el voto del
-- que comenta, para que se vea la polémica).
create or replace function public.porra_social(p_porra uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'likes', (select count(*) from porra_likes where porra_id = p_porra),
    'liked', (select exists (select 1 from porra_likes where porra_id = p_porra and user_id = auth.uid())),
    'picks', coalesce((
      select jsonb_agg(jsonb_build_object('handle', pr.handle, 'avatar', pr.avatar_url, 'option', o.label, 'idx', o.idx) order by k.created_at)
      from picks k join profiles pr on pr.id = k.user_id join porra_options o on o.id = k.option_id
      where k.porra_id = p_porra), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('handle', pr.handle, 'avatar', pr.avatar_url, 'body', c.body, 'ts', c.created_at,
        'option', (select o.label from picks k join porra_options o on o.id = k.option_id where k.porra_id = p_porra and k.user_id = c.user_id)) order by c.created_at)
      from porra_comments c join profiles pr on pr.id = c.user_id where c.porra_id = p_porra), '[]'::jsonb)
  );
$$;
grant execute on function public.porra_social(uuid) to anon, authenticated;

-- ---------- AUTO-PUBLICADO del agente ----------
-- Publica hasta N candidatas LIMPIAS (sin banderas rojas, con criterio, seguras)
-- como porras editoriales. Las dudosas se quedan en la cola. (Cambia la regla
-- del freeze "el cron nunca publica solo" por decisión explícita de Ricardo,
-- con estas guardas.)
create or replace function public.agent_autopublish(p_max int default 6) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_slug text; opt text; i int;
begin
  for r in
    select * from topic_proposals
    where status = 'pending_review' and kind = 'porra'
      and resolution_criteria is not null and char_length(resolution_criteria) >= 5
      and char_length(title) between 8 and 120
      and not (flags ?| array['lexico','cuotas','invalida','seguridad','pregunta','opciones','sin_resolucion'])
      and not public.content_unsafe(title || ' ' || coalesce(options::text, ''))
      -- calidad: 2-6 opciones y NINGUNA tan larga que se corte (se veía rota)
      and (select count(*) from jsonb_array_elements_text(options)) between 2 and 6
      and not exists (select 1 from jsonb_array_elements_text(options) e
                      where char_length(e) > 80 or char_length(trim(e)) < 1)
    order by created_at limit greatest(least(p_max, 12), 1)
  loop
    v_slug := left(trim(both '-' from regexp_replace(translate(lower(left(r.title,40)),'áéíóúñ¿?¡!,.:;','aeioun'),'[^a-z0-9]+','-','g')),50)
              || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    insert into porras (slug, title, source, status, closes_at, category, visibility)
      values (v_slug, left(r.title,120), 'editorial', 'open',
              greatest(coalesce(r.closes_at, now()+interval '2 days'), now()+interval '2 hours'), r.category, 'public');
    i := 0;
    for opt in select value from jsonb_array_elements_text(r.options) loop
      insert into porra_options (porra_id, idx, label)
        select id, i, left(opt,80) from porras where slug = v_slug;
      i := i + 1;
    end loop;
    update topic_proposals set status = 'published' where id = r.id;
    if r.signal_id is not null then update signals set status = 'generated' where id = r.signal_id; end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.agent_autopublish(int) from public, anon;
grant execute on function public.agent_autopublish(int) to authenticated;

-- crons: barrer cada 3h y auto-publicar 5 min después
select cron.schedule('vinko-agent-sweep', '0 */3 * * *', $$
  select net.http_post(
    url := 'https://uarnpxjdccbidgzhhavc.supabase.co/functions/v1/trend-generate',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select value from internal.secrets where key='cron_secret')),
    body := '{"limit":6}'::jsonb)
$$);
select cron.schedule('vinko-agent-publish', '5 */3 * * *', $$ select public.agent_autopublish(6) $$);
