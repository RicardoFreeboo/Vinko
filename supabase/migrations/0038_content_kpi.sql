-- ============================================================================
-- VINKO — 0038: contenido y KPIs para el lanzamiento (21-sep-2026)
--
-- Cuatro bloques del spec de lanzamiento, todos idempotentes (se puede aplicar
-- dos veces sin efecto) y sin tocar funciones de otras migraciones:
--   §1 R-04  Banco evergreen del pique del día + modo degradado + alerta de buffer
--   §2 K-04  Rollup diario daily_kpis (DAU/WAU/MAU, altas, D1/D7/D30 por cohorte)
--   §3 G-06  Anti-abuso: hash de dispositivo, flag suspect, fuera de ligas
--   §4 K-03  Eventos de servidor → PostHog EU (pg_net), sin depender del cliente
--
-- Reglas que respeta:
--   · Nada de aquí escribe Puntería ni Vinkos.
--   · Ningún trigger puede romper una escritura: cuerpo en begin/exception.
--   · Copy que llega al usuario sin léxico prohibido (scripts/lexicon-check.mjs).
--   · Cuentas is_internal / suspect fuera de KPIs y de ligas.
-- Jobs pg_cron nuevos (todos en UTC): vinko-daily-fallback (06:35),
-- vinko-daily-fallback-cet (07:35), vinko-buffer-alert (07:00),
-- vinko-kpi-rollup (02:00), vinko-flag-suspects (cada hora, :17).
-- ============================================================================


-- ============================================================================
-- §1 R-04 — Banco evergreen + modo degradado
-- ============================================================================

