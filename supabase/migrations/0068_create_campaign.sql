-- 0068_create_campaign — RPC create_campaign para VINKO ADS (A2-A5 / PANTALLAS §6)
-- El flujo self-service /ads/nueva llama a este RPC AL ENVIAR: crea (o reutiliza)
-- el anunciante del usuario y una campaña en BORRADOR con el precio por voto
-- CONGELADO desde remote_config.ads. NO cobra nada aquí: el pago B2B (Stripe) y el
-- paso a 'in_review' vienen después; el JUGADOR nunca toca dinero.
--
-- SECURITY DEFINER como el resto de RPC (0041/0051): valida auth.uid() y las
-- reglas, luego inserta saltándose RLS pero fijando owner = quien llama. No
-- expone 'operator' (anunciantes de juego solo por R5, gated por market). El
-- precio se lee de config para tocarlo sin desplegar. Idempotente (create or
-- replace); cada llamada crea UNA campaña.

create or replace function public.create_campaign(
  p_name          text,
  p_market        text,
  p_budget_cents  bigint,
  p_objective     text    default 'opinion',
  p_format        text    default 'sponsored_porra',
  p_logo_url      text    default null,
  p_cities        text[]  default '{}',
  p_cta_text      text    default null,
  p_cta_url       text    default null,
  p_creative_url  text    default null,
  p_creative_kind text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_cfg      jsonb;
  v_price    int;
  v_min      bigint;
  v_adv      uuid;
  v_campaign uuid;
begin
  if v_uid is null then raise exception 'VINKO_NO_AUTH'; end if;

  -- Reglas de precio/mínimo desde remote_config.ads (sembrado en 0067).
  select value into v_cfg from remote_config where key = 'ads';
  if v_cfg is null then raise exception 'VINKO_ADS_OFF'; end if;
  v_price := coalesce((v_cfg->>'price_per_vote_cents')::int, 8);
  v_min   := coalesce((v_cfg->>'min_budget_cents')::bigint, 5000);

  -- Validaciones de entrada.
  p_name := left(trim(coalesce(p_name, '')), 80);
  if char_length(p_name) < 2 then raise exception 'VINKO_ADV_NAME'; end if;
  if p_budget_cents < v_min then raise exception 'VINKO_ADS_MIN_BUDGET'; end if;
  if p_objective not in ('awareness', 'opinion', 'traffic') then
    raise exception 'VINKO_ADS_OBJECTIVE';
  end if;
  if p_format not in ('sponsored_porra', 'sponsored_league', 'sponsored_prize',
                      'rewarded_video', 'receipt_signature') then
    raise exception 'VINKO_ADS_FORMAT';
  end if;
  -- El mercado debe existir y estar ACTIVO (markets de 0064).
  if not exists (select 1 from markets m where m.code = p_market and m.active) then
    raise exception 'VINKO_ADS_MARKET';
  end if;

  -- Anunciante del usuario: se reutiliza el que tenga ese mismo nombre (no se
  -- duplica una marca que vuelve a crear campaña), o se crea.
  select id into v_adv from advertisers
    where owner = v_uid and name = p_name
    limit 1;
  if v_adv is null then
    insert into advertisers (owner, name, logo_url)
      values (v_uid, p_name, nullif(trim(coalesce(p_logo_url, '')), ''))
      returning id into v_adv;
  elsif p_logo_url is not null and trim(p_logo_url) <> '' then
    update advertisers set logo_url = trim(p_logo_url) where id = v_adv;
  end if;

  -- Campaña en BORRADOR con el precio por voto congelado.
  insert into ad_campaigns (
    advertiser_id, market, status, objective, format,
    budget_cents, price_per_vote_cents,
    cities, cta_text, cta_url, creative_url, creative_kind
  ) values (
    v_adv, p_market, 'draft', p_objective, p_format,
    p_budget_cents, v_price,
    coalesce(p_cities, '{}'),
    nullif(trim(coalesce(p_cta_text, '')), ''),
    nullif(trim(coalesce(p_cta_url, '')), ''),
    nullif(trim(coalesce(p_creative_url, '')), ''),
    case when p_creative_kind in ('image', 'video') then p_creative_kind else null end
  ) returning id into v_campaign;

  return v_campaign;
end $$;

grant execute on function public.create_campaign(
  text, text, bigint, text, text, text, text[], text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
