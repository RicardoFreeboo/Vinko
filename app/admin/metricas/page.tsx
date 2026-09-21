import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { GlassCard } from "@/components/backstage/ui";
import { loadMetrics } from "@/components/admin/MetricasData";
import { Traccion, Retencion, Embudo, Viralidad, Economia, Definiciones } from "@/components/admin/MetricasSections";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Métricas para dirección e inversores: tracción, retención por cohorte,
// embudo, viralidad y economía de Vinkos desde las RPC kpi_* (0033). Todo
// real y auditable: si n=0 se ve 0; si falta la migración, se dice.
// ?sinadmin=1 deja fuera a las cuentas admin (el equipo).
export default async function AdminMetricas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const excl = sp.sinadmin === "1";
  const sb = await supabaseServer();
  const m = await loadMetrics(sb, excl);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
            {t("admin.kpi.title")}
          </h1>
          <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
            {t("admin.mx.sub")}
          </p>
        </div>
        <Link
          href={excl ? "/admin/metricas" : "/admin/metricas?sinadmin=1"}
          style={{ fontFamily: "var(--font-mono2), monospace" }}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] ${
            excl ? "border-[var(--gold)] text-[var(--gold)]" : "border-[rgba(31,224,122,0.2)] text-[rgba(244,241,233,0.6)]"
          }`}
        >
          {t(excl ? "admin.mx.exclOff" : "admin.mx.exclOn")}
        </Link>
      </div>

      {excl && <p className="text-[12px] text-[var(--gold)]">{t("admin.mx.exclNote")}</p>}

      {m.missing && (
        <GlassCard glow="gold">
          <p className="text-[13px] leading-relaxed text-[var(--gold)]">{t("admin.mx.pending")}</p>
        </GlassCard>
      )}

      <Traccion m={m} />
      {m.retention && <Retencion r={m.retention} />}
      {m.funnel && <Embudo f={m.funnel} />}
      {m.kfactor && <Viralidad k={m.kfactor} />}
      {m.economy && <Economia e={m.economy} />}
      <Definiciones />
    </div>
  );
}
