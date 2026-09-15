-- ============================================================================
-- VINKO — 0028: PATROCINADOR del anuncio recompensado (nivel 1 de la cascada).
--
-- Cascada del rewarded (§4.2):
--   1. PATROCINADOR directo  -> vídeo real de un anunciante que paga. Ingreso
--      real sin depender de Google, funciona con 1 solo anunciante.
--   2. Google Ad Manager     -> cuando haya unidad rewarded (ya cableado).
--   3. House ad              -> vídeo propio de Vinko. Siempre hay relleno.
--
-- Nada de esto toca dinero de usuarios: el anunciante paga a Vinko fuera de la
-- app. Aquí solo se sirve el creativo y se concede la recompensa por servidor.
--
-- AVISO: jamás meter aquí creativos de casas de apuestas, casino o juego real
-- (reglas de oro). El campo existe para patrocinadores normales.
-- ============================================================================
insert into public.remote_config (key, value)
values ('sponsor', jsonb_build_object(
  'enabled', false,
  'video_url', '',
  'title', '',
  'cta', '',
  'cta_url', '',
  'seconds', 10
))
on conflict (key) do nothing;

-- Devuelve el creativo a servir en el rewarded. Público para usuarios con
-- sesión: no expone nada sensible, solo el anuncio que se va a ver.
create or replace function public.get_rewarded_creative()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when coalesce((cfg('sponsor')->>'enabled')::boolean, false)
     and coalesce(cfg('sponsor')->>'video_url', '') <> ''
    then jsonb_build_object(
      'kind', 'sponsor',
      'video_url', cfg('sponsor')->>'video_url',
      'title',     cfg('sponsor')->>'title',
      'cta',       cfg('sponsor')->>'cta',
      'cta_url',   cfg('sponsor')->>'cta_url',
      'seconds',   coalesce((cfg('sponsor')->>'seconds')::int, 10))
    else jsonb_build_object(
      'kind', 'house',
      'video_url', coalesce(cfg('ads')->>'house_video_url', ''),
      'title', '', 'cta', '', 'cta_url', '',
      'seconds', 5)
  end;
$$;
grant execute on function public.get_rewarded_creative() to authenticated;
