import { supabaseServer } from "@/lib/supabase/server";
import { TemasLive } from "@/components/admin/TemasLive";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Cola del agente de tendencias (spec agente + ajustes C/D). Lee las candidatas
// REALES de topic_proposals; el humano aprueba/tira. El botón "Buscar porras
// nuevas" y el buscador de tema disparan trend-generate (con cooldown). El cron
// NUNCA publica solo. Publicar → porra source=editorial (fuera de K-factor).
export default async function AdminTemas() {
  const sb = await supabaseServer();
  let queue: unknown[] = [];
  if (sb) {
    const { data } = await sb
      .from("topic_proposals")
      .select("id, title, options, category, resolution_criteria, closes_at, score, flags, kind, status")
      .eq("status", "pending_review")
      .order("created_at", { ascending: false })
      .limit(40);
    queue = data ?? [];
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.temas.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.temas.how")}
        </p>
      </div>
      <TemasLive initial={queue as never} />
    </div>
  );
}
