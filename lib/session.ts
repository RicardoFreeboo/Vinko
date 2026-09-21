import { supabaseServer } from "@/lib/supabase/server";

export type Session = {
  id: string;
  email: string | null;
  handle: string | null;
  points: number | null;
  birth_year: number | null;
  is_anonymous: boolean; // sesión invitada (pick sin registro, spec F-01)
};

// Perfil del usuario autenticado (server). null si no hay sesión o sin backend.
export async function getSession(): Promise<Session | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb
    .from("profiles")
    .select("handle, points, birth_year")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email ?? null,
    handle: data?.handle ?? null,
    points: data?.points ?? null,
    birth_year: data?.birth_year ?? null,
    is_anonymous: !!(user as { is_anonymous?: boolean }).is_anonymous,
  };
}