-- Banco de piques que se resuelven con datos públicos y no caducan. La
-- pregunta es la clave (así el INSERT de abajo es idempotente). months/dows
-- acotan cuándo tiene sentido (umbral de verano, bolsa solo en día hábil…).
create table if not exists public.evergreen_bank (
  id           uuid primary key default gen_random_uuid(),
  question     text not null check (char_length(question) between 5 and 160),
  options      jsonb not null,
  criteria     text not null,
  category     text,
  weight       int not null default 1 check (weight between 0 and 10),
  months       smallint[],          -- meses 1–12 en los que aplica; null = todo el año
  dows         smallint[],          -- días ISO 1=lunes … 7=domingo; null = cualquiera
  source_url   text,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.evergreen_bank add column if not exists months smallint[];
alter table public.evergreen_bank add column if not exists dows smallint[];
alter table public.evergreen_bank add column if not exists source_url text;
create unique index if not exists evergreen_bank_question_key on public.evergreen_bank (question);
create index if not exists evergreen_bank_lru_idx on public.evergreen_bank (last_used_at nulls first, weight desc);
alter table public.evergreen_bank enable row level security;
drop policy if exists evergreen_admin on public.evergreen_bank;
create policy evergreen_admin on public.evergreen_bank
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.evergreen_bank from anon;

-- daily_picks: origen del pique, criterio de resolución visible al resolver y
-- enlace a la fila del banco de la que salió.
alter table public.daily_picks add column if not exists source text not null default 'editorial';
alter table public.daily_picks add column if not exists criteria text;
alter table public.daily_picks add column if not exists evergreen_id uuid references public.evergreen_bank(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'daily_picks_source_check') then
    alter table public.daily_picks add constraint daily_picks_source_check
      check (source in ('editorial', 'evergreen', 'agent'));
  end if;
end $$;
create index if not exists daily_picks_day_status_idx on public.daily_picks (scheduled_for, status);

-- >>> EVERGREEN BANK
-- 113 filas generadas por scripts/evergreen-bank.mjs (no editar a mano: regenerar con --write)
insert into public.evergreen_bank (question, options, criteria, category, weight, months, dows, source_url) values
  ('¿Llueve mañana en Madrid? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Barcelona? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Sevilla? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Valencia? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Bilbao? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Zaragoza? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana en Málaga? (≥ 1 mm según AEMET)', '["Llueve (≥ 1 mm)","No llega a 1 mm"]'::jsonb, 'Precipitación acumulada de MAÑANA (00:00–23:59) ≥ 1 mm en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 3, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 13 °C la máxima en Madrid mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 13,0 °C (13,0 no pasa) en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 20 °C la máxima en Madrid mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 20,0 °C (20,0 no pasa) en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5,10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 32 °C la máxima en Madrid mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 32,0 °C (32,0 no pasa) en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 15 °C la máxima en Barcelona mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 15,0 °C (15,0 no pasa) en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 20 °C la máxima en Barcelona mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 20,0 °C (20,0 no pasa) en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 29 °C la máxima en Barcelona mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 29,0 °C (29,0 no pasa) en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 21 °C la máxima en Barcelona mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 21,0 °C (21,0 no pasa) en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 17 °C la máxima en Sevilla mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 17,0 °C (17,0 no pasa) en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 25 °C la máxima en Sevilla mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 25,0 °C (25,0 no pasa) en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5,10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 36 °C la máxima en Sevilla mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 36,0 °C (36,0 no pasa) en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 17 °C la máxima en Valencia mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 17,0 °C (17,0 no pasa) en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 22 °C la máxima en Valencia mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 22,0 °C (22,0 no pasa) en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 30 °C la máxima en Valencia mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 30,0 °C (30,0 no pasa) en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 23 °C la máxima en Valencia mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 23,0 °C (23,0 no pasa) en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 13 °C la máxima en Bilbao mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 13,0 °C (13,0 no pasa) en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 18 °C la máxima en Bilbao mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 18,0 °C (18,0 no pasa) en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 26 °C la máxima en Bilbao mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 26,0 °C (26,0 no pasa) en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 19 °C la máxima en Bilbao mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 19,0 °C (19,0 no pasa) en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 12 °C la máxima en Zaragoza mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 12,0 °C (12,0 no pasa) en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 20 °C la máxima en Zaragoza mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 20,0 °C (20,0 no pasa) en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5,10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 33 °C la máxima en Zaragoza mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 33,0 °C (33,0 no pasa) en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 18 °C la máxima en Málaga mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 18,0 °C (18,0 no pasa) en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{1,2,12}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 22 °C la máxima en Málaga mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 22,0 °C (22,0 no pasa) en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{3,4,5}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 30 °C la máxima en Málaga mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 30,0 °C (30,0 no pasa) en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Pasa de 23 °C la máxima en Málaga mañana?', '["Pasa","No llega"]'::jsonb, 'Temperatura máxima de MAÑANA estrictamente mayor que 23,0 °C (23,0 no pasa) en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{10,11}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Sevilla o Madrid? (máxima según AEMET)', '["Sevilla","Madrid","Empate"]'::jsonb, 'Máxima de MAÑANA de Sevilla (Sevilla (Aeropuerto)) frente a Madrid (Madrid-Retiro) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Barcelona o Valencia? (máxima según AEMET)', '["Barcelona","Valencia","Empate"]'::jsonb, 'Máxima de MAÑANA de Barcelona (Barcelona (Aeropuerto)) frente a Valencia (Valencia (Viveros)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Bilbao o Zaragoza? (máxima según AEMET)', '["Bilbao","Zaragoza","Empate"]'::jsonb, 'Máxima de MAÑANA de Bilbao (Bilbao (Aeropuerto)) frente a Zaragoza (Zaragoza (Aeropuerto)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Madrid o Barcelona? (máxima según AEMET)', '["Madrid","Barcelona","Empate"]'::jsonb, 'Máxima de MAÑANA de Madrid (Madrid-Retiro) frente a Barcelona (Barcelona (Aeropuerto)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Málaga o Valencia? (máxima según AEMET)', '["Málaga","Valencia","Empate"]'::jsonb, 'Máxima de MAÑANA de Málaga (Málaga (Aeropuerto)) frente a Valencia (Valencia (Viveros)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Zaragoza o Madrid? (máxima según AEMET)', '["Zaragoza","Madrid","Empate"]'::jsonb, 'Máxima de MAÑANA de Zaragoza (Zaragoza (Aeropuerto)) frente a Madrid (Madrid-Retiro) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Bilbao o Barcelona? (máxima según AEMET)', '["Bilbao","Barcelona","Empate"]'::jsonb, 'Máxima de MAÑANA de Bilbao (Bilbao (Aeropuerto)) frente a Barcelona (Barcelona (Aeropuerto)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Sevilla o Málaga? (máxima según AEMET)', '["Sevilla","Málaga","Empate"]'::jsonb, 'Máxima de MAÑANA de Sevilla (Sevilla (Aeropuerto)) frente a Málaga (Málaga (Aeropuerto)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Valencia o Madrid? (máxima según AEMET)', '["Valencia","Madrid","Empate"]'::jsonb, 'Máxima de MAÑANA de Valencia (Valencia (Viveros)) frente a Madrid (Madrid-Retiro) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Dónde hace más calor mañana: Zaragoza o Sevilla? (máxima según AEMET)', '["Zaragoza","Sevilla","Empate"]'::jsonb, 'Máxima de MAÑANA de Zaragoza (Zaragoza (Aeropuerto)) frente a Sevilla (Sevilla (Aeropuerto)) en décimas; misma cifra = Empate. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Madrid que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Barcelona que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Sevilla que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Valencia que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Bilbao que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Zaragoza que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Hace mañana más calor en Málaga que hoy? (máxima según AEMET)', '["Más calor","Igual o menos"]'::jsonb, 'Máxima de MAÑANA estrictamente mayor que la máxima de HOY (en décimas) en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 0 °C la mínima en Madrid?', '["Baja de 0 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 0,0 °C en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 0 °C la mínima en Zaragoza?', '["Baja de 0 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 0,0 °C en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 3 °C la mínima en Bilbao?', '["Baja de 3 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 3,0 °C en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 3 °C la mínima en Barcelona?', '["Baja de 3 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 3,0 °C en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 5 °C la mínima en Valencia?', '["Baja de 5 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 5,0 °C en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 5 °C la mínima en Sevilla?', '["Baja de 5 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 5,0 °C en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Baja mañana de 7 °C la mínima en Málaga?', '["Baja de 7 °C","Se queda por encima"]'::jsonb, 'Temperatura mínima de MAÑANA estrictamente menor que 7,0 °C en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{12,1,2}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Noche tropical mañana en Sevilla? (mínima de 20 °C o más según AEMET)', '["Sí, 20 °C o más","No, baja de 20 °C"]'::jsonb, 'Temperatura mínima de MAÑANA ≥ 20,0 °C en la estación de referencia de AEMET de Sevilla (Sevilla (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Noche tropical mañana en Valencia? (mínima de 20 °C o más según AEMET)', '["Sí, 20 °C o más","No, baja de 20 °C"]'::jsonb, 'Temperatura mínima de MAÑANA ≥ 20,0 °C en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Noche tropical mañana en Málaga? (mínima de 20 °C o más según AEMET)', '["Sí, 20 °C o más","No, baja de 20 °C"]'::jsonb, 'Temperatura mínima de MAÑANA ≥ 20,0 °C en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{6,7,8,9}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Noche tropical mañana en Barcelona? (mínima de 20 °C o más según AEMET)', '["Sí, 20 °C o más","No, baja de 20 °C"]'::jsonb, 'Temperatura mínima de MAÑANA ≥ 20,0 °C en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{7,8}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Noche tropical mañana en Madrid? (mínima de 20 °C o más según AEMET)', '["Sí, 20 °C o más","No, baja de 20 °C"]'::jsonb, 'Temperatura mínima de MAÑANA ≥ 20,0 °C en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 2, '{7,8}'::smallint[], null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 50 km/h o más mañana en Zaragoza? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 50 km/h en la estación de referencia de AEMET de Zaragoza (Zaragoza (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 50 km/h o más mañana en Bilbao? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 50 km/h en la estación de referencia de AEMET de Bilbao (Bilbao (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 50 km/h o más mañana en Valencia? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 50 km/h en la estación de referencia de AEMET de Valencia (Valencia (Viveros)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 50 km/h o más mañana en Barcelona? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 50 km/h en la estación de referencia de AEMET de Barcelona (Barcelona (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 50 km/h o más mañana en Málaga? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 50 km/h en la estación de referencia de AEMET de Málaga (Málaga (Aeropuerto)). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Racha de viento de 40 km/h o más mañana en Madrid? (según AEMET)', '["Sí","No"]'::jsonb, 'Racha máxima de viento de MAÑANA ≥ 40 km/h en la estación de referencia de AEMET de Madrid (Madrid-Retiro). Fuente: aemet.es › Observación › Últimos datos (resumen del día).', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Está mañana la máxima más alta entre capitales de provincia en Andalucía? (según AEMET)', '["Andalucía","Otra comunidad"]'::jsonb, 'Capital de provincia con la temperatura máxima más alta de MAÑANA en el resumen de extremos de AEMET. Fuente: aemet.es › Observación › Últimos datos › capitales.', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Está mañana la mínima más baja entre capitales de provincia en Castilla y León? (según AEMET)', '["Castilla y León","Otra comunidad"]'::jsonb, 'Capital de provincia con la temperatura mínima más baja de MAÑANA en el resumen de extremos de AEMET. Fuente: aemet.es › Observación › Últimos datos › capitales.', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Llueve mañana (≥ 1 mm) en al menos 3 de estas 7 ciudades: Madrid, Barcelona, Sevilla, Valencia, Bilbao, Zaragoza y Málaga?', '["3 o más","Menos de 3"]'::jsonb, 'Número de estas ciudades con precipitación acumulada de MAÑANA ≥ 1 mm en su estación de referencia de AEMET. Fuente: aemet.es › Observación › Últimos datos.', 'clima', 1, null, null, 'https://www.aemet.es/es/eltiempo/observacion/ultimosdatos'),
  ('¿Cierra hoy el IBEX 35 en verde?', '["Sube","Baja"]'::jsonb, 'IBEX 35 cierra por encima del cierre anterior. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.', 'bolsa', 4, null, '{1,2,3,4,5}'::smallint[], 'https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices'),
  ('¿Se mueve hoy el IBEX 35 más de un 1 % (arriba o abajo)?', '["Más de 1 %","1 % o menos"]'::jsonb, 'Variación del IBEX 35 en valor absoluto > 1,00 %. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.', 'bolsa', 2, null, '{1,2,3,4,5}'::smallint[], 'https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices'),
  ('¿Cierra hoy el IBEX 35 por encima de su apertura?', '["Por encima","Por debajo o igual"]'::jsonb, 'Cierre del IBEX 35 estrictamente mayor que su apertura de HOY. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices'),
  ('¿Sube hoy Inditex en bolsa?', '["Sube","Baja"]'::jsonb, 'Inditex (ITX) cierra por encima del cierre anterior. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices'),
  ('¿Sube hoy Banco Santander en bolsa?', '["Sube","Baja"]'::jsonb, 'Banco Santander (SAN) cierra por encima del cierre anterior. Cierre oficial de la sesión de HOY frente al cierre anterior, según BME. Si la bolsa no abre (festivo), se anula el pique. Fuente: bolsasymercados.es.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.bolsasymercados.es/bme-exchange/es/Mercados-y-Cotizaciones/Acciones/Mercado-Continuo/Indices'),
  ('¿Cierra hoy el EURO STOXX 50 en verde?', '["Sube","Baja"]'::jsonb, 'EURO STOXX 50 cierra HOY por encima del cierre anterior (cierre 17:50 hora de Madrid). Festivo europeo = se anula. Fuente: stoxx.com.', 'bolsa', 2, null, '{1,2,3,4,5}'::smallint[], 'https://www.stoxx.com/index/sx5e/'),
  ('¿Cierra hoy Wall Street (S&P 500) en verde?', '["Sube","Baja"]'::jsonb, 'S&P 500 cierra HOY por encima del cierre anterior (cierre 22:00 hora de Madrid, 21:00 con horario de invierno de EE. UU. desfasado). Festivo en EE. UU. = se anula. Fuente: spglobal.com.', 'bolsa', 2, null, '{1,2,3,4,5}'::smallint[], 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/'),
  ('¿Cierra hoy el Nasdaq 100 en verde?', '["Sube","Baja"]'::jsonb, 'Nasdaq 100 cierra HOY por encima del cierre anterior (cierre 22:00 hora de Madrid). Festivo en EE. UU. = se anula. Fuente: nasdaq.com.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.nasdaq.com/market-activity/index/ndx'),
  ('¿Sube hoy el barril de Brent?', '["Sube","Baja"]'::jsonb, 'Precio de cierre del Brent (primer vencimiento, ICE) de HOY por encima del cierre anterior. Fuente: ice.com › Brent Crude Futures.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ice.com/products/219/Brent-Crude-Futures/data'),
  ('¿Sube hoy el oro?', '["Sube","Baja"]'::jsonb, 'Fixing de la tarde del oro (LBMA PM, en USD/onza) de HOY por encima del de la sesión anterior. Fuente: lbma.org.uk › Precious Metal Prices.', 'bolsa', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.lbma.org.uk/prices-and-data/precious-metal-prices'),
  ('¿Sube hoy el euro frente al dólar? (tipo de referencia del BCE)', '["Sube","Baja"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) mayor que el del día hábil anterior. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 3, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,05 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,0500. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,08 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,0800. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,10 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,1000. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,12 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,1200. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,15 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,1500. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,18 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,1800. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Está hoy el euro por encima de 1,20 $? (tipo de referencia del BCE)', '["Por encima","Por debajo"]'::jsonb, 'Tipo de referencia EUR/USD del BCE publicado HOY (~16:00 CET) estrictamente mayor que 1,2000. Sin publicación (festivo TARGET) = se anula. Fuente: ecb.europa.eu.', 'divisas', 1, null, '{1,2,3,4,5}'::smallint[], 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'),
  ('¿Vale más Bitcoin hoy a las 23:00 que ayer a esa hora?', '["Sube","Baja"]'::jsonb, 'Precio de Bitcoin de HOY mayor que el de AYER a la misma hora, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 3, null, null, 'https://www.coingecko.com/es'),
  ('¿Vale más Ethereum hoy a las 23:00 que ayer a esa hora?', '["Sube","Baja"]'::jsonb, 'Precio de Ethereum de HOY mayor que el de AYER a la misma hora, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 2, null, null, 'https://www.coingecko.com/es'),
  ('¿Se mueve Bitcoin hoy más de un 2 % respecto a ayer? (a las 23:00)', '["Más de 2 %","2 % o menos"]'::jsonb, 'Variación de Bitcoin en 24 h en valor absoluto > 2,00 %, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 1, null, null, 'https://www.coingecko.com/es'),
  ('¿Sube hoy Bitcoin más que Ethereum? (variación 24 h a las 23:00)', '["Bitcoin","Ethereum"]'::jsonb, 'Variación en 24 h de Bitcoin mayor que la de Ethereum (en puntos porcentuales), tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 2, null, null, 'https://www.coingecko.com/es'),
  ('¿Está Bitcoin por encima de 80.000 $ hoy a las 23:00?', '["Por encima","Por debajo"]'::jsonb, 'Precio de Bitcoin estrictamente mayor que 80.000 USD, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 1, null, null, 'https://www.coingecko.com/es'),
  ('¿Está Bitcoin por encima de 100.000 $ hoy a las 23:00?', '["Por encima","Por debajo"]'::jsonb, 'Precio de Bitcoin estrictamente mayor que 100.000 USD, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 1, null, null, 'https://www.coingecko.com/es'),
  ('¿Está Bitcoin por encima de 150.000 $ hoy a las 23:00?', '["Por encima","Por debajo"]'::jsonb, 'Precio de Bitcoin estrictamente mayor que 150.000 USD, tomado a las 23:00 hora de Madrid en CoinGecko (precio en USD). Fuente: coingecko.com.', 'cripto', 1, null, null, 'https://www.coingecko.com/es'),
  ('¿Gana hoy El Hormiguero a La Revuelta en audiencia?', '["El Hormiguero","La Revuelta"]'::jsonb, 'Espectadores medios de El Hormiguero (Antena 3) mayores que los de La Revuelta (La 1) en la emisión de HOY, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 4, null, '{1,2,3}'::smallint[], 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Gana El Hormiguero a La Revuelta este jueves en audiencia?', '["El Hormiguero","La Revuelta"]'::jsonb, 'Espectadores medios de El Hormiguero (Antena 3) mayores que los de La Revuelta (La 1) en la emisión del JUEVES, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 4, null, '{4}'::smallint[], 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Supera hoy El Hormiguero el 15 % de share?', '["Supera","No llega"]'::jsonb, 'Share de El Hormiguero (Antena 3) de HOY estrictamente mayor que 15,0 %, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 1, null, '{1,2,3,4}'::smallint[], 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Supera hoy La Revuelta el 12 % de share?', '["Supera","No llega"]'::jsonb, 'Share de La Revuelta (La 1) de HOY estrictamente mayor que 12,0 %, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 1, null, '{1,2,3,4}'::smallint[], 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Es hoy Antena 3 la cadena más vista del día?', '["Antena 3","Otra cadena"]'::jsonb, 'Cadena con mayor share del día completo de HOY, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 3, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Gana hoy Antena 3 a Telecinco en share del día?', '["Antena 3","Telecinco"]'::jsonb, 'Share del día completo de HOY de Antena 3 mayor que el de Telecinco, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 2, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Es hoy La 1 la segunda cadena más vista del día?', '["Sí","No"]'::jsonb, 'La 1 ocupa el segundo puesto por share del día completo de HOY, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 1, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Supera hoy el programa más visto del día los 2 millones de espectadores?', '["Sí","No"]'::jsonb, 'Espectadores medios del programa más visto de HOY (sin contar retransmisiones deportivas) > 2.000.000, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 2, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Es un informativo el programa más visto de hoy?', '["Un informativo","Otro programa"]'::jsonb, 'El programa con más espectadores medios de HOY es una edición de informativos (sin contar retransmisiones deportivas), según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 1, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Gana hoy Antena 3 Noticias 1 a Informativos Telecinco 15:00 en audiencia?', '["Antena 3","Telecinco"]'::jsonb, 'Espectadores medios de Antena 3 Noticias 1 (15:00) mayores que los de Informativos Telecinco 15:00 en la emisión de HOY, según los datos de Kantar Media que publica Barlovento Comunicación la MAÑANA SIGUIENTE (informe de audiencias diarias). Se resuelve al día siguiente. Fuente: barloventocomunicacion.es.', 'tv', 1, null, null, 'https://www.barloventocomunicacion.es/audiencias-diarias/'),
  ('¿Es mañana la luz más cara que hoy? (precio medio diario del mercado mayorista)', '["Más cara","Más barata"]'::jsonb, 'Precio medio diario del mercado mayorista (OMIE, España) de MAÑANA mayor que el de HOY. Se publica hoy a las ~13:00. Fuente: omie.es › Resultados del mercado diario.', 'energia', 3, null, null, 'https://www.omie.es/es/market-results/daily/daily-market/daily-hourly-price'),
  ('¿Supera mañana los 100 €/MWh el precio medio de la luz en el mercado mayorista?', '["Supera","No llega"]'::jsonb, 'Precio medio diario del mercado mayorista (OMIE, España) de MAÑANA estrictamente mayor que 100,00 €/MWh. Fuente: omie.es.', 'energia', 1, null, null, 'https://www.omie.es/es/market-results/daily/daily-market/daily-hourly-price'),
  ('¿Cae la hora más cara de la luz de mañana después de las 19:00?', '["Después de las 19:00","Antes de las 19:00"]'::jsonb, 'Hora con el precio horario más alto del mercado mayorista (OMIE, España) de MAÑANA: 19:00–23:59 = «Después», 00:00–18:59 = «Antes». Fuente: omie.es.', 'energia', 1, null, null, 'https://www.omie.es/es/market-results/daily/daily-market/daily-hourly-price'),
  ('¿Sigue mañana la misma canción en el nº 1 de Spotify España? (Top 50 diario)', '["Sigue","Cambia"]'::jsonb, 'Canción nº 1 del Top 50 diario de Spotify España de MAÑANA igual a la de HOY. Fuente: charts.spotify.com (regional-es-daily).', 'musica', 2, null, null, 'https://charts.spotify.com/charts/view/regional-es-daily/latest'),
  ('¿Es en español el nº 1 de Spotify España mañana? (Top 50 diario)', '["En español","En otro idioma"]'::jsonb, 'Idioma principal de la letra del nº 1 del Top 50 diario de Spotify España de MAÑANA. Fuente: charts.spotify.com (regional-es-daily).', 'musica', 1, null, null, 'https://charts.spotify.com/charts/view/regional-es-daily/latest'),
  ('¿Es un vídeo musical el nº 1 de tendencias de YouTube España mañana a las 12:00?', '["Musical","Otro tipo"]'::jsonb, 'Primer vídeo de la pestaña Tendencias de YouTube España consultada MAÑANA a las 12:00 (hora de Madrid), sin sesión iniciada. Fuente: youtube.com/feed/trending?gl=ES.', 'internet', 1, null, null, 'https://www.youtube.com/feed/trending?gl=ES'),
  ('¿Supera el millón de visitas el nº 1 de tendencias de YouTube España mañana a las 12:00?', '["Sí","No"]'::jsonb, 'Visitas del primer vídeo de Tendencias de YouTube España consultadas MAÑANA a las 12:00 (hora de Madrid) > 1.000.000. Fuente: youtube.com/feed/trending?gl=ES.', 'internet', 1, null, null, 'https://www.youtube.com/feed/trending?gl=ES'),
  ('¿Es una persona la búsqueda nº 1 de Google Trends España hoy?', '["Una persona","Otra cosa"]'::jsonb, 'Primera entrada de Tendencias de búsqueda de Google Trends (España, últimas 24 h) consultada HOY a las 23:00 hora de Madrid: nombre de una persona = «Una persona». Fuente: trends.google.es/trending?geo=ES.', 'internet', 1, null, null, 'https://trends.google.es/trending?geo=ES')
on conflict (question) do nothing;
-- <<< EVERGREEN BANK

-- Hora local (Madrid) a partir de la cual el modo degradado puede actuar.
update public.remote_config
  set value = value || '{"fallback_hour_madrid": 8}'::jsonb, updated_at = now()
  where key = 'misc' and not (value ? 'fallback_hour_madrid');

-- Siguiente evergreen utilizable para un día: el menos usado (nunca usado
-- primero), a igual uso el de más peso, y aleatorio si empatan. Filtra por
-- mes y día de la semana. Devuelve 0 filas si el banco no tiene nada válido.
create or replace function public.evergreen_next(p_day date default null)
returns setof public.evergreen_bank
language sql security definer set search_path = public as $$  -- volátil a propósito: usa random()
  select e.* from evergreen_bank e
   where e.weight > 0
     and (e.months is null or extract(month from coalesce(p_day, madrid_today()))::smallint = any (e.months))
     and (e.dows   is null or extract(isodow from coalesce(p_day, madrid_today()))::smallint = any (e.dows))
   order by e.last_used_at nulls first, e.weight desc, random()
   limit 1
$$;
revoke execute on function public.evergreen_next(date) from public, anon, authenticated;

-- MODO DEGRADADO (R-04): si hoy no hay pique (ni scheduled ni open) se publica
-- el siguiente evergreen como pique de hoy (status open, source evergreen) y se
-- avisa a los admins. La racha nunca se rompe por culpa nuestra.
--   · Solo actúa a partir de fallback_hour_madrid (8) salvo p_force.
--   · Solo lang='es' (el alfa es en español).
--   · Si ya hay fila para hoy en resolved/skipped no inserta (clave única
--     scheduled_for+lang): un admin que salta el día lo hace a propósito.
-- Devuelve el id del pique creado o null si no hizo nada.
create or replace function public.cron_open_daily_fallback(p_force boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today date := madrid_today();
  v_hour int := extract(hour from (now() at time zone 'Europe/Madrid'))::int;
  v_min_hour int := coalesce((cfg('misc')->>'fallback_hour_madrid')::int, 8);
  e evergreen_bank%rowtype;
  v_id uuid;
  r record;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if not p_force and v_hour < v_min_hour then return null; end if;
  if exists (select 1 from daily_picks
              where scheduled_for = v_today and lang = 'es' and status in ('scheduled', 'open')) then
    return null;
  end if;

  select * into e from evergreen_next(v_today);
  if not found then
    for r in select id from profiles where role = 'admin' loop
      if not exists (select 1 from notifications
                      where user_id = r.id and class = 'sistema'
                        and title like 'Sin pique del día%' and created_at::date = current_date) then
        perform notify_user(r.id, 'sistema', 'Sin pique del día y sin evergreen disponible',
          'Hoy no hay pique programado y el banco evergreen no tiene ninguna fila válida para hoy. Programa uno ahora.',
          '/admin/temas');
      end if;
    end loop;
    return null;
  end if;

  insert into daily_picks (scheduled_for, lang, question, options, status, source_url, source, criteria, evergreen_id)
    values (v_today, 'es', e.question, e.options, 'open', e.source_url, 'evergreen', e.criteria, e.id)
    on conflict (scheduled_for, lang) do nothing
    returning id into v_id;
  if v_id is null then return null; end if;

  update evergreen_bank set last_used_at = now() where id = e.id;

  for r in select id from profiles where role = 'admin' loop
    perform notify_user(r.id, 'sistema', 'Modo degradado: pique del día desde el banco evergreen',
      left(e.question, 110) || ' · Revisa el criterio y programa los próximos días.',
      '/admin/porras');
  end loop;
  return v_id;
end $$;
revoke execute on function public.cron_open_daily_fallback(boolean) from public, anon;
grant execute on function public.cron_open_daily_fallback(boolean) to authenticated; -- la función exige admin

-- ALERTA DE BUFFER (R-04): si los próximos 7 días no están cubiertos, aviso a
-- los admins (1 al día). Devuelve cuántos de los 7 días tienen pique.
create or replace function public.cron_buffer_alert()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := madrid_today();
  v_n int;
  r record;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select count(distinct scheduled_for) into v_n from daily_picks
   where lang = 'es' and status in ('scheduled', 'open')
     and scheduled_for between v_today + 1 and v_today + 7;
  if v_n >= 7 then return v_n; end if;
  for r in select id from profiles where role = 'admin' loop
    if not exists (select 1 from notifications
                    where user_id = r.id and class = 'sistema'
                      and title like 'Buffer del pique del día%' and created_at::date = current_date) then
      perform notify_user(r.id, 'sistema',
        'Buffer del pique del día: ' || v_n || ' de 7 días cubiertos',
        'Faltan piques para la próxima semana. Aprueba candidatas en el panel; si un día amanece vacío, el modo degradado usará el banco evergreen.',
        '/admin/temas');
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.cron_buffer_alert() from public, anon;
grant execute on function public.cron_buffer_alert() to authenticated; -- la función exige admin


-- ============================================================================
-- §2 K-04 — Rollup diario daily_kpis
-- ============================================================================

-- Flags de cuenta (G-06/K-04): el equipo y las cuentas sospechosas no cuentan
-- en ningún KPI ni en ligas. Los admins son equipo por definición.
alter table public.profiles add column if not exists is_internal boolean not null default false;
alter table public.profiles add column if not exists suspect boolean not null default false;
create index if not exists profiles_flags_idx on public.profiles (is_internal, suspect) where is_internal or suspect;
update public.profiles set is_internal = true where role = 'admin' and not is_internal;

-- Histórico del regalo diario: el perfil solo guarda daily_bonus_last, así que
-- un trigger deja fila por (usuario, día) y el rollup puede recomputar días
-- pasados. No modifica claim_daily_bonus (0007).
create table if not exists public.daily_bonus_log (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_bonus_log enable row level security;
revoke all on public.daily_bonus_log from anon, authenticated;
create index if not exists daily_bonus_log_day_idx on public.daily_bonus_log (day);

create or replace function public.profiles_log_daily_bonus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.daily_bonus_last is not null and new.daily_bonus_last is distinct from old.daily_bonus_last then
      insert into daily_bonus_log (user_id, day) values (new.id, new.daily_bonus_last)
        on conflict do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_profiles_log_daily_bonus on public.profiles;
create trigger trg_profiles_log_daily_bonus after update of daily_bonus_last on public.profiles
  for each row execute function public.profiles_log_daily_bonus();
-- Arranque: el último regalo conocido de cada perfil entra en el histórico.
insert into public.daily_bonus_log (user_id, day)
  select id, daily_bonus_last from public.profiles where daily_bonus_last is not null
  on conflict do nothing;

create table if not exists public.daily_kpis (
  day            date primary key,
  dau            int not null default 0,
  wau            int not null default 0,
  mau            int not null default 0,
  signups        int not null default 0,
  picks          int not null default 0,
  porras_created int not null default 0,
  shares         int not null default 0,
  referrals_paid int not null default 0,
  ad_rewards     int not null default 0,
  resolved       int not null default 0,
  d1             numeric(6,4),   -- null = cohorte vacía (no se rellena con 0)
  d7             numeric(6,4),
  d30            numeric(6,4),
  d1_cohort      int not null default 0,   -- tamaño de la cohorte (regla anti-vanidad: sin cohorte no hay número)
  d7_cohort      int not null default 0,
  d30_cohort     int not null default 0,
  computed_at    timestamptz not null default now()
);
alter table public.daily_kpis add column if not exists d1_cohort int not null default 0;
alter table public.daily_kpis add column if not exists d7_cohort int not null default 0;
alter table public.daily_kpis add column if not exists d30_cohort int not null default 0;
alter table public.daily_kpis enable row level security;
drop policy if exists daily_kpis_admin on public.daily_kpis;
create policy daily_kpis_admin on public.daily_kpis for select using (public.is_admin());
revoke insert, update, delete on public.daily_kpis from anon, authenticated;

-- (usuario, día Madrid) ACTIVO en [p_from, p_to]: hizo un pick, respondió el
-- pique del día, creó una porra o reclamó el regalo diario. Fuera is_internal
-- y suspect. Plantillas fuera. (Definición K-04; 0033 usa una más amplia.)
create or replace function public.kpi_activity_days(p_from date, p_to date)
returns table (act_user uuid, act_day date)
language sql stable security definer set search_path = public as $$
  with lo as (select (p_from::timestamp at time zone 'Europe/Madrid') as t),
       hi as (select ((p_to + 1)::timestamp at time zone 'Europe/Madrid') as t),
  acts as (
    select k.user_id as u, (k.created_at at time zone 'Europe/Madrid')::date as d
      from picks k join porras po on po.id = k.porra_id
     where not po.is_template
       and k.created_at >= (select t from lo) and k.created_at < (select t from hi)
    union
    select a.user_id, (a.created_at at time zone 'Europe/Madrid')::date
      from daily_pick_answers a
     where a.created_at >= (select t from lo) and a.created_at < (select t from hi)
    union
    select po.created_by, (po.created_at at time zone 'Europe/Madrid')::date
      from porras po
     where po.created_by is not null and po.source = 'user' and not po.is_template
       and po.created_at >= (select t from lo) and po.created_at < (select t from hi)
    union
    select l.user_id, l.day from daily_bonus_log l where l.day between p_from and p_to
    union
    select pr.id, pr.daily_bonus_last from profiles pr
     where pr.daily_bonus_last between p_from and p_to
  )
  select a.u, a.d from acts a join profiles pr on pr.id = a.u
   where not pr.is_internal and not pr.suspect;
$$;
revoke execute on function public.kpi_activity_days(date, date) from public, anon, authenticated;

-- Rollup de UN día (por defecto ayer, hora de Madrid). Upsert en daily_kpis y
-- devuelve la fila. D1/D7/D30 = parte de la cohorte de altas de day-1/-7/-30
-- activa en day; cohorte vacía → null (no se inventa un 0 %).
create or replace function public.rollup_daily_kpis(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, madrid_today() - 1);
  v_from timestamptz := (v_day::timestamp at time zone 'Europe/Madrid');
  v_to   timestamptz := ((v_day + 1)::timestamp at time zone 'Europe/Madrid');
  v_dau int; v_wau int; v_mau int;
  v_signups int; v_picks int; v_porras int; v_shares int; v_ref int; v_ads int; v_resolved int;
  c1 int; r1 int; c7 int; r7 int; c30 int; r30 int;
  v_row daily_kpis%rowtype;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;

  with act as (select * from kpi_activity_days(v_day - 29, v_day))
  select count(distinct act_user) filter (where act_day = v_day),
         count(distinct act_user) filter (where act_day >= v_day - 6),
         count(distinct act_user)
    into v_dau, v_wau, v_mau
    from act;

  select count(*) into v_signups from profiles pr
   where pr.created_at >= v_from and pr.created_at < v_to and not pr.is_internal and not pr.suspect;

  select count(*) into v_picks
    from picks k join porras po on po.id = k.porra_id join profiles pr on pr.id = k.user_id
   where not po.is_template and k.created_at >= v_from and k.created_at < v_to
     and not pr.is_internal and not pr.suspect;

  select count(*) into v_porras
    from porras po join profiles pr on pr.id = po.created_by
   where po.source = 'user' and not po.is_template and po.created_at >= v_from and po.created_at < v_to
     and not pr.is_internal and not pr.suspect;

  select count(*) into v_shares
    from share_rewards s join profiles pr on pr.id = s.user_id
   where s.created_at >= v_from and s.created_at < v_to and not pr.is_internal and not pr.suspect;

  select count(*) into v_ref from profiles pr
   where pr.referral_paid_at >= v_from and pr.referral_paid_at < v_to and not pr.is_internal and not pr.suspect;

  select count(*) into v_ads
    from ad_impressions ai join profiles pr on pr.id = ai.user_id
   where ai.status = 'granted' and ai.created_at >= v_from and ai.created_at < v_to
     and not pr.is_internal and not pr.suspect;

  select count(*) into v_resolved from porras po
   where po.status = 'resolved' and not po.is_template
     and po.resolved_at >= v_from and po.resolved_at < v_to;

  with act as (select act_user from kpi_activity_days(v_day, v_day)),
  coh as (
    select pr.id, (pr.created_at at time zone 'Europe/Madrid')::date as d0
      from profiles pr
     where not pr.is_internal and not pr.suspect
       and pr.created_at >= v_from - interval '31 days' and pr.created_at < v_to
  )
  select count(*) filter (where d0 = v_day - 1),
         count(*) filter (where d0 = v_day - 1  and id in (select act_user from act)),
         count(*) filter (where d0 = v_day - 7),
         count(*) filter (where d0 = v_day - 7  and id in (select act_user from act)),
         count(*) filter (where d0 = v_day - 30),
         count(*) filter (where d0 = v_day - 30 and id in (select act_user from act))
    into c1, r1, c7, r7, c30, r30
    from coh;

  insert into daily_kpis (day, dau, wau, mau, signups, picks, porras_created, shares, referrals_paid,
                          ad_rewards, resolved, d1, d7, d30, d1_cohort, d7_cohort, d30_cohort, computed_at)
  values (v_day, v_dau, v_wau, v_mau, v_signups, v_picks, v_porras, v_shares, v_ref, v_ads, v_resolved,
          case when c1  > 0 then round(r1::numeric  / c1,  4) end,
          case when c7  > 0 then round(r7::numeric  / c7,  4) end,
          case when c30 > 0 then round(r30::numeric / c30, 4) end,
          c1, c7, c30, now())
  on conflict (day) do update set
    dau = excluded.dau, wau = excluded.wau, mau = excluded.mau, signups = excluded.signups,
    picks = excluded.picks, porras_created = excluded.porras_created, shares = excluded.shares,
    referrals_paid = excluded.referrals_paid, ad_rewards = excluded.ad_rewards, resolved = excluded.resolved,
    d1 = excluded.d1, d7 = excluded.d7, d30 = excluded.d30,
    d1_cohort = excluded.d1_cohort, d7_cohort = excluded.d7_cohort, d30_cohort = excluded.d30_cohort,
    computed_at = excluded.computed_at
  returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke execute on function public.rollup_daily_kpis(date) from public, anon;
grant execute on function public.rollup_daily_kpis(date) to authenticated; -- la función exige admin

-- Relleno de histórico (admin): recomputa los últimos p_days días.
create or replace function public.backfill_daily_kpis(p_days int default 60)
returns int
language plpgsql security definer set search_path = public as $$
declare i int; n int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  for i in reverse greatest(least(p_days, 400), 1)..1 loop
    perform rollup_daily_kpis(madrid_today() - i);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.backfill_daily_kpis(int) from public, anon;
grant execute on function public.backfill_daily_kpis(int) to authenticated; -- la función exige admin

-- Serie para /admin (solo admin): últimos p_days días, orden ascendente.
-- Si un día no se calculó, no aparece: no se rellena.
create or replace function public.kpi_daily_series(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.day), '[]'::jsonb) into v
    from daily_kpis k
   where k.day > madrid_today() - greatest(least(p_days, 400), 1);
  return jsonb_build_object(
    'today', madrid_today(),
    'days', greatest(least(p_days, 400), 1),
    'definition', 'activo = pick, pique del día, porra creada o regalo diario; fuera is_internal y suspect; D-N = cohorte de altas de day-N activa en day',
    'series', v);
end $$;
revoke execute on function public.kpi_daily_series(int) from public, anon;
grant execute on function public.kpi_daily_series(int) to authenticated;


-- ============================================================================
-- §3 G-06 — Anti-abuso
-- ============================================================================

-- Hash de dispositivo (salado en cliente: UA+viewport+lang o FingerprintJS OSS).
-- Va en tabla aparte y NO en profiles porque profiles se lee en público
-- (policy profiles_read = true) y un hash compartido permitiría a cualquiera
-- correlacionar cuentas. Sin policies: solo funciones definer / service role.
-- Un usuario puede tener varios dispositivos (pk usuario+hash).
create table if not exists public.profile_devices (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[A-Za-z0-9_-]{8,64}$'),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_hash)
);
alter table public.profile_devices enable row level security;
revoke all on public.profile_devices from anon, authenticated;
create index if not exists profile_devices_hash_idx on public.profile_devices (device_hash);

-- El cliente registra su hash tras iniciar sesión (idempotente).
create or replace function public.set_device_hash(p_hash text)
returns void
language plpgsql security definer set search_path = public as $$
declare v text := left(regexp_replace(coalesce(p_hash, ''), '[^A-Za-z0-9_-]', '', 'g'), 64);
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if char_length(v) < 8 then return; end if;
  insert into profile_devices (user_id, device_hash) values (auth.uid(), v)
    on conflict (user_id, device_hash) do update set last_seen = now();
end $$;
revoke execute on function public.set_device_hash(text) from public, anon;
grant execute on function public.set_device_hash(text) to authenticated;

-- Marca suspect=true en la cuenta MÁS NUEVA de cada par que comparte hash de
-- dispositivo y se dio de alta con menos de 24 h de diferencia. Nunca desmarca
-- (eso lo hace un admin tras revisar, admin_set_flags). Saca a los suspect de
-- las ligas abiertas. Avisa a los admins si hay marcas nuevas. Devuelve
-- cuántas cuentas ha marcado. Limitación: aquí no hay IP (la base no la
-- guarda); el cruce hash+IP del spec queda para el servidor de la app.
create or replace function public.flag_suspects()
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;

  with pairs as (
    select distinct b.id as newer
      from profile_devices da
      join profile_devices db on db.device_hash = da.device_hash and db.user_id <> da.user_id
      join profiles a on a.id = da.user_id
      join profiles b on b.id = db.user_id
     where b.created_at > a.created_at
       and b.created_at - a.created_at <= interval '24 hours'
       and not b.suspect and not b.is_internal and b.role <> 'admin'
       and not a.is_internal and a.role <> 'admin'
  ),
  upd as (
    update profiles p set suspect = true from pairs where p.id = pairs.newer returning p.id
  )
  select count(*) into n from upd;

  -- fuera de las ligas abiertas (hasta revisión)
  delete from league_members lm
   using league_groups lg, profiles p
   where lg.id = lm.group_id and not lg.closed and p.id = lm.user_id and p.suspect;

  if n > 0 then
    for r in select id from profiles where role = 'admin' loop
      if not exists (select 1 from notifications
                      where user_id = r.id and class = 'sistema'
                        and title like 'Cuentas sospechosas%' and created_at::date = current_date) then
        perform notify_user(r.id, 'sistema', 'Cuentas sospechosas: ' || n || ' nuevas',
          'Comparten dispositivo con otra cuenta creada en menos de 24 h. Quedan fuera de ligas y KPIs hasta que las revises.',
          '/admin/moderacion');
      end if;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.flag_suspects() from public, anon;
grant execute on function public.flag_suspects() to authenticated; -- la función exige admin

-- Revisión manual (admin): marcar/desmarcar suspect e is_internal.
create or replace function public.admin_set_flags(p_user uuid, p_suspect boolean default null, p_internal boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  update profiles set
    suspect = coalesce(p_suspect, suspect),
    is_internal = coalesce(p_internal, is_internal)
    where id = p_user;
end $$;
revoke execute on function public.admin_set_flags(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_flags(uuid, boolean, boolean) to authenticated;

-- Ligas: una cuenta suspect o is_internal no entra. El trigger descarta la
-- fila (return null) en vez de lanzar excepción: la inserción viene de
-- award_score dentro de resolve_porra / resolve_daily, y una excepción
-- rompería la resolución de una porra ajena. Con la fila descartada, el
-- update de score posterior afecta a 0 filas y la resolución sigue.
create or replace function public.league_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.user_id and (suspect or is_internal)) then
    raise notice 'VINKO_LEAGUE_EXCLUDED: % (suspect o is_internal)', new.user_id;
    return null;
  end if;
  return new;
end $$;
drop trigger if exists trg_league_members_guard on public.league_members;
create trigger trg_league_members_guard before insert on public.league_members
  for each row execute function public.league_members_guard();


-- ============================================================================
-- §4 K-03 — Eventos de servidor → PostHog EU
-- ============================================================================

-- Clave del proyecto en remote_config (la clave de proyecto de PostHog es
-- pública por diseño: es la misma que usa el cliente). Vacía = no se emite.
insert into public.remote_config (key, value) values
('posthog', '{"project_key": "", "host": "https://eu.i.posthog.com", "enabled": true}'::jsonb)
on conflict (key) do nothing;

-- Envío asíncrono con pg_net. distinct_id = id del perfil (nunca email).
-- Propiedades base {is_seed:false, source:'server', emitted_by:'server',
-- $lib:'vinko-server'} y encima las del evento (si el evento trae 'source',
-- gana la del evento; emitted_by y $lib siempre dicen que salió del servidor).
-- Añade is_internal y suspect del perfil para poder filtrar en PostHog.
-- Nunca lanza: si falta la clave o pg_net falla, no pasa nada.
create or replace function public.emit_event(p_name text, p_user uuid, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb; v_key text; v_host text; v_props jsonb;
  v_internal boolean; v_suspect boolean;
begin
  begin
    v_cfg := cfg('posthog');
    if v_cfg is null or coalesce((v_cfg->>'enabled')::boolean, true) = false then return; end if;
    v_key := nullif(trim(coalesce(v_cfg->>'project_key', '')), '');
    if v_key is null then return; end if;
    v_host := rtrim(coalesce(nullif(trim(v_cfg->>'host'), ''), 'https://eu.i.posthog.com'), '/');
    v_props := jsonb_build_object('is_seed', false, 'source', 'server', 'emitted_by', 'server', '$lib', 'vinko-server')
               || coalesce(p_props, '{}'::jsonb);
    if p_user is not null then
      select is_internal, suspect into v_internal, v_suspect from profiles where id = p_user;
      if found then
        v_props := v_props || jsonb_build_object('is_internal', v_internal, 'suspect', v_suspect);
      end if;
    end if;
    perform net.http_post(
      url := v_host || '/capture/',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'api_key', v_key,
        'event', p_name,
        'distinct_id', coalesce(p_user::text, 'vinko-server'),
        'properties', v_props,
        'timestamp', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      timeout_milliseconds := 3000);
  exception when others then null;
  end;
end $$;
revoke execute on function public.emit_event(text, uuid, jsonb) from public, anon, authenticated;

-- pick_made {porra_id, stake, option_idx, minutes_to_close, is_guest}
create or replace function public.evt_pick_made() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_idx int; v_min int; v_template boolean;
begin
  begin
    select po.idx, greatest(0, floor(extract(epoch from (p.closes_at - now())) / 60))::int, p.is_template
      into v_idx, v_min, v_template
      from porra_options po join porras p on p.id = po.porra_id
     where po.id = new.option_id;
    if coalesce(v_template, false) then return new; end if;
    perform emit_event('pick_made', new.user_id, jsonb_build_object(
      'porra_id', new.porra_id, 'stake', new.points_spent, 'option_idx', v_idx,
      'minutes_to_close', v_min, 'is_guest', coalesce((to_jsonb(new)->>'is_guest')::boolean, false)));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_pick_made on public.picks;
create trigger trg_evt_pick_made after insert on public.picks
  for each row execute function public.evt_pick_made();

-- porra_created {porra_id, source, closes_in_h, has_video, visibility, category}
-- (plantillas fuera: son semilla, no actividad)
create or replace function public.evt_porra_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.is_template then return new; end if;
    perform emit_event('porra_created', new.created_by, jsonb_build_object(
      'porra_id', new.id, 'source', new.source,
      'closes_in_h', round((extract(epoch from (new.closes_at - coalesce(new.created_at, now()))) / 3600.0)::numeric, 1),
      'has_video', (new.media_url is not null or new.video_url is not null),
      'visibility', new.visibility, 'category', new.category));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_porra_created on public.porras;
create trigger trg_evt_porra_created after insert on public.porras
  for each row execute function public.evt_porra_created();

-- porra_resolved {porra_id, source, resolver, sla_minutes, picks}
create or replace function public.evt_porra_resolved() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who uuid := auth.uid();
begin
  begin
    if new.is_template or new.status <> 'resolved' or old.status = 'resolved' then return new; end if;
    perform emit_event('porra_resolved', coalesce(v_who, new.created_by), jsonb_build_object(
      'porra_id', new.id, 'source', new.source,
      'resolver', case when v_who is null then 'server'
                       when v_who = new.created_by then 'creator'
                       when v_who = new.arbiter_id then 'arbiter'
                       else 'admin' end,
      'sla_minutes', greatest(0, floor(extract(epoch from (now() - new.closes_at)) / 60))::int,
      'picks', (select count(*) from picks k where k.porra_id = new.id)));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_porra_resolved on public.porras;
create trigger trg_evt_porra_resolved after update of status on public.porras
  for each row execute function public.evt_porra_resolved();

-- signup_completed {method, lang, ref}
create or replace function public.evt_signup_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_method text;
begin
  -- Perfiles invitados (0040): el alta real se emite al convertir (convert_guest).
  if coalesce((to_jsonb(new)->>'is_anonymous')::boolean, false) then return new; end if;
  begin
    select coalesce(u.raw_app_meta_data->>'provider', 'unknown') into v_method from auth.users u where u.id = new.id;
    perform emit_event('signup_completed', new.id, jsonb_build_object(
      'method', coalesce(v_method, 'unknown'), 'lang', new.lang, 'ref', new.referred_by is not null));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_signup_completed on public.profiles;
create trigger trg_evt_signup_completed after insert on public.profiles
  for each row execute function public.evt_signup_completed();

-- daily_pick_answered {date, streak_len, option_idx, pick_source}
-- (streak_len es la racha ANTES de que answer_daily la toque)
create or replace function public.evt_daily_pick_answered() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day date; v_src text; v_streak int;
begin
  begin
    select d.scheduled_for, d.source into v_day, v_src from daily_picks d where d.id = new.day_id;
    select streak_days into v_streak from profiles where id = new.user_id;
    perform emit_event('daily_pick_answered', new.user_id, jsonb_build_object(
      'date', v_day, 'streak_len', coalesce(v_streak, 0), 'option_idx', new.option_idx,
      'pick_source', coalesce(v_src, 'editorial')));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_daily_pick_answered on public.daily_pick_answers;
create trigger trg_evt_daily_pick_answered after insert on public.daily_pick_answers
  for each row execute function public.evt_daily_pick_answered();

-- link_shared {porra_id, surface} — solo el share recompensado deja fila; el
-- resto de shares (fuera del tope diario) los emite el cliente.
create or replace function public.evt_link_shared() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform emit_event('link_shared', new.user_id, jsonb_build_object(
      'porra_id', new.porra_id, 'surface', 'share_reward'));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_evt_link_shared on public.share_rewards;
create trigger trg_evt_link_shared after insert on public.share_rewards
  for each row execute function public.evt_link_shared();


-- ============================================================================
-- Jobs pg_cron (UTC). Se descargan por nombre antes de programar → idempotente.
-- Horario de verano: 06:35 UTC = 08:35 Madrid (CEST). En invierno (CET) esa
-- misma hora UTC son las 07:35, por eso hay un segundo disparo a las 07:35 UTC
-- (= 08:35 CET): la función solo actúa desde fallback_hour_madrid (8) y no
-- hace nada si ya hay pique, así que el disparo sobrante es inocuo.
-- ============================================================================
do $$
declare j record;
begin
  for j in select jobid from cron.job
            where jobname in ('vinko-daily-fallback', 'vinko-daily-fallback-cet', 'vinko-buffer-alert',
                              'vinko-kpi-rollup', 'vinko-flag-suspects') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
select cron.schedule('vinko-daily-fallback',     '35 6 * * *', $$select public.cron_open_daily_fallback()$$);
select cron.schedule('vinko-daily-fallback-cet', '35 7 * * *', $$select public.cron_open_daily_fallback()$$);
select cron.schedule('vinko-buffer-alert',       '0 7 * * *',  $$select public.cron_buffer_alert()$$);
select cron.schedule('vinko-kpi-rollup',         '0 2 * * *',  $$select public.rollup_daily_kpis()$$);
select cron.schedule('vinko-flag-suspects',      '17 * * * *', $$select public.flag_suspects()$$);

notify pgrst, 'reload schema';
