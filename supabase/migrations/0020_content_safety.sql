-- ============================================================================
-- VINKO — 0020: matcher de SEGURIDAD de contenido aplicado de verdad. Bloquea
-- publicar (y marca en la generación) porras con violencia/muerte, menores,
-- sexual explícito, drogas, armas/ilegal u odio. Producto +18 con landings
-- públicas: esto no puede colarse.
-- ============================================================================
create or replace function public.content_unsafe(p text) returns boolean
language sql immutable as $$
  select coalesce(p,'') ~* '(\yasesin|\ymatar\M|homicid|apu.alar|tiroteo|masacre|terror|atentad|suicid|autoles|descuartiz|linch|pederast|pedofil|abuso infantil|menor desnud|porno|pornograf|contenido expl.cit|prostituci|zoofil|violaci|coca.na|hero.na|metanfetam|fentanil|narcotr|traficar droga|vender droga|\yarma de fuego|explosiv|bomba casera|trata de personas|blanque|documento falso|genocid|limpieza .tnica|apolog.a nazi|incita.*odio|incidentes violent|\yviolent)'
$$;
grant execute on function public.content_unsafe(text) to anon, authenticated;

-- publish_proposal: además de léxico/cuotas y criterio, BLOQUEA contenido inseguro
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
  if public.content_unsafe(pr.title || ' ' || coalesce(pr.options::text, '')) then
    raise exception 'VINKO_UNSAFE';
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

-- porras de usuario (source=user): mismo veto de seguridad al insertar
create or replace function public.porras_safety_guard() returns trigger
language plpgsql as $$
begin
  if public.content_unsafe(coalesce(new.title,'')) then
    raise exception 'VINKO_UNSAFE: contenido no permitido';
  end if;
  return new;
end $$;
drop trigger if exists trg_porras_safety on public.porras;
create trigger trg_porras_safety before insert on public.porras
  for each row execute function public.porras_safety_guard();
