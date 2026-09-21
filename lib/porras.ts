// Acceso a porras para SSR. Si Supabase está configurado (env), lee de la base
// (RLS: público solo open/resolved no-taken_down); si no, o si el slug no
// existe aún, cae a las plantillas locales (mismo contenido que la seed 0004).
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { templateBySlug } from "@/lib/templates";
import { editorialBySlug } from "@/lib/editorial";

export type PorraOption = { id: string; idx: number; label: string };
export type Porra = {
  id: string;
  slug: string;
  title: string;
  is_template: boolean;
  source: "user" | "template" | "editorial";
  status: "open" | "resolved" | "disputed" | "taken_down"; // disputed = reparto congelado (0042)
  closes_at: string;
  winning_option_id: string | null;
  options: PorraOption[];
  category?: string | null;
  video?: string | null; // /v/<slug>.webm si la IA ya lo generó; si no, placeholder
  official?: boolean; // creada por el perfil oficial de Vinko (source=editorial)
  // Roles de la resolución (se comparan en servidor con la sesión del visitante).
  created_by?: string | null;
  arbiter_id?: string | null;
  arbiter_status?: "creator" | "invited" | "accepted" | "declined";
  visibility?: "public" | "private";
};

const SELECT =
  "id, slug, title, is_template, source, status, closes_at, winning_option_id, media_url, media_kind, category, " +
  "created_by, arbiter_id, arbiter_status, visibility, porra_options!porra_options_porra_id_fkey ( id, idx, label )";

type Row = Omit<Porra, "options" | "video" | "official"> & {
  media_url: string | null;
  media_kind: string | null;
  porra_options: PorraOption[] | null;
};

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

function shape(data: Row, slug: string): Porra {
  const options = (data.porra_options ?? []).slice().sort((a, b) => a.idx - b.idx);
  // Vídeo: primero el subido a Storage (media_url), luego el catálogo local
  // (seeds). Las editoriales viven en DB (jugables) y su marca oficial sale
  // de source=editorial.
  const local = editorialBySlug(slug);
  return {
    ...data,
    options,
    // media_url también guarda fotos/notas de voz: solo es vídeo si no es imagen ni audio
    video: (data.media_kind !== "image" && data.media_kind !== "audio" ? data.media_url : null)
      ?? local?.video ?? null,
    official: data.source === "editorial",
  };
}

// cache(): generateMetadata, la página y la imagen OG comparten UNA lectura por
// petición en vez de tres.
export const getPorraBySlug = cache(async (slug: string): Promise<Porra | null> => {
  const client = supa();
  if (client) {
    const { data } = await client.from("porras").select(SELECT).eq("slug", slug).maybeSingle();
    if (data) return shape(data as unknown as Row, slug);
    // El anon no ve las privadas ni las anuladas: reintento con la sesión del
    // visitante (cookies) para que RLS decida — creador, compañeros de grupo,
    // admin. Fuera de una petición (build, OG sin cookies) no hay sesión.
    try {
      const sb = await supabaseServer();
      if (sb) {
        const { data: mine } = await sb.from("porras").select(SELECT).eq("slug", slug).maybeSingle();
        if (mine) return shape(mine as unknown as Row, slug);
      }
    } catch { /* sin contexto de petición: se sigue con el fallback estático */ }
  }
  // Fallback SSR sin backend: plantillas de ejemplo y porras editoriales
  // (creadas por el perfil oficial de Vinko) — sirven /p/[slug] y su OG.
  return templateBySlug(slug) ?? editorialBySlug(slug);
});

// Columnas que llegan con migraciones posteriores: resolved_at (0033),
// resolution_criteria / resolves_at (0041), disputed_at / dispute_outcome
// (0042). Se piden en una lectura aparte, de más a menos, para que /p nunca
// se rompa si alguna migración aún no está aplicada.
export type PorraExtras = {
  resolved_at: string | null;
  resolution_criteria: string | null;
  resolves_at: string | null;
  disputed_at: string | null;
  dispute_outcome: "upheld" | "reversed" | null;
};
const EMPTY_EXTRAS: PorraExtras = {
  resolved_at: null, resolution_criteria: null, resolves_at: null, disputed_at: null, dispute_outcome: null,
};
const EXTRA_SELECTS = [
  "resolved_at, resolution_criteria, resolves_at, disputed_at, dispute_outcome",
  "resolved_at, disputed_at, dispute_outcome",
  "resolved_at, resolution_criteria, resolves_at",
  "resolved_at",
];

export const getPorraExtras = cache(async (sb: SupabaseClient | null, id: string): Promise<PorraExtras> => {
  const client = sb ?? supa();
  if (!client) return EMPTY_EXTRAS;
  for (const sel of EXTRA_SELECTS) {
    const { data, error } = await client.from("porras").select(sel).eq("id", id).maybeSingle();
    if (error) continue; // columna ausente → siguiente combinación
    return { ...EMPTY_EXTRAS, ...((data ?? {}) as Partial<PorraExtras>) };
  }
  return EMPTY_EXTRAS;
});
