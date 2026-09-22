import { supabaseServer } from "@/lib/supabase/server";
import { MoneyTabs } from "@/components/admin/MoneyAdmin";
import { MoneyPoolsAdmin, type PoolsData, type FeedRow, type EditorialPorra, type PoolRow, type AttachCountry } from "@/components/admin/MoneyPoolsAdmin";
import { tMoney as t } from "@/components/admin/MoneyI18n";

export const dynamic = "force-dynamic";

// Bolsas y fuente oficial (M0). Carga la fuente oficial de resultados, las
// porras editoriales abiertas, las bolsas con su recuento de entradas
// confirmadas y los países habilitados para adjuntar. Solo admin (layout).
type RawPool = {
  id: string; porra_id: string; country: string; provider: string; status: PoolRow["status"];
  external_pool_id: string | null; currency: string; stake_minor: number; rake_bps: number; closes_at: string;
};
type RawEditorial = {
  id: string; slug: string; title: string; closes_at: string;
  resolution_source_ref: string | null; money_eligible: boolean;
  porra_options: { id: string }[] | null;
};
type MoneyCfgValue = {
  global?: { rake_bps_default?: number };
  countries?: Record<string, { enabled?: boolean; legal_basis_ref?: string | null; currency?: string | null; stakes_minor?: number[] }>;
};

export default async function AdminMoneyPools() {
  const sb = await supabaseServer();
  const data: PoolsData = { feed: [], editorial: [], pools: [], attachCountries: [], rakeBpsDefault: 500, backend: !!sb };

  if (sb) {
    const [feedRes, editRes, poolsRes, partsRes, cfgRes] = await Promise.all([
      sb.from("results_feed").select("key, provider, label, event_at, options_count, result_option_idx, source_url, resolved_at")
        .order("event_at", { ascending: false }).limit(500),
      sb.from("porras").select("id, slug, title, closes_at, resolution_source_ref, money_eligible, porra_options!porra_options_porra_id_fkey ( id )")
        .eq("source", "editorial").eq("status", "open").eq("visibility", "public").order("closes_at", { ascending: true }).limit(200),
      sb.from("money_pools").select("id, porra_id, country, provider, status, external_pool_id, currency, stake_minor, rake_bps, closes_at")
        .order("created_at", { ascending: false }).limit(300),
      sb.from("money_participations").select("money_pool_id, status").limit(5000),
      sb.from("remote_config").select("value").eq("key", "money").maybeSingle(),
    ]);

    data.feed = (feedRes.data ?? []) as FeedRow[];
    const feedResult = new Map(data.feed.map((f) => [f.key, f.result_option_idx]));

    const poolRows = (poolsRes.data ?? []) as RawPool[];
    const poolPorraIds = [...new Set(poolRows.map((p) => p.porra_id))];
    const poolPorras: Record<string, { slug: string; title: string; resolution_source_ref: string | null }> = {};
    if (poolPorraIds.length) {
      const { data: pp } = await sb.from("porras").select("id, slug, title, resolution_source_ref").in("id", poolPorraIds);
      for (const p of (pp ?? []) as { id: string; slug: string; title: string; resolution_source_ref: string | null }[]) {
        poolPorras[p.id] = { slug: p.slug, title: p.title, resolution_source_ref: p.resolution_source_ref };
      }
    }

    const confirmed = new Map<string, number>();
    for (const pt of (partsRes.data ?? []) as { money_pool_id: string; status: string }[]) {
      if (pt.status === "confirmed") confirmed.set(pt.money_pool_id, (confirmed.get(pt.money_pool_id) ?? 0) + 1);
    }

    data.pools = poolRows.map((p): PoolRow => {
      const pp = poolPorras[p.porra_id];
      const rsr = pp?.resolution_source_ref ?? null;
      return {
        id: p.id, porra_id: p.porra_id, porra_slug: pp?.slug ?? "", porra_title: pp?.title ?? p.porra_id.slice(0, 8),
        country: p.country, provider: p.provider, status: p.status, external_pool_id: p.external_pool_id,
        currency: p.currency, stake_minor: p.stake_minor, rake_bps: p.rake_bps, closes_at: p.closes_at,
        confirmed: confirmed.get(p.id) ?? 0,
        result_option_idx: rsr ? (feedResult.get(rsr) ?? null) : null,
      };
    });

    const poolPorraSet = new Set(poolPorraIds);
    data.editorial = ((editRes.data ?? []) as unknown as RawEditorial[]).map((p): EditorialPorra => ({
      id: p.id, slug: p.slug, title: p.title, closes_at: p.closes_at,
      options_count: Array.isArray(p.porra_options) ? p.porra_options.length : 0,
      resolution_source_ref: p.resolution_source_ref ?? null,
      money_eligible: !!p.money_eligible,
      has_pool: poolPorraSet.has(p.id),
    }));

    const money = (cfgRes.data?.value ?? {}) as MoneyCfgValue;
    data.rakeBpsDefault = money.global?.rake_bps_default ?? 500;
    const countries = money.countries ?? {};
    data.attachCountries = Object.keys(countries)
      .filter((iso) => countries[iso]?.enabled && !!countries[iso]?.legal_basis_ref).sort()
      .map((iso): AttachCountry => ({
        iso, currency: countries[iso]?.currency ?? null,
        stakes_minor: Array.isArray(countries[iso]?.stakes_minor) ? (countries[iso]!.stakes_minor as number[]) : [],
      }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("adminMoney.title")}
        </h1>
      </div>
      <MoneyTabs />
      <MoneyPoolsAdmin initial={data} />
    </div>
  );
}
