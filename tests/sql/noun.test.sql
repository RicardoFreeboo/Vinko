-- ============================================================================
-- LA PALABRA VISIBLE (0075): «porra» → «predicción» en el buzón y en los push.
-- Corre en tests/sql/run.sh.
-- ============================================================================
\set ON_ERROR_STOP on

do $$
declare
  u uuid; n notifications%rowtype; q push_queue%rowtype;
begin
  -- (NOUN-01) Palabra entera, con mayúscula y en plural.
  if vinko_noun('Porra anulada: tu porra y tus porras. Porras nuevas')
     <> 'Predicción anulada: tu predicción y tus predicciones. Predicciones nuevas' then
    raise exception 'NOUN-01: %', vinko_noun('Porra anulada: tu porra y tus porras. Porras nuevas');
  end if;

  -- (NOUN-02) Otras palabras que contienen «porra» no se tocan; null pasa.
  if vinko_noun('porrazo, aporrear y porrón') <> 'porrazo, aporrear y porrón' then
    raise exception 'NOUN-02: %', vinko_noun('porrazo, aporrear y porrón');
  end if;
  if vinko_noun(null) is not null then raise exception 'NOUN-02: null debía seguir null'; end if;

  -- (NOUN-03) notify_user → el buzón guarda la palabra nueva; la url, intacta.
  insert into auth.users (email) values ('n.ana@test.dev') returning id into u;
  perform notify_user(u, 'resolucion', 'Porra anulada', '3 ya han entrado en tu porra', '/p/porra-abc');
  select * into n from notifications where user_id = u order by created_at desc limit 1;
  if n.title <> 'Predicción anulada' or n.body <> '3 ya han entrado en tu predicción' then
    raise exception 'NOUN-03: % / %', n.title, n.body;
  end if;
  if n.url <> '/p/porra-abc' then raise exception 'NOUN-03: la url cambió (%)', n.url; end if;

  -- (NOUN-04) La cola de push también.
  insert into push_queue (user_id, class, title, body, url)
    values (u, 'reactivacion', 'Tus porras siguen sin ti', null, '/p/porra-abc');
  select * into q from push_queue where user_id = u and class = 'reactivacion' limit 1;
  if q.title <> 'Tus predicciones siguen sin ti' or q.body is not null or q.url <> '/p/porra-abc' then
    raise exception 'NOUN-04: % / % / %', q.title, q.body, q.url;
  end if;

  raise notice 'noun: NOUN-01..04 OK';
end $$;
