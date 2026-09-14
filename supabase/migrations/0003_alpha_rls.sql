-- ============================================================================
-- VINKO ALFA — 0003: RLS y privilegios de columna
-- Lectura pública de porras open/resolved no-taken_down; solo creador resuelve
-- (vía RPC); pick solo propio; points solo servidor; /admin solo role=admin.
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.porras           enable row level security;
alter table public.porra_options    enable row level security;
alter table public.picks            enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.topic_proposals  enable row level security;
alter table public.ad_impressions   enable row level security;

-- ---------------- profiles ----------------
-- Lectura pública: /u/[handle] solo existe para usuarios reales.
create policy profiles_read on public.profiles
  for select using (true);
-- Actualizar solo el propio perfil; points y role quedan fuera por privilegios
-- de columna (abajo): el cliente NO puede tocarlos ni con esta policy.
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (handle, avatar_url, birth_year, lang) on public.profiles to authenticated;
-- (insert lo hace el trigger handle_new_user; delete, nadie desde el cliente)

-- ---------------- porras ----------------
-- taken_down desaparece del público; el creador ve las suyas; admin ve todo.
create policy porras_read on public.porras
  for select using (
    status in ('open','resolved') or created_by = auth.uid() or public.is_admin()
  );
-- Crear: solo porras propias de source=user. Las plantillas (source=template)
-- y editoriales (source=editorial) se insertan con service role desde el panel.
create policy porras_insert_own on public.porras
  for insert with check (
    created_by = auth.uid() and source = 'user' and is_template = false and status = 'open'
  );
-- Resolver va por RPC (resolve_porra, security definer). Update directo: solo admin
-- (moderación: taken_down, ediciones).
create policy porras_admin_update on public.porras
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------- porra_options ----------------
create policy options_read on public.porra_options
  for select using (
    exists (
      select 1 from public.porras p
      where p.id = porra_id
        and (p.status in ('open','resolved') or p.created_by = auth.uid() or public.is_admin())
    )
  );
create policy options_insert_own on public.porra_options
  for insert with check (
    exists (
      select 1 from public.porras p
      where p.id = porra_id and p.created_by = auth.uid() and p.status = 'open'
    )
  );

-- ---------------- picks ----------------
-- Insert/update/delete: SIN policies → solo make_pick() (security definer).
create policy picks_read_own on public.picks
  for select using (user_id = auth.uid());
-- Ranking de ESA porra al resolverse: los picks de porras resueltas son legibles.
create policy picks_read_resolved on public.picks
  for select using (
    exists (select 1 from public.porras p where p.id = porra_id and p.status = 'resolved')
  );
create policy picks_read_admin on public.picks
  for select using (public.is_admin());

-- ---------------- moderación y temas editoriales: solo admin ----------------
create policy modq_admin on public.moderation_queue
  for all using (public.is_admin()) with check (public.is_admin());
create policy topics_admin on public.topic_proposals
  for all using (public.is_admin()) with check (public.is_admin());
-- (el matcher de lista negra y el cron escriben con service role, que ignora RLS)

-- ---------------- ad_impressions ----------------
-- Crédito SOLO desde la Edge Function con service role. El cliente solo lee las suyas.
create policy ads_read_own on public.ad_impressions
  for select using (user_id = auth.uid());
create policy ads_read_admin on public.ad_impressions
  for select using (public.is_admin());
