// Acceso a porras para SSR. Si Supabase está configurado (env), lee de la base
// (RLS: público solo open/resolved no-taken_down); si no, o si el slug no
// existe aún, cae a las plantillas locales (mismo contenido que la seed 0004).
import { createClient } from "@supabase/supabase-js";
import { templateBySlug } from "@/lib/templates";
import { editorialBySlug } from "@/lib/editorial";

export type PorraOption = { id: string; idx: number; label: string };
export type Porra = {
  id: string;
  slug: string;
  title: string;
  is_template: boolean;
  source: "user" | "template" | "editorial";
  status: "open" | "resolved" | "taken_down";
  closes_at: string;
  winning_option_id: string | null;
  options: PorraOption[];
  video?: string | null; // /v/<slug>.webm si la IA ya lo generó; si no, placeholder
  official?: boolean; // creada por el perfil oficial de Vinko (source=editorial)
};

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false } });
}

export async function getPorraBySlug(slug: string): Promise<Porra | null> {
  const client = supa();
  if (client) {
    const { data } = await client
      .from("porras")
      .select(
        "id, slug, title, is_template, source, status, closes_at, winning_option_id, porra_options!porra_options_porra_id_fkey ( id, idx, label )",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      const options = (data.porra_options ?? [])
        .slice()
        .sort((a: PorraOption, b: PorraOption) => a.idx - b.idx);
      // Las editoriales viven en DB (jugables) pero el vídeo IA y la marca
      // oficial vienen del catálogo local.
      const local = editorialBySlug(slug);
      return {
        ...data,
        options,
        video: local?.video ?? null,
        official: data.source === "editorial",
      } as Porra;
    }
  }
  // Fallback SSR sin backend: plantillas de ejemplo y porras editoriales
  // (creadas por el perfil oficial de Vinko) — sirven /p/[slug] y su OG.
  return templateBySlug(slug) ?? editorialBySlug(slug);
}
