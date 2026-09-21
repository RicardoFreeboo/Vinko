-- 0041 — Crear porra en 30 s (F-03, 21-sep-2026)
-- (a) porras.resolution_criteria: cómo se sabrá quién acierta (obligatorio en
--     porras de usuario nuevas). Antes solo existía en topic_proposals.
-- (b) porras.resolves_at: fecha de resolución esperada (puede = closes_at).
-- (c) porras.template_key: plantilla usada en /nueva (partido, reality, boda…).
-- (d) Reglas F-03 en BEFORE INSERT, solo source='user': criterio ≥ 5 letras y
--     cierre entre 15 min y 12 meses ("cápsula del tiempo"). Trigger, no CHECK:
--     las filas antiguas no se tocan. Errores: VINKO_CRITERIA / VINKO_CLOSE_RANGE.
-- (e) porra_options: no se cambian etiquetas ni se borran opciones tras el
--     primer pronóstico de alguien que no sea el creador (VINKO_LOCKED).
-- Idempotente: se puede aplicar dos veces sin efecto.

alter table public.porras add column if not exists resolution_criteria text;
alter table public.porras add column if not exists resolves_at         timestamptz;
alter table public.porras add column if not exists template_key        text;

-- Para el recordatorio al juez (F-04): porras abiertas por fecha esperada.
create index if not exists porras_resolves_at_idx on public.porras (resolves_at)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- (d) Guardia de creación: solo porras de usuario (plantillas y editoriales
--     siguen entrando por service role sin estas reglas).
-- ---------------------------------------------------------------------------
create or replace function public.porras_crear_guard() returns trigger
language plpgsql as $$
begin
  if new.source <> 'user' then return new; end if;

  new.resolution_criteria := left(trim(coalesce(new.resolution_criteria, '')), 280);
  if char_length(new.resolution_criteria) < 5 then
    raise exception 'VINKO_CRITERIA';
  end if;

  -- 15 min de margen mínimo; 12 meses de máximo (más 1 h de holgura de reloj).
  if new.closes_at < now() + interval '15 minutes'
     or new.closes_at > now() + interval '12 months' + interval '1 hour' then
    raise exception 'VINKO_CLOSE_RANGE';
  end if;

  -- Resolución esperada: nunca antes del cierre; por defecto, el cierre.
  if new.resolves_at is null or new.resolves_at < new.closes_at then
    new.resolves_at := new.closes_at;
  end if;
  new.template_key := nullif(left(trim(coalesce(new.template_key, '')), 32), '');
  return new;
end $$;

drop trigger if exists trg_porras_crear on public.porras;
create trigger trg_porras_crear before insert on public.porras
  for each row execute function public.porras_crear_guard();

-- ---------------------------------------------------------------------------
-- (e) Opciones bloqueadas tras el primer pronóstico ajeno. El admin puede
--     corregir una errata (moderación); el creador y cualquier otro, no.
-- ---------------------------------------------------------------------------
create or replace function public.porra_options_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  if public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.label is not distinct from old.label then return new; end if;

  select created_by into v_creator from porras where id = old.porra_id;
  if exists (
    select 1 from picks k
    where k.porra_id = old.porra_id and k.user_id is distinct from v_creator
  ) then
    raise exception 'VINKO_LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_porra_options_lock on public.porra_options;
create trigger trg_porra_options_lock before update of label or delete on public.porra_options
  for each row execute function public.porra_options_lock();

notify pgrst, 'reload schema';
