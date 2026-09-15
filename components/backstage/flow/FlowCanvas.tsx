"use client";
import { useActivityStream } from "./useActivityStream";
import { FlowStatic } from "./FlowStatic";
import { GREEN, GOLD, RED } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

// El grafo unificado (iconos + líneas fluyendo + haces SVG de eventos reales).
// Mismo render en desktop y móvil — es la versión que manda (decisión Ricardo,
// 15-sep). El canvas 3D (FlowScene) queda aparcado, fuera del bundle.
export function FlowCanvas() {
  const { pending, clearPending, rate } = useActivityStream();

  return (
    <div className="relative h-[62vh] min-h-[440px] w-full overflow-hidden rounded-[16px]"
      style={{ background: "rgba(12,21,18,0.5)", border: "1px solid rgba(31,224,122,0.2)" }}>
      <FlowStatic pending={pending} clearPending={clearPending} />

      <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
        <span className="text-lg font-bold" style={{ fontFamily: "var(--font-mono2), monospace", color: GREEN }}>
          {rate}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[rgba(244,241,233,0.5)]">{t("flujo.events")}</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-[10px] uppercase tracking-wide">
        <Legend c={GREEN} label={t("flujo.legend.normal")} />
        <Legend c={GOLD} label={t("flujo.legend.value")} />
        <Legend c={RED} label={t("flujo.legend.alert")} />
      </div>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[rgba(244,241,233,0.6)]">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
      {label}
    </span>
  );
}
