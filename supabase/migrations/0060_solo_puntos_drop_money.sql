-- ============================================================================
-- 0060 — SOLO-PUNTOS: saca el DINERO de la base (secciones 1.1/1.2/1.3/1.6).
-- Idempotente (drop ... if exists + cascade): el workflow la re-aplica sin romper.
--
-- Borra el subsistema de dinero real: wallet/ledger, pools de dinero, KYC,
-- participaciones, eventos de pago, Club/Stripe (billing), P2P, afiliación y
-- revenue-share — tablas, RPCs, columnas de pago del perfil y su config.
--
-- NO toca la economía de puntos: picks, porras, porra_payouts (Vinkos),
-- make_pick/porra_settle, ligas, temporada, grupos, rachas. El Reto-premio
-- (stake_kind/stake_text) se quita en 0061 (reescritura del núcleo).
-- SE CONSERVA: safer_play_* (bienestar, §2.9) y profile_public (SEC-01).
-- La capa 2 (dinero con licencia) vive archivada en archive/capa2-dinero.
-- Ver REGLAS-LEGALES.md.
-- ============================================================================

-- ── 1) Tablas de dinero (cascade: se llevan triggers, FKs e índices) ─────────
drop table if exists public.money_ledger_refs        cascade;
drop table if exists public.money_accounts           cascade;
drop table if exists public.money_participations     cascade;
drop table if exists public.money_pools              cascade;
drop table if exists public.money_events             cascade;
drop table if exists public.money_eligibility_cache  cascade;
drop table if exists public.p2p_settlements          cascade;
drop table if exists public.p2p_entries              cascade;
drop table if exists public.p2p_pools                cascade;
drop table if exists public.club_subscriptions       cascade;
drop table if exists public.billing_events           cascade;
drop table if exists public.billing_customers        cascade;
drop table if exists public.affiliate_clicks         cascade;
drop table if exists public.affiliate_links          cascade;
drop table if exists public.revenue_share_statements cascade;
drop table if exists public.results_feed            cascade;

-- ── 2) Triggers y columnas de dinero en porras (guards de money_eligible y del
--       resultado con money_pools, ya huérfanos) + pago/Club en profiles (§1.2) ─
drop trigger if exists trg_porras_money_result   on public.porras;
drop trigger if exists trg_porras_money_eligible on public.porras;
alter table public.porras   drop column if exists money_eligible;
alter table public.porras   drop column if exists resolution_source_ref;
alter table public.profiles drop column if exists pay_handle;
alter table public.profiles drop column if exists club_active;
alter table public.profiles drop column if exists club_until;

-- ── 3) RPCs de dinero (todas las sobrecargas, por nombre) ────────────────────
-- Se CONSERVAN: money_schema_invariant (candado anti-dinero) y safer_play_*.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'money_apply_event','money_apply_event_impl','money_admin_set_source',
      'money_config_set_country','money_country_mode','money_event_fail',
      'money_event_retry','money_join_ref','money_kill_switch_set',
      'money_ledger_apply','money_participations_guard','money_pool_ref_create',
      'money_pool_ref_set_status','money_pools_guard','money_withdraw_ref','wallet_get',
      'p2p_group_list','p2p_pool_create','p2p_pool_get','p2p_pool_join','p2p_pool_leave',
      'p2p_pool_resolve','p2p_pool_void','p2p_set_enabled','p2p_settle_confirm',
      'p2p_settle_mark_paid','p2p_settle_unmark',
      'club_apply_event','club_set_customer',
      'affiliate_go','affiliate_link_upsert','affiliate_offer',
      'revenue_share_record','revenue_share_summary',
      'porras_money_result_guard','porras_money_eligible_guard'
    )
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- ── 4) Tipos enum exclusivos del dinero ──────────────────────────────────────
drop type if exists public.club_status cascade;

-- ── 5) Config de dinero en remote_config (money / Club / P2P / UI) ───────────
delete from public.remote_config where key in ('money', 'club', 'p2p', 'money_ui');

notify pgrst, 'reload schema';
