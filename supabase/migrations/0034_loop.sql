-- 0034 — Loop viral (21-sep-2026)
-- Complemento de 0030 para el enlace de invitación ?ref=<handle>:
--  · invitee_pts explícito en remote_config.economy (pay_referral ya lo lee
--    con respaldo 200; así /saldo enseña la cifra real y se puede ajustar sin
--    deploy).
--  · claim_referral ejecutable por sesiones autenticadas (0030 la reemplazó
--    con create or replace, que conserva el grant de 0008; se deja explícito
--    e idempotente por si la función se recrea desde cero).
--  · índice para los recuentos de pay_referral (invitados por invitador/día).

update public.remote_config
  set value = value || '{"invitee_pts": 200}'::jsonb, updated_at = now()
  where key = 'economy' and not (value ? 'invitee_pts');

grant execute on function public.claim_referral(text) to authenticated;
revoke execute on function public.claim_referral(text) from anon;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by) where referred_by is not null;

notify pgrst, 'reload schema';
