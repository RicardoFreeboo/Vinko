-- 0052_daily_open — La racha cuenta al ENTRAR en la app cada día, no solo al
-- picar o recoger el regalo. La app llama daily_open() al abrir; touch_streak ya
-- es idempotente por día (si streak_last = hoy, no hace nada), así que es barato.
-- Invitados no cuentan (jwt anónimo). No toca puntos: solo la racha.
create or replace function public.daily_open() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if public.jwt_is_anonymous() then return; end if;
  perform public.touch_streak(auth.uid());
end $$;
revoke execute on function public.daily_open() from public, anon;
grant execute on function public.daily_open() to authenticated;

notify pgrst, 'reload schema';
