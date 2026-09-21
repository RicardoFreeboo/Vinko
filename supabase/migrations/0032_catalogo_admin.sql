-- 0032 — Catálogo del agente + edición de propuestas desde /admin (21-sep-2026)
-- El agente v3 (trend-generate) ya no estima fechas ni publica solo: un humano
-- corrige y aprueba en /admin/temas, y decide en /admin/catalogo qué entidades
-- se vigilan. Todo idempotente; RPCs security definer con is_admin().

-- 1) topic_proposals: titular y enlace de la noticia origen (el revisor ve de
--    dónde sale la porra) y marca de edición.
alter table public.topic_proposals add column if not exists source_title text;
alter table public.topic_proposals add column if not exists updated_at timestamptz;

-- 2) Editar una propuesta PENDIENTE (solo admin). Misma barrera que publicar:
--    pregunta 8–140, 2–6 opciones distintas (≤80), cierre futuro obligatorio,
--    criterio de resolución, sin contenido inseguro ni menores. El léxico de
--    cuotas lo corta el trigger trg_topics_odds (0011).
create or replace function public.update_proposal(
  p_id uuid, p_title text, p_options jsonb, p_closes_at timestamptz, p_criteria text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_crit  text := trim(coalesce(p_criteria, ''));
  v_opts  jsonb;
  v_n     int;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if not exists (select 1 from topic_proposals where id = p_id and status = 'pending_review') then
    raise exception 'VINKO_BAD_STATE';
  end if;
  if char_length(v_title) not between 8 and 140 then raise exception 'VINKO_BAD_TITLE'; end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception 'VINKO_BAD_OPTIONS'; end if;
  select jsonb_agg(trim(e)), count(*) into v_opts, v_n
    from jsonb_array_elements_text(p_options) e where char_length(trim(e)) between 1 and 80;
  if v_n is null or v_n <> jsonb_array_length(p_options) or v_n not between 2 and 6 then
    raise exception 'VINKO_BAD_OPTIONS';
  end if;
  if (select count(distinct lower(e)) from jsonb_array_elements_text(v_opts) e) <> v_n then
    raise exception 'VINKO_BAD_OPTIONS';
  end if;
  if char_length(v_crit) < 5 then raise exception 'VINKO_NO_RESOLUTION'; end if;
  if p_closes_at is null or p_closes_at < now() + interval '1 hour' then raise exception 'VINKO_BAD_DATE'; end if;
  if public.content_unsafe(v_title || ' ' || v_opts::text) then raise exception 'VINKO_UNSAFE'; end if;
  if public.content_minor(v_title || ' ' || v_opts::text) then raise exception 'VINKO_MENOR'; end if;
  update topic_proposals
     set title = v_title, options = v_opts, closes_at = p_closes_at,
         resolution_criteria = v_crit, updated_at = now()
   where id = p_id;
end $$;
revoke execute on function public.update_proposal(uuid, text, jsonb, timestamptz, text) from public, anon;
grant execute on function public.update_proposal(uuid, text, jsonb, timestamptz, text) to authenticated;

-- 3) Descartar una propuesta pendiente (solo admin). La señal origen queda
--    'rejected' para que el barrido no la vuelva a procesar.
create or replace function public.reject_proposal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_sig uuid;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update topic_proposals set status = 'discarded', updated_at = now()
   where id = p_id and status = 'pending_review'
   returning signal_id into v_sig;
  if not found then raise exception 'VINKO_BAD_STATE'; end if;
  if v_sig is not null then update signals set status = 'rejected' where id = v_sig; end if;
end $$;
revoke execute on function public.reject_proposal(uuid) from public, anon;
grant execute on function public.reject_proposal(uuid) to authenticated;

-- 4) tracked_entities: fecha de edición + políticas explícitas SIN borrado.
--    La baja lógica ya existe como `activo` (0024); no se añade `active`.
alter table public.tracked_entities add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
-- Solo cuando cambia algo editable: el barrido toca last_swept_at cada 3 h y
-- no debe contar como edición.
drop trigger if exists tracked_entities_touch on public.tracked_entities;
create trigger tracked_entities_touch
  before update of nombre, categoria, palabras_clave, handles, pais, activo on public.tracked_entities
  for each row execute function public.touch_updated_at();

-- Forma mínima (NOT VALID: no bloquea filas antiguas, sí las nuevas).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tracked_entities_nombre_chk') then
    alter table public.tracked_entities add constraint tracked_entities_nombre_chk
      check (char_length(trim(nombre)) between 2 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tracked_entities_categoria_chk') then
    alter table public.tracked_entities add constraint tracked_entities_categoria_chk
      check (categoria ~ '^[a-z][a-z0-9_]{2,29}$') not valid;
  end if;
end $$;

-- RLS: select / insert / update para admin; NINGUNA política de delete.
-- (La política te_write_admin de 0024 era "for all" e incluía borrar.)
alter table public.tracked_entities enable row level security;
drop policy if exists te_read_admin  on public.tracked_entities;
drop policy if exists te_write_admin on public.tracked_entities;
drop policy if exists te_select_admin on public.tracked_entities;
drop policy if exists te_insert_admin on public.tracked_entities;
drop policy if exists te_update_admin on public.tracked_entities;
create policy te_select_admin on public.tracked_entities
  for select using (public.is_admin());
create policy te_insert_admin on public.tracked_entities
  for insert with check (public.is_admin());
create policy te_update_admin on public.tracked_entities
  for update using (public.is_admin()) with check (public.is_admin());
revoke delete on public.tracked_entities from anon, authenticated;
grant select, insert, update on public.tracked_entities to authenticated;

notify pgrst, 'reload schema';
