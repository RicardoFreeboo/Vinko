import { supabaseServer } from "@/lib/supabase/server";
import { fetchMe } from "@/lib/me";

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
// SEC-01: birth_year y country ya no son columnas públicas; se leen del propio
// perfil vía me() (con fallback al select directo mientras 0055 no esté aplicada).
export async function getSession(): Promise<Session | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const me = await fetchMe(sb);
  return {
    id: user.id,
    email: user.email ?? null,
    handle: me?.handle ?? null,
    points: me?.points ?? null,
    birth_year: me?.birth_year ?? null,
    country: me?.country ?? null,
    is_anonymous: !!(user as { is_anonymous?: boolean }).is_anonymous,
  };
}

// FX-02 — fuera de /p, una sesión ANÓNIMA (invitado que hizo un pick) no es una
// cuenta: las pantallas de la app la tratan como "sin sesión" (CTA de entrar /
// terminar la cuenta) en vez de fallar con "Prueba otra vez".
export async function getMemberSession(): Promise<Session | null> {
  const s = await getSession();
  return s && !s.is_anonymous ? s : null;
}
