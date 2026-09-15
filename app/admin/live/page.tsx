import { LiveFeed } from "@/components/admin/LiveFeed";
import { t } from "@/lib/i18n";

// PASO 5d — Feed LIVE de actividad real del loop. Lee picks/porras/recompensas
// de personas reales desde la base (RPC admin_live_feed) y refresca cada 10 s.
// Antes esto era una maqueta estática que SIEMPRE decía "Nadie ahora.".
export const dynamic = "force-dynamic";

export default function AdminLive() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.live.title")}</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.live.sub")}
        </p>
      </div>
      <LiveFeed />
    </div>
  );
}
