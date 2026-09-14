import { EmptyState } from "@/components/admin/ui";
import { t } from "@/lib/i18n";

// PASO 5d — Feed LIVE de actividad real del loop (is_seed=false). Plantillas y
// editorial fuera. Día 0: "Nadie ahora." — no se inventan filas.
export default function AdminLive() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.live.title")}</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.live.sub")}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(4,auto)] gap-x-6 gap-y-2 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-[12px]">
        {["time", "event", "who", "porra"].map((c) => (
          <span key={c} className="eyebrow text-[10px] whitespace-nowrap">
            {t(`admin.live.col.${c}`)}
          </span>
        ))}
      </div>
      <EmptyState text={t("admin.live.empty")} />
    </div>
  );
}
