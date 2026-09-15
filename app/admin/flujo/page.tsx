import { FlowCanvas } from "@/components/backstage/flow/FlowCanvas";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Sala de control: el grafo de flujo del sistema con haces de eventos reales
// (spec de paneles §3/§4). El canvas 3D vive aislado por ruta (ssr:false).
export default function AdminFlujo() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("flujo.title")}
        </h1>
        <p className="mt-2 max-w-[75ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("flujo.sub")}
        </p>
      </div>
      <FlowCanvas />
    </div>
  );
}
