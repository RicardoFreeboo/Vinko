import { supabaseServer } from "@/lib/supabase/server";

export type Session = {
  id: string;
  email: string | null;
  handle: string | null;
  points: number | null;
  birth_year: number | null;
  country: string | null; // país declarado (ISO-2). Lo usa la elegibilidad de dinero (M0)
  is_anonymous: boolean; // sesión invitada (pick sin registro, spec F-01)
};

// Perfil del usuario autenticado (server). null si no hay sesión o sin backend.
export async function getSession(): Promise<Session | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  // 0045 añade profiles.country; si aún no está aplicada, se lee lo básico
  // (mismo patrón defensivo que app/bienvenida/page.tsx) para no vaciar la sesión.
  type Row = { handle: string | null; points: number | null; birth_year: number | null; country?: string | null };
  let data: Row | null = null;
  const full = await sb
    .from("profiles")
    .select("handle, points, birth_year, country")
    .eq("id", user.id)
    .maybeSingle();
  if (full.error) {
    const basic = await sb
      .from("profiles")
      .select("handle, points, birth_year")
      .eq("id", user.id)
      .maybeSingle();
    data = basic.data as Row | null;
  } else {
    data = full.data as Row | null;
  }
  return {
    id: user.id,
    email: user.email ?? null,
    handle: data?.handle ?? null,
    points: data?.points ?? null,
    birth_year: data?.birth_year ?? null,
    country: data?.country ?? null,
    is_anonymous: !!(user as { is_anonymous?: boolean }).is_anonymous,
  };
}
