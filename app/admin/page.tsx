import Link from "next/link";
import { Panel } from "@/components/admin/ui";
import { MandoTiles } from "@/components/admin/MandoTiles";
import { KpiChat } from "@/components/admin/KpiChat";
import { loadMando } from "@/components/admin/MetricasData";
import { supabaseServer } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PANELS = [
  { href: "/admin/metricas", key: "admin.nav.metricas" },
  { href: "/admin/moderacion", key: "admin.nav.moderacion" },
  { href: "/admin/temas", key: "admin.nav.temas" },
  { href: "/admin/porras", key: "admin.nav.porras" },
  { href: "/admin/catalogo", key: "admin.nav.catalogo" },
  { href: "/admin/sponsors", key: "admin.nav.sponsors" },
  { href: "/admin/health", key: "admin.nav.health" },
  { href: "/admin/live", key: "admin.nav.live" },
];

// Resumen: las 5 métricas norte salen de la base (kpi_funnel, kpi_kfactor de
// 0033). Sin la migración, los tiles dicen "—" y la nota lo explica.
export default async function AdminHub() {
  const sb = await supabaseServer();
  const { funnel, kfactor } = await loadMando(sb);
  const pending = !funnel || !kfactor;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        {t(pending ? "admin.mando.pending" : "admin.mando.note")}
      </p>

      {/* Chat con el panel: cómo va todo, fallos y recomendaciones con datos reales */}
      <KpiChat />

      <Panel
        title={t("admin.hub.mando")}
        aside={<Link href="/admin/metricas" className="mono text-xs text-[var(--win)]">{t("admin.nav.metricas")} →</Link>}
      >
        <MandoTiles funnel={funnel} kfactor={kfactor} />
      </Panel>

      <Panel title={t("admin.hub.panels")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PANELS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] px-4 py-4 text-[15px] font-bold text-[var(--cream)]"
            >
              {t(p.key)}
              <span className="mono text-xs text-[var(--win)]">{t("admin.hub.open")}</span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
