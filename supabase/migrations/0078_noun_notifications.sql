-- ============================================================================
-- VINKO — 0078: la palabra visible también en el buzón y en los push.
-- Decisión de producto (27-oct): lo que el código llama «porra» se ve como
-- «predicción» (markets.noun = 'predicción' desde 0070; la copy de la app la
-- pinta con lib/noun.ts). Los textos de los avisos se montan en SQL en una
-- docena de funciones («Porra anulada…», «… ya han entrado en tu porra»). En
-- vez de reescribirlas todas, un trigger BEFORE INSERT en notifications y en
-- push_queue cambia la palabra entera (Porras/porras/Porra/porra) en title y
-- body. La url no se toca: los slugs pueden llevar «porra».
-- Efecto asumido: si un usuario escribió «porra» en el título de su
-- predicción, el aviso lo dirá con la palabra nueva (la página, no).
-- Idempotente: se re-aplica en cada despliegue (MIGRATIONS_FROM).
-- ============================================================================

create or replace function public.vinko_noun(s text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(s,
    '\mPorras\M', 'Predicciones', 'g'),
    '\mporras\M', 'predicciones', 'g'),
    '\mPorra\M', 'Predicción', 'g'),
    '\mporra\M', 'predicción', 'g')
$$;

create or replace function public.notif_noun() returns trigger
language plpgsql set search_path = public as $$
begin
  new.title := public.vinko_noun(new.title);
  new.body := public.vinko_noun(new.body);
  return new;
end $$;

drop trigger if exists notif_noun on public.notifications;
create trigger notif_noun before insert on public.notifications
  for each row execute function public.notif_noun();

drop trigger if exists push_noun on public.push_queue;
create trigger push_noun before insert on public.push_queue
  for each row execute function public.notif_noun();
