import { supabaseServer } from "@/lib/supabase/server";
import { editorialBySlug, EDITORIAL } from "@/lib/editorial";

// Feed del home: porras ABIERTAS reales (editoriales + de usuarios), nunca
// plantillas. Vídeo IA desde el catálogo editorial. Orden: destacadas → con
// vídeo → más recientes. Público (RLS: open/resolved legibles por todos).
export type FeedPorra = {
  id: string;
  slug: string;
  title: string;
  source: string;
  closes_at: string;
  options: { id: string; label: string }[];
  video: string | null;
  official: boolean;
  featured: boolean;
};

export async function getFeed(limit = 24): Promise<FeedPorra[]> {
  const sb = await supabaseServer();
  if (!sb) {
    // sin backend: al menos las editoriales locales (con vídeo)
    return EDITORIAL.map((p) => ({
      id: p.id, slug: p.slug, title: p.title, source: p.source, closes_at: p.closes_at,
      options: p.options.map((o) => ({ id: o.id, label: o.label })),
      video: p.video ?? null, official: true, featured: false,
    }));
  }
  const { data } = await sb
    .from("porras")
    .select("id, slug, title, source, closes_at, featured_until, porra_options ( id, idx, label )")
    .eq("status", "open")
    .eq("is_template", false)
    .gt("closes_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  const now = Date.now();
  const rows: FeedPorra[] = (data ?? []).map((p) => {
    const opts = ((p.porra_options ?? []) as { id: string; idx: number; label: string }[])
      .slice().sort((a, b) => a.idx - b.idx).map((o) => ({ id: o.id, label: o.label }));
    return {
      id: p.id, slug: p.slug, title: p.title, source: p.source, closes_at: p.closes_at,
      options: opts,
      video: editorialBySlug(p.slug)?.video ?? null,
      official: p.source === "editorial",
      featured: !!p.featured_until && new Date(p.featured_until).getTime() > now,
    };
  });
  return rows.sort((a, b) =>
    Number(b.featured) - Number(a.featured) ||
    Number(!!b.video) - Number(!!a.video) ||
    0,
  );
}
