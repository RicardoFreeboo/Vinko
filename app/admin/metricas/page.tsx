import { supabaseServer } from "@/lib/supabase/server";
import { GlassCard, MetricCard, Eyebrow } from "@/components/backstage/ui";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Dashboard de KPIs para dirección/inversores (spec §4 + paneles §5). Conteos
// REALES (kpi_counts, admin-gated). Retención/K-factor = "—" hasta que haya
// histórico: honesto, nunca inventado (regla de datos del freeze).
export default async function AdminMetricas() {
  const sb = await supabaseServer();
  let c: Record<string, number> = {};
  if (sb) {
    const { data } = await sb.rpc("kpi_counts");
    c = (data ?? {}) as Record<string, number>;
  }
  const n = (k: string) => String(c[k] ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.kpi.title")}
        </h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.kpi.note")}
        </p>
      </div>

      <div>
        <Eyebrow>{t("admin.kpi.growth")} · {t("admin.kpi.content")}</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard value={n("users")} label={t("admin.kpi.signups")} accent="var(--win)" />
          <MetricCard value={n("pools")} label={t("admin.kpi.pools")} accent="var(--win)" />
          <MetricCard value={n("picks")} label={t("admin.kpi.picks")} accent="var(--win)" />
          <MetricCard value={n("groups")} label={t("admin.kpi.groups")} accent="var(--gold)" />
        </div>
      </div>

      <div>
        <Eyebrow>{t("admin.kpi.retention")} · {t("admin.kpi.virality")}</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard value="—" label={t("admin.kpi.d1")} hint={t("admin.kpi.needdata")} />
          <MetricCard value="—" label={t("admin.kpi.d7")} hint={t("admin.kpi.needdata")} />
          <MetricCard value="—" label={t("admin.kpi.d30")} hint={t("admin.kpi.needdata")} />
          <MetricCard value="—" label={t("admin.kpi.kfactor")} accent="var(--gold)" hint={t("admin.kpi.needdata")} />
        </div>
      </div>

      <div>
        <Eyebrow>{t("admin.kpi.economy")} · {t("admin.kpi.agent")}</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard value={n("points_out")} label={t("admin.kpi.emitted")} accent="var(--gold)" />
          <MetricCard value={n("points_burn")} label={t("admin.kpi.burned")} accent="var(--win)" />
          <MetricCard value={n("ads_shown")} label={t("admin.kpi.adsShown")} accent="var(--win)" />
          <MetricCard value={`${c.ad_revenue_eur ?? 0} €`} label={t("admin.kpi.adRevenue")} accent="var(--gold)"
            hint={t("admin.kpi.adRevenueHint")} />
          <MetricCard value={n("signals")} label={t("admin.kpi.signals")} accent="var(--win)" />
          <MetricCard value={n("buffer_days")} label={t("admin.kpi.buffer")}
            accent={(c.buffer_days ?? 0) < 7 ? "var(--red)" : "var(--win)"} />
        </div>
      </div>

      <GlassCard glow="none">
        <p className="text-[12px] leading-relaxed text-[rgba(244,241,233,0.5)]">{t("admin.kpi.honest")}</p>
      </GlassCard>
    </div>
  );
}
