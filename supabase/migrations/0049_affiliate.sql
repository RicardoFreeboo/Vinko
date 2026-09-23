-- 0049_affiliate — Flujo de afiliación a operador licenciado (regla de oro 5;
-- piloto Luckia/GrowIbiza). Vinko manda tráfico y NO toca fondos: el operador
-- licenciado tiene el dinero y las cuentas. Age-gate +18, solo con la afiliación
-- del país habilitada (cfg money.countries.<c>.affiliate.enabled). El subid que
-- viaja en la URL es un hash (nunca el id de usuario en claro: privacidad/GDPR).
-- Las tablas affiliate_links / affiliate_clicks ya existen (0045), apagadas.

-- Redirección: valida elegibilidad, registra el clic (hash) y devuelve la URL
-- del operador con {subid} resuelto. La llama el route handler /api/afiliado.
create or replace function public.affiliate_go(p_operator text, p_country text, p_porra uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_link affiliate_links%rowtype; p profiles%rowtype; v_cc text; v_subid text;
begin
  if auth.uid() is null then raise exception 'VINKO_NO_AUTH'; end if;
  if public.jwt_is_anonymous() then raise exception 'VINKO_NOT_GUEST'; end if;
  v_cc := upper(coalesce(p_country, ''));
  if v_cc !~ '^[A-Z]{2}$' then raise exception 'VINKO_AFFILIATE_BAD_COUNTRY'; end if;
  -- afiliación habilitada para el país (y sin kill switch global)
  if coalesce((cfg('money')->'global'->>'kill_switch')::boolean, false)
     or not coalesce((cfg('money')->'countries'->v_cc->'affiliate'->>'enabled')::boolean, false) then
    raise exception 'VINKO_AFFILIATE_OFF';
  end if;
  -- +18 declarado (age-gate de la regla de oro 8)
  select * into p from profiles where id = auth.uid();
  if p.birth_year is null or extract(year from now())::int - p.birth_year < 18 then
    raise exception 'VINKO_AFFILIATE_UNDERAGE';
  end if;
  select * into v_link from affiliate_links where country = v_cc and operator = p_operator and enabled;
  if not found then raise exception 'VINKO_AFFILIATE_UNKNOWN'; end if;
  -- subid pseudónimo (no reversible al id en claro) para atribución del operador
  v_subid := substr(md5(auth.uid()::text || ':' || p_operator || ':' || v_cc), 1, 16);
  insert into affiliate_clicks (user_hash, operator, country, porra_id)
    values (substr(md5(auth.uid()::text || ':vinko-affiliate'), 1, 32), p_operator, v_cc, p_porra);
  perform emit_event('affiliate_click', auth.uid(),
    jsonb_build_object('operator', p_operator, 'country', v_cc, 'has_porra', p_porra is not null));
  return replace(v_link.url_template, '{subid}', v_subid);
end $$;
revoke execute on function public.affiliate_go(text, text, uuid) from public, anon;
grant execute on function public.affiliate_go(text, text, uuid) to authenticated;

-- Alta/edición del enlace de un operador (solo admin). Exige {subid} en la
-- plantilla y una base legal (contrato/piloto). enabled=false por defecto.
create or replace function public.affiliate_link_upsert(
  p_country text, p_operator text, p_url_template text, p_legal_basis_ref text, p_enabled boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'VINKO_NOT_ADMIN'; end if;
  if upper(coalesce(p_country,'')) !~ '^[A-Z]{2}$' then raise exception 'VINKO_AFFILIATE_BAD_COUNTRY'; end if;
  if position('{subid}' in coalesce(p_url_template,'')) = 0 then raise exception 'VINKO_AFFILIATE_NO_SUBID'; end if;
  if nullif(trim(coalesce(p_legal_basis_ref,'')),'') is null then raise exception 'VINKO_AFFILIATE_NO_LEGAL_BASIS'; end if;
  insert into affiliate_links (country, operator, url_template, legal_basis_ref, enabled)
    values (upper(p_country), p_operator, p_url_template, p_legal_basis_ref, coalesce(p_enabled, false))
    on conflict (country, operator) do update set
      url_template = excluded.url_template, legal_basis_ref = excluded.legal_basis_ref, enabled = excluded.enabled;
end $$;
revoke execute on function public.affiliate_link_upsert(text, text, text, text, boolean) from public, anon;
grant execute on function public.affiliate_link_upsert(text, text, text, text, boolean) to authenticated;

-- Lectura para la UI: operadores con afiliación habilitada en un país (sin URL:
-- la URL solo se resuelve al hacer clic, con el subid). Devuelve [] si está off.
create or replace function public.affiliate_offer(p_country text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((cfg('money')->'global'->>'kill_switch')::boolean, false)
      or not coalesce((cfg('money')->'countries'->upper(p_country)->'affiliate'->>'enabled')::boolean, false)
    then '[]'::jsonb
    else coalesce((select jsonb_agg(jsonb_build_object('operator', operator, 'country', country) order by operator)
                   from affiliate_links where country = upper(p_country) and enabled), '[]'::jsonb)
  end;
$$;
grant execute on function public.affiliate_offer(text) to anon, authenticated;

notify pgrst, 'reload schema';
