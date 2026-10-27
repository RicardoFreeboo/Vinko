-- ============================================================================
-- VINKO — 0080: lote de vídeos IA del 27-oct-2026 para porras abiertas sin vídeo.
-- El feed va vídeo-primero y el smoke de producción exige ≥ 3 con vídeo; del
-- lote del 21-sep (scripts/sql/2026-09-21-videos.sql) solo quedaban 3 abiertas
-- y cierran entre el 29-oct y el 5-nov.
--
-- 4 vídeos Kling 3.0 Turbo (9:16, 5 s) → MP4 H.264 540x960 sin audio, servidos
-- desde public/v/agent/ con su .thumb.jpg al lado (lib/thumb.ts). Solo las
-- porras que siguen abiertas hasta mediados de noviembre; las que cierran del
-- 29 al 31-oct se quedan con la portada temática.
--
-- Idempotente (el deploy re-aplica las ≥ 72): solo enlaza si la porra sigue
-- abierta y aún no tiene media; en una base vacía no toca nada.
-- ============================================================================

update public.porras set media_url = '/v/agent/sera-carnaval-de-luz-de-u2-numero-1-en.mp4', media_kind = 'video'
  where id = 'f1c49f1d-a915-43bc-b755-fed465f0d4b0' and status = 'open' and media_url is null;
update public.porras set media_url = '/v/agent/sera-ivana-icardi-expulsada-antes-de-la.mp4', media_kind = 'video'
  where id = 'ed12bf5d-83ff-420b-b7be-16e13b9771de' and status = 'open' and media_url is null;
update public.porras set media_url = '/v/agent/quien-ganara-el-enfrentamiento-entre-we.mp4', media_kind = 'video'
  where id = 'b41ef69d-101b-470c-a39d-71bb1ec8cdaf' and status = 'open' and media_url is null;
update public.porras set media_url = '/v/agent/ganara-westcol-su-pelea-contra-blessd-e.mp4', media_kind = 'video'
  where id = '2b182e00-c9cc-43c3-bf2a-8c57972fb41c' and status = 'open' and media_url is null;
