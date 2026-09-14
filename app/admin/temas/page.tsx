import { EmptyState } from "@/components/admin/ui";
import { t } from "@/lib/i18n";

// PASO 5c — Temas editoriales / IA trending. El cron propone; aquí se decide.
// NUNCA publica solo. Sin propuestas en día 0.
export default function AdminTemas() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black tracking-tight">{t("admin.temas.title")}</h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("admin.temas.how")}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(4,auto)] gap-x-6 gap-y-2 overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-[12px]">
        {["title", "options", "source", "status"].map((c) => (
          <span key={c} className="eyebrow text-[10px] whitespace-nowrap">
            {t(`admin.temas.col.${c}`)}
          </span>
        ))}
      </div>
      <EmptyState text={t("admin.temas.empty")} />

      <div className="flex flex-wrap gap-2">
        {["publish", "edit", "discard"].map((a, i) => (
          <span
            key={a}
            className={`mono rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
              i === 0
                ? "border-[var(--win)] text-[var(--win)]"
                : "border-[var(--line)] text-[var(--muted)]"
            }`}
          >
            {t(`admin.temas.${a}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
