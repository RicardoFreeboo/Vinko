-- ============================================================================
-- VINKO — 0019: arregla la RECURSIÓN INFINITA en RLS (error 42P17) que dejaba
-- el feed vacío. Las políticas que miraban group_members se referenciaban entre
-- sí; se sustituyen por helpers security-definer (que saltan RLS y cortan el
-- bucle). También publish_proposal genera slug único (evita colisiones).
-- ============================================================================

create or replace function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from group_members where group_id = g and user_id = auth.uid()) $$;
grant execute on function public.is_group_member(uuid) to anon, authenticated;

create or replace function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from group_members m1 join group_members m2 on m1.group_id = m2.group_id
     where m1.user_id = other and m2.user_id = auth.uid()) $$;
grant execute on function public.shares_group(uuid) to anon, authenticated;

-- group_members: sin auto-referencia
drop policy if exists gm_read_member on public.group_members;
create policy gm_read_member on public.group_members for select
  using (public.is_group_member(group_id) or user_id = auth.uid() or public.is_admin());

-- groups
drop policy if exists groups_read_member on public.groups;
create policy groups_read_member on public.groups for select
  using (public.is_group_member(id) or created_by = auth.uid() or public.is_admin());

-- group_reactions
drop policy if exists gr_read_member on public.group_reactions;
create policy gr_read_member on public.group_reactions for select
  using (public.is_group_member(group_id));
drop policy if exists gr_insert_member on public.group_reactions;
create policy gr_insert_member on public.group_reactions for insert
  with check (reactor = auth.uid() and public.is_group_member(group_id));

-- porras: usa shares_group en la rama privada (sin subconsulta recursiva)
drop policy if exists porras_read on public.porras;
create policy porras_read on public.porras for select using (
  (visibility = 'public' and status in ('open','resolved'))
  or created_by = auth.uid()
  or public.is_admin()
  or (visibility = 'private' and public.shares_group(created_by))
);

-- publish_proposal: slug SIEMPRE único (evita que aprobar falle por colisión)
create or replace function public.publish_proposal(p_id uuid, p_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare pr topic_proposals%rowtype; v_porra uuid; opt text; i int := 0; v_slug text;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select * into pr from topic_proposals where id = p_id for update;
  if not found or pr.status <> 'pending_review' then raise exception 'VINKO_BAD_STATE'; end if;
  if pr.resolution_criteria is null or char_length(pr.resolution_criteria) < 5 then
    raise exception 'VINKO_NO_RESOLUTION';
  end if;
  v_slug := left(coalesce(nullif(p_slug, ''), 'porra'), 60) || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  if pr.kind = 'daily' then
    insert into daily_picks (scheduled_for, lang, question, options, status, source_url)
      values (coalesce(pr.closes_at, now())::date, pr.lang, pr.title, pr.options, 'scheduled', pr.source_url);
  else
    insert into porras (slug, title, source, status, closes_at, category, visibility)
      values (v_slug, left(pr.title, 120), 'editorial', 'open',
              greatest(coalesce(pr.closes_at, now() + interval '2 days'), now() + interval '1 hour'),
              pr.category, 'public')
      returning id into v_porra;
    for opt in select value from jsonb_array_elements_text(pr.options) loop
      insert into porra_options (porra_id, idx, label) values (v_porra, i, left(opt, 40));
      i := i + 1;
    end loop;
  end if;
  update topic_proposals set status = 'published' where id = p_id;
  if pr.signal_id is not null then update signals set status = 'generated' where id = pr.signal_id; end if;
  return v_porra;
end $$;
