"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useActivityStream } from "./useActivityStream";
import { FlowStatic, webglAvailable } from "./FlowStatic";
import { GREEN, GOLD, RED } from "@/lib/backstage/graph";
import { t } from "@/lib/i18n";

// El canvas 3D se carga SOLO en el cliente y SOLO en esta ruta (ssr:false).
// Así Three.js queda fuera del bundle compartido y del juego móvil (§0/§7).
const FlowScene = dynamic(() => import("./FlowScene"), { ssr: false });

export function FlowCanvas() {
  const { pending, clearPending, rate, ready, reducedMotion } = useActivityStream();
  // Por defecto estático (SSR-safe); si el dispositivo puede, subimos a 3D.
  const [use3D, setUse3D] = useState(false);

  useEffect(() => {
    const isMobile = window.matchMedia?.("(max-width: 768px)").matches;
    setUse3D(!reducedMotion && !isMobile && webglAvailable());
  }, [reducedMotion]);

  return (
    <div className="relative h-[62vh] min-h-[420px] w-full overflow-hidden rounded-[16px]"
      style={{ background: "rgba(12,21,18,0.5)", border: "1px solid rgba(31,224,122,0.2)" }}>
      {use3D
        ? <FlowScene pending={pending} clearPending={clearPending} reduced={false}
            onContextLost={() => setUse3D(false)} />
        : <div className="h-full w-full p-4"><FlowStatic /></div>}

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
      {use3D && ready && rate === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-[54%] text-center text-[11px] text-[rgba(244,241,233,0.4)]">
          {t("flujo.idle")}
        </div>
      )}
      {!use3D && (
        <div className="pointer-events-none absolute right-4 top-3 text-[10px] text-[rgba(244,241,233,0.45)]">
          {t("flujo.reduced")}
        </div>
      )}
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
