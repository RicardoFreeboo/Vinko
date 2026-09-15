-- ============================================================================
-- VINKO — 0017: visibilidad pública/privada (§8) + almacén de vídeo/foto/voz de
-- usuario (§6). Privada = solo la ven el creador y quien comparte grupo con él.
-- ============================================================================
alter table public.porras
  add column visibility text not null default 'public' check (visibility in ('public','private')),
  add column media_url  text,   -- vídeo/foto subido o grabado por el creador
  add column media_kind text check (media_kind in ('video','image','audio'));

-- lectura: públicas open/resolved para todos; privadas solo creador + compañeros
-- de grupo; el creador siempre ve las suyas; admin todo.
drop policy if exists porras_read on public.porras;
create policy porras_read on public.porras for select using (
  (visibility = 'public' and status in ('open','resolved'))
  or created_by = auth.uid()
  or public.is_admin()
  or (visibility = 'private' and exists (
        select 1 from group_members m1
        join group_members m2 on m1.group_id = m2.group_id
        where m1.user_id = porras.created_by and m2.user_id = auth.uid()))
);

-- almacén de medios subidos por usuarios (Supabase Storage). Lectura pública
-- (el vídeo se sirve en /p tras moderación); subida solo autenticados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porra-media', 'porra-media', true, 52428800,
        array['video/mp4','video/webm','image/jpeg','image/png','image/webp','audio/webm','audio/mpeg','audio/mp4'])
on conflict (id) do nothing;

drop policy if exists "porra_media_read" on storage.objects;
create policy "porra_media_read" on storage.objects for select using (bucket_id = 'porra-media');
drop policy if exists "porra_media_insert" on storage.objects;
create policy "porra_media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'porra-media');
