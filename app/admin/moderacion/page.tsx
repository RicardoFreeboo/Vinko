import { supabaseServer } from "@/lib/supabase/server";
import { GlassCard, Eyebrow, Chip } from "@/components/backstage/ui";
import { MODERATION_CATEGORIES } from "@/lib/admin";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Moderación ToS + SEGURIDAD de contenido (+18, landings públicas). La cola es
// REAL (moderation_queue). El matcher vigila contenido ilegal/dañino por
// categorías — violencia, menores, sexual, drogas, ilegal, odio — y dispara
// revisión humana. (El léxico de marca/apuestas es otro test aparte: L5 en CI.)
export default async function AdminModeracion() {
  const sb = await supabaseServer();
  let queue: { id: string; target_type: string; reason: string; snippet: string | null; status: string }[] = [];
  if (sb) {
    const { data } = await sb.from("moderation_queue")
      .select("id, target_type, reason, snippet, status")
      .eq("status", "pending").order("created_at", { ascending: false }).limit(50);
    queue = data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.mod.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.mod.how")}
        </p>
      </div>

      {queue.length === 0 ? (
        <GlassCard glow="none">
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.mod.empty")}</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {queue.map((q) => (
            <GlassCard key={q.id} glow="gold">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[var(--cream)]">{q.snippet ?? "—"}</div>
                  <div className="mt-1 flex gap-1.5">
                    <Chip tone="muted">{q.target_type}</Chip>
                    <Chip tone="red">{q.reason}</Chip>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <div>
        <Eyebrow>{t("admin.mod.watch")}</Eyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {MODERATION_CATEGORIES.map((c) => (
            <GlassCard key={c.key} glow="none">
              <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--red)]"
                style={{ fontFamily: "var(--font-mono2), monospace" }}>
                {t(`admin.mod.cat.${c.key}`)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.terms.map((w) => (
                  <span key={w}
                    className="rounded-full border border-[rgba(255,90,90,0.35)] px-2 py-0.5 text-[11px] text-[rgba(244,241,233,0.7)]"
                    style={{ fontFamily: "var(--font-mono2), monospace" }}>
                    {w}
                  </span>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[rgba(244,241,233,0.4)]">{t("admin.mod.note")}</p>
      </div>
    </div>
  );
}
