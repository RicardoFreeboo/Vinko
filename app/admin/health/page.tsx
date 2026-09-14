import { CopyPromptButton } from "@/components/admin/CopyPromptButton";
import { StatusChip } from "@/components/admin/ui";
import { healthChecks, type Tone } from "@/lib/admin";
import { t } from "@/lib/i18n";

// PASO 5b — Estado del sistema. Honesto: SIN CONFIGURAR donde no hay variables
// de entorno; OK donde es trivialmente cierto (el sitio sirve, la ruta OG existe).
const TONE_LABEL: Record<Tone, string> = {
  ok: "admin.health.ok",
  warn: "admin.health.warn",
  unset: "admin.health.unset",
};

export default function AdminHealth() {
  const checks = healthChecks();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight">{t("admin.health.title")}</h1>
        <CopyPromptButton labelCopy={t("admin.health.copy")} labelCopied={t("admin.health.copied")} />
      </div>

      <div className="flex flex-col gap-2">
        {checks.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3"
          >
            <span className="mono text-[13px] text-[var(--cream)]">{t(c.key)}</span>
            <StatusChip tone={c.tone} label={t(TONE_LABEL[c.tone])} />
          </div>
        ))}
      </div>
    </div>
  );
}
