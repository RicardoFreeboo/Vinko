-- 0069_campaign_draft_content — la porra patrocinada vive con la campaña
-- La campaña de 0067/0068 guardaba solo lo comercial (presupuesto, formato, CTA);
-- el flujo /ads/nueva (A3) recoge además la PREGUNTA y las OPCIONES de la porra.
-- Hasta que la campaña se activa (tras el pago) no se crea la porra real en el
-- feed, así que el borrador de contenido se guarda en la propia campaña.
--
-- draft_question/draft_options son el borrador; al activar se materializará la
-- porra (porras.campaign_id). create_campaign se REDEFINE para recibirlos: se
-- borra la firma de 11 args de 0068 y se recrea con dos opcionales más (si no se
-- dropa, Postgres crearía una SOBRECARGA y la llamada sería ambigua en PostgREST).

alter table public.ad_campaigns add column if not exists draft_question text;
alter table public.ad_campaigns add column if not exists draft_options  text[];

drop function if exists public.create_campaign(
  text, text, bigint, text, text, text, text[], text, text, text, text
);

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
  p_creative_kind text    default null,
  p_question      text    default null,
  p_options       text[]  default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_cfg      jsonb;
  v_price    int;
  v_min      bigint;
  v_adv      uuid;
  v_campaign uuid;
  v_opts     text[];
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

  -- Borrador de contenido: opciones limpias (sin vacíos), recortadas.
  v_opts := array(
    select left(trim(o), 60) from unnest(coalesce(p_options, '{}')) o
    where trim(coalesce(o, '')) <> ''
  );

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

  -- Campaña en BORRADOR con el precio por voto congelado y el contenido borrador.
  insert into ad_campaigns (
    advertiser_id, market, status, objective, format,
    budget_cents, price_per_vote_cents,
    cities, cta_text, cta_url, creative_url, creative_kind,
    draft_question, draft_options
  ) values (
    v_adv, p_market, 'draft', p_objective, p_format,
    p_budget_cents, v_price,
    coalesce(p_cities, '{}'),
    nullif(trim(coalesce(p_cta_text, '')), ''),
    nullif(trim(coalesce(p_cta_url, '')), ''),
    nullif(trim(coalesce(p_creative_url, '')), ''),
    case when p_creative_kind in ('image', 'video') then p_creative_kind else null end,
    nullif(left(trim(coalesce(p_question, '')), 160), ''),
    case when array_length(v_opts, 1) >= 2 then v_opts else null end
  ) returning id into v_campaign;

  return v_campaign;
end $$;

grant execute on function public.create_campaign(
  text, text, bigint, text, text, text, text[], text, text, text, text, text, text[]
) to authenticated;

notify pgrst, 'reload schema';
