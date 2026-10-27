-- 0071_campaign_stripe — idempotencia y registro del pago B2B (Stripe)
-- El anunciante paga por Stripe Checkout (página alojada por Stripe); el webhook
-- marca la campaña como pagada y la activa. Columnas:
--   · stripe_session_id: id de la sesión de Checkout. Sirve de llave de
--     idempotencia para no activar dos veces si el webhook se repite.
--   · paid_at: cuándo se confirmó el pago.
-- El JUGADOR nunca toca dinero: esto es B2B (marca → Vinko). Paso aditivo.
alter table public.ad_campaigns add column if not exists stripe_session_id text;
alter table public.ad_campaigns add column if not exists paid_at          timestamptz;
create index if not exists ad_campaigns_stripe_session_idx
  on public.ad_campaigns (stripe_session_id) where stripe_session_id is not null;
notify pgrst, 'reload schema';
