// Vista de dinero de una porra/bolsa (M0, docs/money/CONTRATOS_M0.md §B3).
// Solo servidor (usa supabaseServer y lib/geo, que leen next/headers). Devuelve
// null RÁPIDO cuando no hay nada que mostrar; si hay bolsa, calcula la
// elegibilidad con computeEligibility. En producción, con todos los países
// apagados, siempre devuelve null: no hay UI de dinero pública.
import { supabaseServer } from "@/lib/supabase/server";
import { getMoneyConfig, countryCfg, type MoneyCountryCfg, type MoneyCfg } from "@/lib/money/config";
import { ipCountry } from "@/lib/geo";
import { computeEligibility } from "@/lib/money/eligibility";
import { getMoneyProvider } from "@/lib/money/provider";
import { SITE } from "@/lib/share";
import type { Session } from "@/lib/session";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Eligibility, KycStatus } from "@/packages/money-provider/src";

type ParticipationStatus = "pending" | "confirmed" | "failed" | "refunded" | "paid";

// Razones "blandas": el usuario es apto salvo un paso que puede completar (KYC) o
// un tope temporal. Cualquier OTRA razón (menor, autoexcluido, kill switch, geo,
// país apagado, sin proveedor…) es un bloqueo DURO: la sección de dinero no se
// muestra siquiera (regla de oro 8: cero CTA de dinero a menores ni a excluidos).
const SOFT_REASONS = new Set(["kyc_required", "kyc_pending", "limit_reached"]);
export function moneySectionVisible(e: { eligible: boolean; reasons: string[] }): boolean {
  return e.eligible || e.reasons.every((r) => SOFT_REASONS.has(r));
}

export type MoneyView = {
  poolId: string;
  externalPoolId: string | null;
  provider: string;
  country: string;
  currency: string;
  stakeMinor: number;
  rakeBps: number;
  status: "open" | "closed" | "settled" | "voided" | "draft";
  closesAt: string;
  myParticipation: { status: ParticipationStatus; optionIdx: number } | null;
  eligibility: Eligibility;
  withdrawAllowed: boolean;
};

type PoolRow = {
  id: string;
  porra_id: string;
  country: string;
  provider: string;
  external_pool_id: string | null;
  currency: string;
  stake_minor: number;
  rake_bps: number;
  status: MoneyView["status"];
  closes_at: string;
};

const POOL_FIELDS =
  "id, porra_id, country, provider, external_pool_id, currency, stake_minor, rake_bps, status, closes_at";
const CACHE_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Un país está "vivo" (puede haber dinero) si está enabled y con modo real.
function countryLive(c: MoneyCountryCfg | null): boolean {
  return !!c && c.enabled && (c.mode === "partner" || c.mode === "own");
}

