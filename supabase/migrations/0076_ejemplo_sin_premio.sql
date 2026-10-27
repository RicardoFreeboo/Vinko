-- ============================================================================
-- VINKO — 0076: el ejemplo «¿Quién paga las cañas este viernes?» (semilla
-- 0004, sale en la portada) daba a entender que se juega algo con valor.
-- Modo solo-puntos (REGLAS-LEGALES §3): mismo slug y opciones, otra pregunta.
-- El respaldo SSR de lib/templates.ts dice lo mismo. Idempotente.
-- ============================================================================
update public.porras
   set title = '¿Quién llega el último el viernes?'
 where slug = 'quien-paga-canas' and is_template;
