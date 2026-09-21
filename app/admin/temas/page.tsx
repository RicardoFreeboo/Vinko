import { supabaseServer } from "@/lib/supabase/server";
import { TemasLive, type Proposal } from "@/components/admin/TemasLive";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const BASE = "id, title, options, category, resolution_criteria, closes_at, score, flags, kind, status, created_at, source_url";
// Columnas de 0032 (titular origen, marca de edición). Si la migración aún no
// está aplicada, se cae a las columnas base en vez de dejar la cola vacía.
const FULL = `${BASE}, source_title, updated_at`;

// Cola del agente de tendencias. Carga las PENDIENTES y también las PUBLICADAS
// de los últimos 7 días, para que se vea el trabajo hecho.
export default async function AdminTemas() {
  const sb = await supabaseServer();
  let queue: Proposal[] = [];
  if (sb) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const cola = (cols: string) => sb.from("topic_proposals").select(cols)
      .in("status", ["pending_review", "published"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(150);
    const [res, { data: porras }] = await Promise.all([
      cola(FULL),
      // Para enlazar cada publicada con su porra (se casa por título).
      sb.from("porras").select("slug, title").eq("source", "editorial")
        .gte("created_at", new Date(Date.now() - 8 * 86400000).toISOString()).limit(400),
    ]);
    const data = res.error ? (await cola(BASE)).data : res.data;
    const slugPorTitulo = new Map((porras ?? []).map((p) => [p.title, p.slug]));
    queue = ((data ?? []) as unknown as Proposal[]).map((p) => ({
      ...p,
      options: Array.isArray(p.options) ? p.options : [],
      flags: Array.isArray(p.flags) ? p.flags : [],
      slug: p.status === "published" ? slugPorTitulo.get(String(p.title).slice(0, 120)) ?? null : null,
    }));
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
      <TemasLive initial={queue} />
    </div>
  );
}
