import { EmptyState, Panel } from "@/components/admin/ui";
import { BLACKLIST } from "@/lib/admin";
import { t } from "@/lib/i18n";

// PASO 5a — Moderación ToS (no es «filtro de apuestas»). Cola vacía en día 0.
export default function AdminModeracion() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.mod.title")}</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.mod.how")}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(5,auto)] gap-x-6 gap-y-2 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-[12px]">
        {["snippet", "type", "reason", "status", "action"].map((c) => (
          <span key={c} className="eyebrow text-[10px] whitespace-nowrap">
            {t(`admin.mod.col.${c}`)}
          </span>
        ))}
      </div>
      <EmptyState text={t("admin.mod.empty")} />

      <Panel title={t("admin.mod.blacklist")}>
        <div className="flex flex-wrap gap-2">
          {BLACKLIST.map((w) => (
            <span
              key={w}
              className="mono rounded-full border border-[var(--red)]/40 px-2.5 py-0.5 text-[11px] text-[var(--red)]"
            >
              {w}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
