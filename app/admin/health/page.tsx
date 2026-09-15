import { supabaseServer } from "@/lib/supabase/server";
import { CopyPromptButton } from "@/components/admin/CopyPromptButton";
import { GlassCard, Chip } from "@/components/backstage/ui";
import { healthChecks, type Tone } from "@/lib/admin";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Estado del sistema — REAL: cron y Anthropic desde la BD (system_health),
// Supabase/PostHog por env, Sentry activo (DSN inline), Vercel/OG si renderiza.
const TONE_LABEL: Record<Tone, string> = { ok: "admin.health.ok", warn: "admin.health.warn", unset: "admin.health.unset" };
const TONE_CHIP: Record<Tone, "win" | "gold" | "muted"> = { ok: "win", warn: "gold", unset: "muted" };

export default async function AdminHealth() {
  const sb = await supabaseServer();
  let h: { cron_jobs?: number; anthropic?: boolean; buffer_days?: number } = {};
  if (sb) {
    const { data } = await sb.rpc("system_health");
    h = (data ?? {}) as typeof h;
  }
  const checks = healthChecks(h);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.health.title")}
        </h1>
        <CopyPromptButton labelCopy={t("admin.health.copy")} labelCopied={t("admin.health.copied")} />
      </div>
      <div className="flex flex-col gap-2">
        {checks.map((c) => (
          <GlassCard key={c.key} glow={c.tone === "ok" ? "win" : "none"} className="!py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--cream)]" style={{ fontFamily: "var(--font-mono2), monospace" }}>{t(c.key)}</span>
              <Chip tone={TONE_CHIP[c.tone]}>{t(TONE_LABEL[c.tone])}</Chip>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
