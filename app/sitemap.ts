import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE } from "@/lib/share";

export const revalidate = 3600;

// Portada, feed, legales y las porras abiertas (públicas, no plantilla).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fijas: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/feed`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/privacidad`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/terminos`, changeFrequency: "monthly", priority: 0.3 },
  ];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return fijas;
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await sb.from("porras").select("slug, created_at")
      .eq("status", "open").eq("is_template", false).eq("visibility", "public")
      .gt("closes_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(500);
    return [...fijas, ...(data ?? []).map((p) => ({
      url: `${SITE}/p/${p.slug}`, lastModified: p.created_at, changeFrequency: "hourly" as const, priority: 0.7,
    }))];
  } catch { return fijas; }
}
