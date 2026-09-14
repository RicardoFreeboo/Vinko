-- ============================================================================
-- VINKO ALFA — 0004: plantillas de porra (source=template, is_template=true)
-- Mismo contenido que lib/templates.ts. Badge "Ejemplo" en UI.
-- SIN picks y SIN profiles ficticios (reglas de datos del ALPHA FREEZE):
-- make_pick() rechaza plantillas, y aquí no se inserta ni un pick.
-- Copy de lista blanca. Idempotente: on conflict (slug) do nothing.
-- ============================================================================

do $$
declare
  t record;
  v_id uuid;
  i int;
  labels text[];
begin
  for t in
    select * from (values
      ('clasico-octubre',    '¿Quién gana el Clásico de octubre?',              timestamptz '2026-10-25 20:00+02', array['Real Madrid','Barça','Empate']),
      ('lluvia-boda-marta',  '¿Llueve el sábado en la boda de Marta?',          timestamptz '2026-10-03 12:00+02', array['Cae la de dios','Ni una gota']),
      ('expulsion-jueves',   '¿Se salva Raquel de la expulsión del jueves?',    timestamptz '2026-10-01 22:00+02', array['Se salva','Expulsada']),
      ('goles-espana-martes','¿Cuántos goles marca España el martes?',          timestamptz '2026-10-13 20:45+02', array['0 o 1','2 o 3','4 o más']),
      ('maraton-luis',       '¿Baja Luis de las 4 horas en el maratón?',        timestamptz '2026-10-18 09:00+02', array['Sí, baja','No llega']),
      ('quien-paga-canas',   '¿Quién paga las cañas este viernes?',             timestamptz '2026-10-02 21:00+02', array['Jorge','Marta','Rober','Lucía']),
      ('fichaje-antes-de',   '¿Cuándo anuncia el equipo su próximo fichaje?',   timestamptz '2026-10-31 23:59+01', array['Esta semana','Este mes','Más tarde']),
      ('carnet-chema',       '¿Aprueba Chema el carnet a la primera?',          timestamptz '2026-10-07 13:00+02', array['A la primera','Repite']),
      ('velada-sabado',      '¿Quién gana el combate principal del sábado?',    timestamptz '2026-10-10 23:00+02', array['El favorito','La sorpresa']),
      ('gasolina-fin-mes',   '¿Baja la gasolina antes de fin de mes?',          timestamptz '2026-10-31 23:59+01', array['Baja','Sigue igual o sube']),
      ('cima-andres-bruno',  '¿Quién llega antes a la cima, Andrés o Bruno?',   timestamptz '2026-10-11 14:00+02', array['Andrés','Bruno']),
      ('cancion-apertura',   '¿Con qué canción abre el concierto del viernes?', timestamptz '2026-10-09 22:00+02', array['Con la nueva','Con el clásico','Sorpresa'])
    ) as v(slug, title, closes_at, labels)
  loop
    insert into public.porras (slug, title, source, is_template, status, closes_at, created_by)
    values (t.slug, t.title, 'template', true, 'open', t.closes_at, null)
    on conflict (slug) do nothing
    returning id into v_id;

    if v_id is not null then
      labels := t.labels;
      for i in 1..array_length(labels, 1) loop
        insert into public.porra_options (porra_id, idx, label)
        values (v_id, i - 1, labels[i]);
      end loop;
    end if;
    v_id := null;
  end loop;
end $$;
