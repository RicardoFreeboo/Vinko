import { supabaseServer } from "@/lib/supabase/server";
import { editorialBySlug, EDITORIAL } from "@/lib/editorial";
import { coverTheme } from "@/lib/cover";

// Feed del home: porras ABIERTAS reales (editoriales + de usuarios), nunca
// plantillas. Vídeo: primero el subido a Storage, luego el catálogo local.
// Público (RLS: open/resolved legibles por todos).
export type FeedPorra = {
  id: string;
  slug: string;
  title: string;
  source: string;
  closes_at: string;
  options: { id: string; label: string }[];
  video: string | null;
  category: string | null;
  official: boolean;
  featured: boolean;
};

// Cuántas porras abiertas se leen para ORDENAR antes de recortar. El recorte va
// DESPUÉS de ordenar: antes se pedían a SQL las 24 más recientes y luego se
// subían las de vídeo, así que en cuanto el agente publicó 24 porras sin vídeo
// todas las que sí tenían quedaron fuera del feed (0 vídeos, sin historias).
const POOL = 300;

// Evita dos porras seguidas del mismo tema (p. ej. cinco de Alonso en fila).
// `prev` = tema de la última ya colocada, para no repetir en la frontera entre
// grupos. Para en `max`: del pool de 300 solo se enseña la cabeza.
function variado(list: FeedPorra[], prev: string, max: number): FeedPorra[] {
  const rest = list.map((p) => ({ p, key: coverTheme(p.category, p.title).key }));
  const out: FeedPorra[] = [];
  while (rest.length && out.length < max) {
    let k = rest.findIndex((r) => r.key !== prev);
    if (k < 0) k = 0;
    const [r] = rest.splice(k, 1);
    out.push(r.p);
    prev = r.key;
  }
  return out;
}
const temaDe = (list: FeedPorra[]) => {
  const last = list[list.length - 1];
  return last ? coverTheme(last.category, last.title).key : "";
};

export async function getFeed(limit = 30): Promise<FeedPorra[]> {
  const sb = await supabaseServer();
  if (!sb) {
    // sin backend: al menos las editoriales locales (con vídeo)
    return EDITORIAL.map((p) => ({
      id: p.id, slug: p.slug, title: p.title, source: p.source, closes_at: p.closes_at,
      options: p.options.map((o) => ({ id: o.id, label: o.label })),
      video: p.video ?? null, category: null, official: true, featured: false,
    }));
  }
  const { data } = await sb
    .from("porras")
    .select("id, slug, title, source, closes_at, featured_until, media_url, media_kind, category, porra_options!porra_options_porra_id_fkey ( id, idx, label )")
    .eq("status", "open")
    .eq("is_template", false)
    .gt("closes_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(POOL);

  const now = Date.now();
  // `rows` sale ya de más reciente a más antigua
  const rows: FeedPorra[] = (data ?? []).map((p) => {
    const opts = ((p.porra_options ?? []) as { id: string; idx: number; label: string }[])
      .slice().sort((a, b) => a.idx - b.idx).map((o) => ({ id: o.id, label: o.label }));
    return {
      id: p.id, slug: p.slug, title: p.title, source: p.source, closes_at: p.closes_at,
      options: opts,
      // media_url también guarda fotos y notas de voz subidas desde /nueva: solo
      // cuenta como vídeo si no es imagen ni audio
      video: (p.media_kind !== "image" && p.media_kind !== "audio" ? (p.media_url as string | null) : null)
        ?? editorialBySlug(p.slug)?.video ?? null,
      category: (p as { category?: string | null }).category ?? null,
      official: p.source === "editorial",
      featured: !!p.featured_until && new Date(p.featured_until).getTime() > now,
    };
  });
  // destacadas → con vídeo → sin vídeo; dentro de cada grupo, recientes primero
  // y variando el tema
  const feat = rows.filter((p) => p.featured).slice(0, limit);
  const vid = variado(rows.filter((p) => !p.featured && p.video), temaDe(feat), limit - feat.length);
  const sin = variado(rows.filter((p) => !p.featured && !p.video), temaDe([...feat, ...vid]), limit - feat.length - vid.length);
  return [...feat, ...vid, ...sin];
}
