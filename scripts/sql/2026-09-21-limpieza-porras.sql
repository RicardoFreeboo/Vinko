-- Limpieza de porras del 21-sep-2026 (una sola vez, tras aplicar 0030).
-- Criterio, por orden:
--  A) Retiradas por reglas: sujeto menor de edad; título insultante con vídeo
--     negro sin moderar. Se devuelven los Vinkos.
--  B) Eventos que ya habían ocurrido al publicarse (Mundial 2026 terminó en
--     julio; US Open, Vuelta y GP de España acabaron el 13-sep; Benidorm Fest
--     2026 fue en febrero; "¿quién FUE...?") → anuladas con devolución.
--  C) Duplicadas del mismo evento (Kico ×4, Velada ×2, UFC 331 ×3, Mundial de
--     Comidas ×3, derbi ×2, OT USA ×3, TheGrefg karts ×2, De la Fuente ×2):
--     se queda una, sin picks en ninguna.
--  D) Cerradas sin ningún participante: caducadas (nada que resolver).
-- Las porras de usuarios reales no se tocan.

do $$
declare r record; v_id uuid;
begin
  -- A + B + C: anular con devolución de Vinkos (misma lógica que void_porra,
  -- ejecutada como servidor).
  for r in
    select p.id, p.title, s.motivo from porras p join (values
      ('sera-rafa-cruz-convocado-nuevamente-por-16bd2', 'reglas: sujeto menor de edad'),
      ('roberto-es-mongolo-wkcq', 'reglas: título ofensivo, vídeo sin moderar'),
      ('marcara-gol-la-seleccion-en-su-proximo-partido-de-b48a', 'evento pasado: el Mundial 2026 terminó en julio'),
      ('alonso-podio', 'evento inexistente: no hubo carrera el 20-sep'),
      ('quien-terminara-mejor-clasificado-en-el-bb2ba', 'evento pasado: GP de España fue el 13-sep'),
      ('terminara-fernando-alonso-en-el-podio-086bd', 'evento pasado: GP de España fue el 13-sep'),
      ('quien-fue-el-ultimo-expulsado-de-superv-be400', 'pregunta en pasado: no es un pronóstico'),
      ('quien-ganara-el-benidorm-fest-2026-y-r-40ea1', 'evento pasado: Benidorm Fest 2026 fue en febrero')
    ) as s(slug, motivo) on s.slug = p.slug or p.slug like s.slug || '%'
    where p.status = 'open'
  loop
    update porras set status = 'taken_down', void_reason = r.motivo where id = r.id;
    update profiles pr set points = pr.points + k.points_spent
      from picks k where k.porra_id = r.id and k.user_id = pr.id;
    insert into notifications (user_id, class, title, body, url)
      select k.user_id, 'resolucion', 'Porra anulada: ' || left(r.title, 50),
             'Se te devuelven ' || k.points_spent || ' Vinkos.', '/feed'
      from picks k where k.porra_id = r.id;
    raise notice 'ANULADA %: %', r.title, r.motivo;
  end loop;

  -- B por título (los slugs van recortados y no siempre contienen el evento):
  for r in
    select p.id, p.title, m.motivo from porras p join (values
      ('%US Open%', 'evento pasado: el US Open 2026 terminó el 13-sep'),
      ('%Vuelta a España%', 'evento pasado: la Vuelta 2026 terminó el 13-sep'),
      ('%Benidorm Fest 2026%', 'evento pasado: Benidorm Fest 2026 fue en febrero'),
      ('%Mundial 2026%', 'evento pasado: el Mundial 2026 terminó en julio')
    ) as m(pat, motivo) on p.title ilike m.pat
    where p.status = 'open' and not p.is_template
      and not exists (select 1 from picks k where k.porra_id = p.id)
  loop
    update porras set status = 'taken_down', void_reason = r.motivo where id = r.id;
    raise notice 'RETIRADA %: %', r.title, r.motivo;
  end loop;

  -- C por patrón de slug (duplicadas; todas sin picks, se comprueba igualmente):
  for r in
    select p.id, p.title, m.motivo from porras p join (values
      ('abandonara-kico-el-programa-la-isla-de-%', 'duplicada (Kico, se conserva una)'),
      ('abandonara-kico-la-isla-de-las-tentaci-%', 'duplicada (Kico, se conserva una)'),
      ('abandonara-kico-sampol-la-isla-de-las-%', 'duplicada (Kico, se conserva una)'),
      ('se-celebrara-la-velada-del-ano-6-con-l%', 'duplicada (Velada, se conserva una)'),
      ('quien-ganara-el-combate-estelar-de-ufc%', 'duplicada (UFC 331, se conserva una)'),
      ('quien-ganara-el-combate-entre-joshua-v%', 'duplicada (UFC 331, se conserva una)'),
      ('que-pais-ganara-el-mundial-de-comidas-%', 'duplicada (Mundial de Comidas, se conserva una)'),
      ('ganara-el-ceviche-el-mundial-de-comida%', 'duplicada (Mundial de Comidas, se conserva una)'),
      ('cual-sera-el-resultado-del-atletico-de%', 'duplicada (derbi, se conserva una)'),
      ('conseguira-la-concursante-espanola-de-%', 'duplicada (OT USA, se conserva una)'),
      ('sera-eliminada-la-concursante-espanola%', 'duplicada (OT USA, se conserva una)'),
      ('conseguira-thegrefg-terminar-sin-ser-c%', 'duplicada (karts, se conserva una)'),
      ('renovara-luis-de-la-fuente-su-contrato-como-seleccionador-de-espana-hasta%', 'duplicada (De la Fuente, se conserva una)')
    ) as m(pat, motivo) on p.slug like m.pat
    where p.status = 'open'
      and not exists (select 1 from picks k where k.porra_id = p.id)
  loop
    update porras set status = 'taken_down', void_reason = r.motivo where id = r.id;
    raise notice 'RETIRADA %: %', r.title, r.motivo;
  end loop;

  -- Vídeo de La Isla generado el 15-sep cuya porra se borró en una purga:
  -- se le asigna a la porra viva sobre el mismo tema (sin coste).
  update porras set media_url = 'https://uarnpxjdccbidgzhhavc.supabase.co/storage/v1/object/public/porra-media/agent/isla-tentaciones-t11.mp4',
                    media_kind = 'video'
    where slug = 'cual-sera-la-primera-pareja-en-abandona-ba6e1' and status = 'open' and media_url is null;

  -- D: cerradas sin participantes → caducadas.
  update porras set status = 'taken_down', void_reason = 'caducada sin participantes'
    where status = 'open' and not is_template and closes_at < now()
      and not exists (select 1 from picks k where k.porra_id = porras.id);
end $$;

select status, count(*) from porras where not is_template group by 1;
