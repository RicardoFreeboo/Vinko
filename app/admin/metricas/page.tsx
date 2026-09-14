import { Panel, Row } from "@/components/admin/ui";
import { KPI_BLOCKS } from "@/lib/admin";
import { t } from "@/lib/i18n";

// Dashboard de KPIs para dirección e inversores (spec §4). Día 0: 0/—, sin
// inventar. La conversión a afiliado se mide en pasivo (regla de oro 6).
export default function AdminMetricas() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.kpi.title")}</h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.kpi.note")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KPI_BLOCKS.map((b) => (
          <Panel key={b.title} title={t(b.title)}>
            <div>
              {b.rows.map(([label, value]) => (
                <Row key={label} label={t(label)} value={value} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
