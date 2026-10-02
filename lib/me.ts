import type { SupabaseClient } from "@supabase/supabase-js";

// SEC-01 — el propio perfil, completo, vía la RPC me() (security definer).
// Las columnas privadas de profiles (birth_year, country, pay_handle, lang,
// intereses, safer_play, referred_by, role…) ya no tienen select directo: solo
// se leen así. Si la migración 0055 aún no está aplicada en la base, la RPC no
// existe (PGRST202) y se cae al select directo de siempre, que en ese caso
// todavía funciona. Así el deploy no depende del orden código/migración.
export type Me = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  points: number | null;
  xp: number | null;
  marcador_total: number | null;
  division: string | null;
  title: string | null;
  birth_year: number | null;
  country: string | null;
  lang: string | null;
  role: string | null;
  interests: string[] | null;
  onboarded_at: string | null;
  pay_handle: string | null;
  club_active: boolean | null;
  safer_play: Record<string, unknown> | null;
  streak_days: number | null;
  streak_best: number | null;
  streak_last: string | null;
  streak_shields: number | null;
  streak_broken_days: number | null;
  streak_recover_until: string | null;
  daily_bonus_last: string | null;
  daily_bonus_step: number | null;
  referred_by: string | null;
  created_at: string | null;
} & Record<string, unknown>;

const MISSING = new Set(["PGRST202", "42883"]);

export async function fetchMe(sb: SupabaseClient): Promise<Me | null> {
  try {
    const { data, error } = await sb.rpc("me");
    if (!error) return (data as Me | null) ?? null;
    if (!MISSING.has(error.code ?? "") && !/function .*me/i.test(error.message ?? "")) return null;
  } catch { /* red: probar el fallback */ }
  // Fallback pre-0055: el select abierto de siempre.
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Me | null) ?? null;
}
