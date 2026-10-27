-- 0065_recibo_pct_visionario — Datos que necesita el diseño del soft launch
-- (VINKO_PANTALLAS §5), para las pantallas de resultado / recibo / perfil:
--   · picks.pct_at_pick  — % que tenía TU opción en el momento de votar
--                          ("solo el 18 % lo pensaba", en el recibo).
--   · picks.receipt_no   — número de recibo (secuencia; cada pick tiene el suyo).
--   · picks.visionario   — la opción ganadora tenía ≤25 % al cierre (insignia,
--                          confeti y recuento "Visionario ×N" en el perfil).
-- El % se mide sobre TODOS los picks (misma base que el termómetro porra_tallies).
--
-- Se hace con TRIGGERS, no reescribiendo make_pick/make_guest_pick/porra_settle:
--   · BEFORE INSERT en picks → pct_at_pick (cubre cualquier vía de voto, reto
--     incluido; make_pick serializa por `for update` sobre la porra).
--   · AFTER UPDATE (status, winning_option_id) en porras → visionario cuando la
--     porra pasa a resolved (cubre todas las vías de resolución).

alter table public.picks add column if not exists pct_at_pick smallint;  -- 0..100
create sequence if not exists public.picks_receipt_seq;
alter table public.picks add column if not exists receipt_no bigint not null default nextval('public.picks_receipt_seq');
alter table public.picks add column if not exists visionario boolean not null default false;
create unique index if not exists picks_receipt_no_uidx on public.picks (receipt_no);

-- pct_at_pick: share (%) de la opción elegida entre TODOS los picks de la porra,
-- ya contando el que se está insertando. BEFORE INSERT para fijarlo sin un UPDATE
-- extra. v_tot/v_opt son los picks EXISTENTES (sin el nuevo); +1 incluye el tuyo.
create or replace function public.picks_set_pct() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tot int; v_opt int;
begin
  select count(*) into v_tot from picks where porra_id = new.porra_id;
  select count(*) into v_opt from picks where porra_id = new.porra_id and option_id = new.option_id;
  new.pct_at_pick := round(100.0 * (v_opt + 1) / (v_tot + 1));
  return new;
end $$;
revoke execute on function public.picks_set_pct() from public, anon, authenticated;
drop trigger if exists trg_picks_pct on public.picks;
create trigger trg_picks_pct before insert on public.picks
  for each row execute function public.picks_set_pct();

-- visionario: al resolver, si la opción ganadora tenía ≤25 % de TODOS los picks,
-- quien la eligió es Visionario. 4·ganadores ≤ total ⟺ ganadores/total ≤ 1/4.
create or replace function public.porras_set_visionario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_tot int; v_win int;
begin
  if new.status = 'resolved' and new.winning_option_id is not null
     and (old.status is distinct from 'resolved'
          or old.winning_option_id is distinct from new.winning_option_id) then
    select count(*) into v_tot from picks where porra_id = new.id;
    select count(*) into v_win from picks where porra_id = new.id and option_id = new.winning_option_id;
    if v_tot > 0 and v_win * 4 <= v_tot then
      update picks set visionario = true
        where porra_id = new.id and option_id = new.winning_option_id;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.porras_set_visionario() from public, anon, authenticated;
drop trigger if exists trg_porras_visionario on public.porras;
create trigger trg_porras_visionario after update of status, winning_option_id on public.porras
  for each row execute function public.porras_set_visionario();

notify pgrst, 'reload schema';
