-- ============================================================================
-- VINKO — 0010: contenido editorial jugable + buffer del pronóstico del día.
-- Publicación editorial aprobada por Ricardo (15-sep-2026, "ejecutar todo").
-- CERO picks ni perfiles ficticios: solo pregunta + opciones (regla de datos).
-- Preguntas del día: resolubles por fuente pública, sin cuotas ni casas (§5c).
-- ============================================================================

-- las 8 porras editoriales de lib/editorial.ts pasan a filas reales
with rows(slug, title, closes) as (values
  ('clasico-liga',        '¿Quién gana el próximo Clásico de Liga?',                    '2026-09-27T21:00:00+02:00'::timestamptz),
  ('alonso-podio',        '¿Sube Fernando Alonso al podio este domingo?',               '2026-09-20T16:00:00+02:00'::timestamptz),
  ('alcaraz-final',       '¿Llega Alcaraz a la final del próximo torneo?',              '2026-09-21T20:00:00+02:00'::timestamptz),
  ('btc-fin-de-mes',      '¿Cierra Bitcoin el mes por encima de 100.000 $?',            '2026-09-30T23:59:00+02:00'::timestamptz),
  ('smi-2027',            '¿Sube el Salario Mínimo en la próxima revisión?',            '2026-10-15T09:00:00+02:00'::timestamptz),
  ('lluvia-madrid-finde', '¿Llueve en Madrid este fin de semana?',                      '2026-09-19T09:00:00+02:00'::timestamptz),
  ('reality-favorito',    '¿Gana el reality del momento el favorito del público?',      '2026-10-02T23:00:00+02:00'::timestamptz),
  ('cancion-verano-num1', '¿Aguanta la canción del momento otra semana en el nº1?',     '2026-09-22T12:00:00+02:00'::timestamptz)
)
insert into public.porras (slug, title, source, status, closes_at)
select slug, title, 'editorial', 'open', closes from rows
on conflict (slug) do nothing;

with opts(slug, idx, label) as (values
  ('clasico-liga', 0, 'Real Madrid'), ('clasico-liga', 1, 'Barça'), ('clasico-liga', 2, 'Empate'),
  ('alonso-podio', 0, 'Sí, podio'), ('alonso-podio', 1, 'Se queda fuera'),
  ('alcaraz-final', 0, 'Llega a la final'), ('alcaraz-final', 1, 'Cae antes'),
  ('btc-fin-de-mes', 0, 'Por encima'), ('btc-fin-de-mes', 1, 'Por debajo'),
  ('smi-2027', 0, 'Sube'), ('smi-2027', 1, 'Se congela'),
  ('lluvia-madrid-finde', 0, 'Cae agua'), ('lluvia-madrid-finde', 1, 'Ni una gota'),
  ('reality-favorito', 0, 'El favorito'), ('reality-favorito', 1, 'La sorpresa'),
  ('cancion-verano-num1', 0, 'Sigue nº1'), ('cancion-verano-num1', 1, 'La destronan')
)
insert into public.porra_options (porra_id, idx, label)
select p.id, o.idx, o.label
from opts o join public.porras p on p.slug = o.slug and p.source = 'editorial'
where not exists (select 1 from public.porra_options po where po.porra_id = p.id);

-- buffer de 14 días de pronóstico del día (todas resolubles por fuente pública)
insert into public.daily_picks (scheduled_for, lang, question, options, status, source_url) values
('2026-09-15', 'es', '¿Cierra hoy el IBEX 35 en verde?', '["Sí","No"]', 'open', 'https://www.bolsasymercados.es'),
('2026-09-16', 'es', '¿Llueve mañana en Madrid capital?', '["Cae agua","Ni una gota"]', 'scheduled', 'https://www.aemet.es'),
('2026-09-17', 'es', '¿Sube Bitcoin hoy respecto a ayer?', '["Sube","Baja"]', 'scheduled', 'https://www.coingecko.com'),
('2026-09-18', 'es', '¿Pasa de 30 °C hoy la máxima en Sevilla?', '["Pasa","No llega"]', 'scheduled', 'https://www.aemet.es'),
('2026-09-19', 'es', '¿Gana el equipo local el partido más visto de la jornada?', '["Local","Visitante o empate"]', 'scheduled', 'https://www.laliga.com'),
('2026-09-20', 'es', '¿Sube Fernando Alonso hoy al podio?', '["Sí, podio","Se queda fuera"]', 'scheduled', 'https://www.formula1.com'),
('2026-09-21', 'es', '¿Cierra hoy el euro por encima de 1,10 $?', '["Por encima","Por debajo"]', 'scheduled', 'https://www.ecb.europa.eu'),
('2026-09-22', 'es', '¿Sigue la misma canción en el nº1 de España esta semana?', '["Sigue nº1","La destronan"]', 'scheduled', 'https://www.elportaldemusica.es'),
('2026-09-23', 'es', '¿Cierra hoy el IBEX 35 en verde?', '["Sí","No"]', 'scheduled', 'https://www.bolsasymercados.es'),
('2026-09-24', 'es', '¿Llueve mañana en Barcelona?', '["Cae agua","Ni una gota"]', 'scheduled', 'https://www.aemet.es'),
('2026-09-25', 'es', '¿Sube Bitcoin hoy respecto a ayer?', '["Sube","Baja"]', 'scheduled', 'https://www.coingecko.com'),
('2026-09-26', 'es', '¿Marca más de 2 goles el líder de La Liga este fin de semana?', '["Más de 2","2 o menos"]', 'scheduled', 'https://www.laliga.com'),
('2026-09-27', 'es', '¿Quién gana hoy el Clásico?', '["Real Madrid","Barça","Empate"]', 'scheduled', 'https://www.laliga.com'),
('2026-09-28', 'es', '¿Abre el lunes el IBEX 35 por encima del cierre del viernes?', '["Por encima","Por debajo"]', 'scheduled', 'https://www.bolsasymercados.es')
on conflict (scheduled_for, lang) do nothing;
