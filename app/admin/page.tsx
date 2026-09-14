import Link from "next/link";
import { Panel, Tile } from "@/components/admin/ui";
import { FIVE_METRICS } from "@/lib/admin";
import { t } from "@/lib/i18n";

const M_ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)"];

const PANELS = [
  { href: "/admin/metricas", key: "admin.nav.metricas" },
  { href: "/admin/moderacion", key: "admin.nav.moderacion" },
  { href: "/admin/temas", key: "admin.nav.temas" },
  { href: "/admin/health", key: "admin.nav.health" },
  { href: "/admin/live", key: "admin.nav.live" },
];

export default function AdminHub() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] leading-relaxed text-[var(--muted)]">{t("admin.day0")}</p>

      <Panel title={t("admin.hub.mando")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {FIVE_METRICS.map((m, i) => (
            <Tile
              key={m.key}
              value={m.value}
              label={t(`admin.m.${m.key}`)}
              def={t(`admin.m.${m.key}.def`)}
              accent={M_ACCENT[i]}
            />
          ))}
        </div>
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
