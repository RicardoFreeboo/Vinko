-- ============================================================================
-- VINKO ADS (0068): RPC create_campaign. Crea anunciante + campaña en borrador
-- con el precio por voto congelado desde remote_config.ads (sembrado en 0067).
-- Mismos stubs de auth que el resto (test.uid/test.jwt). Corre en tests/sql/run.sh.
-- ============================================================================
\set ON_ERROR_STOP on

create or replace function test_as(p_uid uuid, p_anon boolean default false) returns void
language sql as $$
  select set_config('test.uid', p_uid::text, false),
         set_config('test.jwt', json_build_object('is_anonymous', p_anon)::text, false);
$$;

do $$
declare
  a uuid; cid uuid; v_adv uuid; v_price int; v_budget bigint; v_status text;
  v_q text; v_opts text[];
begin
  insert into auth.users (email) values ('adv.ana@test.dev') returning id into a;
  perform test_as(a);

  -- (ADS-01) Campaña válida: mercado GLOBAL activo, presupuesto >= mínimo (5000).
  cid := create_campaign(
    p_name => 'Arepa Co', p_market => 'GLOBAL', p_budget_cents => 12000,
    p_objective => 'opinion', p_cta_text => 'Prueba la arepa de la casa',
    p_question => '¿Qué arepa pedirá la mayoría para el clásico?',
    p_options => array['De queso', 'Con todo', '  ']  -- la vacía se descarta
  );
  if cid is null then raise exception 'ADS-01: create_campaign no devolvió id'; end if;
  select status, price_per_vote_cents, budget_cents, advertiser_id
    into v_status, v_price, v_budget, v_adv
    from ad_campaigns where id = cid;
  if v_status <> 'draft' then raise exception 'ADS-01: la campaña debía nacer en draft, es %', v_status; end if;
  if v_price <> 8 then raise exception 'ADS-01: precio por voto no congelado desde config (esperaba 8, es %)', v_price; end if;
  if v_budget <> 12000 then raise exception 'ADS-01: presupuesto mal guardado (%)', v_budget; end if;
  if not exists (select 1 from advertisers where id = v_adv and owner = a and name = 'Arepa Co') then
    raise exception 'ADS-01: anunciante no creado o propiedad incorrecta';
  end if;
  -- Borrador de contenido (0069): pregunta guardada y opciones limpias (sin vacía).
  select draft_question, draft_options into v_q, v_opts from ad_campaigns where id = cid;
  if v_q is null or v_q not like '%clásico%' then raise exception 'ADS-01: pregunta borrador no guardada'; end if;
  if array_length(v_opts, 1) <> 2 then raise exception 'ADS-01: opciones borrador mal (esperaba 2, hay %)', array_length(v_opts, 1); end if;

  -- (ADS-02) Repetir el MISMO nombre reutiliza el anunciante (no lo duplica).
  perform create_campaign(p_name => 'Arepa Co', p_market => 'GLOBAL', p_budget_cents => 5000);
  if (select count(*) from advertisers where owner = a and name = 'Arepa Co') <> 1 then
    raise exception 'ADS-02: debía reutilizar el anunciante, no duplicarlo';
  end if;
  if (select count(*) from ad_campaigns where advertiser_id = v_adv) <> 2 then
    raise exception 'ADS-02: debía haber 2 campañas del mismo anunciante';
  end if;

  -- (ADS-03) Presupuesto por debajo del mínimo -> error.
  begin
    perform create_campaign(p_name => 'Marca Pobre', p_market => 'GLOBAL', p_budget_cents => 100);
    raise exception 'ADS-03: un presupuesto < mínimo debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_ADS_MIN_BUDGET%' then raise exception 'ADS-03: error inesperado %', sqlerrm; end if;
  end;

  -- (ADS-04) Mercado inactivo (ES está sembrado como active=false) -> error.
  begin
    perform create_campaign(p_name => 'Paella Bros', p_market => 'ES', p_budget_cents => 9000);
    raise exception 'ADS-04: un mercado inactivo debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_ADS_MARKET%' then raise exception 'ADS-04: error inesperado %', sqlerrm; end if;
  end;

  -- (ADS-05) Sin sesión (auth.uid() null) -> VINKO_NO_AUTH.
  perform set_config('test.uid', '', false);
  begin
    perform create_campaign(p_name => 'Anon', p_market => 'GLOBAL', p_budget_cents => 9000);
    raise exception 'ADS-05: sin sesión debía rechazarse';
  exception when others then
    if sqlerrm not like '%VINKO_NO_AUTH%' then raise exception 'ADS-05: error inesperado %', sqlerrm; end if;
  end;

  raise notice 'ads.test OK';
end $$;
