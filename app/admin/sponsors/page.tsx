import { supabaseServer } from "@/lib/supabase/server";
import { SponsorsAdmin, type Sponsor, type Campaign, type LeagueOpt, type PorraInfo } from "@/components/admin/SponsorsAdmin";
import { tSponsors as t } from "@/components/SponsorBadge";

export const dynamic = "force-dynamic";

const CAMPAIGN_COLS = "*, sponsor:sponsors(id, name, logo_url, url), prizes:sponsor_prizes(*, awards:prize_awards(count))";
const LEAGUE_COLS = "id, week_start, division, seq, closed";

// Patrocinios (M-01/M-02): patrocinadores, campañas con sus premios y el
// enlace del informe de marca. Solo admin (lo comprueba el layout). Las
// porras y grupos de liga que son objetivo de alguna campaña se cargan aquí
// para que el cliente pinte títulos y semanas sin consultar nada.
export default async function AdminSponsors() {
  const sb = await supabaseServer();
  let sponsors: Sponsor[] = [];
  let campaigns: Campaign[] = [];
  let leagues: LeagueOpt[] = [];
  const porras: Record<string, PorraInfo> = {};
  if (sb) {
    const [spRes, csRes, lgRes] = await Promise.all([
      sb.from("sponsors").select("*").order("name"),
      sb.from("sponsorships").select(CAMPAIGN_COLS).order("starts_at", { ascending: false }).limit(200),
      sb.from("league_groups").select(LEAGUE_COLS)
        .order("week_start", { ascending: false }).order("division").order("seq").limit(80),
    ]);
    sponsors = (spRes.data ?? []) as Sponsor[];
    campaigns = ((csRes.data ?? []) as unknown as Campaign[]).map((c) => ({
      ...c, prizes: Array.isArray(c.prizes) ? c.prizes : [],
    }));
    leagues = (lgRes.data ?? []) as LeagueOpt[];

    const porraIds = [...new Set(campaigns.filter((c) => c.target_type === "porra" && c.target_id).map((c) => c.target_id as string))];
    if (porraIds.length) {
      const { data } = await sb.from("porras").select("id, slug, title, status").in("id", porraIds);
      for (const p of (data ?? []) as PorraInfo[]) porras[p.id] = p;
    }
    // grupos de liga antiguos que ya no entran en los 80 últimos
    const missing = [...new Set(campaigns.filter((c) => c.target_type === "league" && c.target_id).map((c) => c.target_id as string))]
      .filter((id) => !leagues.some((l) => l.id === id));
    if (missing.length) {
      const { data } = await sb.from("league_groups").select(LEAGUE_COLS).in("id", missing);
      leagues = [...leagues, ...((data ?? []) as LeagueOpt[])];
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.sponsors.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.sponsors.how")}
        </p>
      </div>
      <SponsorsAdmin initial={{ sponsors, campaigns, leagues, porras }} />
    </div>
  );
}