async function buildView(
  sb: SupabaseClient,
  session: Session,
  cfg: MoneyCfg,
  pool: PoolRow,
  poolCfg: MoneyCountryCfg,
): Promise<MoneyView> {
  const uid = session.id;
  const poolCountry = pool.country;

  // Proveedor: solo se instancia fuera de producción con el mock; en producción
  // (o sin secreto) es null → provider_unavailable.
  const provider = getMoneyProvider(pool.provider, {
    env: cfg.env,
    siteUrl: SITE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  const providerAvailable = provider !== null;

  // KYC: SOLO desde la caché fresca (<10 min), que en M0 escribe únicamente el
  // webhook (kyc.updated). Sin fila fresca → 'none' (el usuario pasa por la página
  // de verificación del proveedor). No se llama a provider.eligibility() aquí: en
  // staging el mock devuelve 'verified' por defecto y saltaría la verificación sin
  // pasar por el flujo (contrato §B3, corrección 22-sep).
  let kyc: { status: KycStatus; country?: string | null } = { status: "none" };
  let selfExcluded = false;
  const { data: cache } = await sb
    .from("money_eligibility_cache")
    .select("kyc_status, reasons, checked_at, country")
    .eq("user_id", uid)
    .eq("country", poolCountry)
    .maybeSingle();
  const cacheRow = cache as
    | { kyc_status: string; reasons: string[] | null; checked_at: string; country: string }
    | null;
  const fresh = cacheRow && Date.now() - Date.parse(cacheRow.checked_at) < CACHE_TTL_MS;
  if (fresh && cacheRow) {
    kyc = { status: cacheRow.kyc_status as KycStatus, country: cacheRow.country };
    selfExcluded = Array.isArray(cacheRow.reasons) && cacheRow.reasons.includes("self_excluded");
  }

  // Bolsas del usuario en 24 h sin contar las fallidas (mismo criterio que
  // money_join_ref en 0045): base de 'limit_reached'.
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await sb
    .from("money_participations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .neq("status", "failed")
    .gte("created_at", since);
  const poolsToday = count ?? 0;

  // Mi participación en ESTA bolsa (RLS: solo la propia).
  const { data: mineData } = await sb
    .from("money_participations")
    .select("status, option_idx")
    .eq("money_pool_id", pool.id)
    .eq("user_id", uid)
    .maybeSingle();
  const mine = mineData as { status: ParticipationStatus; option_idx: number } | null;
  const myParticipation = mine ? { status: mine.status, optionIdx: mine.option_idx } : null;

  const eligibility = computeEligibility({
    anonymous: false,
    killSwitch: cfg.global.kill_switch,
    country: poolCfg,
    ipCountry: await ipCountry(),
    declaredCountry: session.country,
    birthYear: session.birth_year,
    nowYear: new Date().getFullYear(),
    kyc,
    selfExcluded,
    poolsToday,
    providerAvailable,
  });

  const open = pool.status === "open";
  const withdrawAllowed =
    open &&
    Date.parse(pool.closes_at) > Date.now() &&
    poolCfg.rg?.["withdraw_before_close"] !== false &&
    !!myParticipation &&
    (myParticipation.status === "pending" || myParticipation.status === "confirmed");

  return {
    poolId: pool.id,
    externalPoolId: pool.external_pool_id,
    provider: pool.provider,
    country: poolCountry,
    currency: pool.currency,
    stakeMinor: pool.stake_minor,
    rakeBps: pool.rake_bps,
    status: pool.status,
    closesAt: pool.closes_at,
    myParticipation,
    eligibility,
    withdrawAllowed,
  };
}

// Vista de dinero para una porra. null RÁPIDO si: sin sesión, invitado, la porra
// no es money_eligible, no hay bolsa, o el país de la bolsa no está vivo.
export async function moneyForPorra(porraId: string, session: Session | null): Promise<MoneyView | null> {
  if (!session || session.is_anonymous) return null;
  const sb = await supabaseServer();
  if (!sb) return null;

  const { data: porra } = await sb
    .from("porras")
    .select("money_eligible")
    .eq("id", porraId)
    .maybeSingle();
  if (!porra || (porra as { money_eligible?: boolean }).money_eligible !== true) return null;

  const { data: poolData } = await sb
    .from("money_pools")
    .select(POOL_FIELDS)
    .eq("porra_id", porraId)
    .maybeSingle();
  const pool = poolData as PoolRow | null;
  if (!pool) return null;

  const cfg = await getMoneyConfig(sb);
  const poolCfg = countryCfg(cfg, pool.country);
  if (!countryLive(poolCfg)) return null;

  const view = await buildView(sb, session, cfg, pool, poolCfg as MoneyCountryCfg);
  // La PÁGINA no monta la sección ante un bloqueo duro (menor, autoexcluido, etc.).
  if (!moneySectionVisible(view.eligibility)) return null;
  return view;
}

// Vista de dinero para una bolsa por id (la usan las rutas de dinero de B4).
// Además de MoneyView, devuelve porraId, porraSlug y optionsCount.
export async function moneyForPool(
  poolId: string,
  session: Session | null,
): Promise<(MoneyView & { porraId: string; porraSlug: string; optionsCount: number }) | null> {
  if (!session || session.is_anonymous) return null;
  const sb = await supabaseServer();
  if (!sb) return null;

  const { data: poolData } = await sb
    .from("money_pools")
    .select(POOL_FIELDS)
    .eq("id", poolId)
    .maybeSingle();
  const pool = poolData as PoolRow | null;
  if (!pool) return null;

  const { data: porra } = await sb
    .from("porras")
    .select("slug, money_eligible")
    .eq("id", pool.porra_id)
    .maybeSingle();
  const porraRow = porra as { slug: string; money_eligible?: boolean } | null;
  if (!porraRow || porraRow.money_eligible !== true) return null;

  const cfg = await getMoneyConfig(sb);
  const poolCfg = countryCfg(cfg, pool.country);
  if (!countryLive(poolCfg)) return null;

  const { count: optCount } = await sb
    .from("porra_options")
    .select("id", { count: "exact", head: true })
    .eq("porra_id", pool.porra_id);

  const view = await buildView(sb, session, cfg, pool, poolCfg as MoneyCountryCfg);
  return { ...view, porraId: pool.porra_id, porraSlug: porraRow.slug, optionsCount: optCount ?? 0 };
}
