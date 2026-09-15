import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Vuelta de Google / enlace mágico: canjea el código por sesión y redirige.
// Si el perfil aún no tiene año de nacimiento → pantalla +18 (/bienvenida).
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const sb = await supabaseServer();
  if (!sb || !code) return NextResponse.redirect(`${origin}/login`);

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login`);

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { data } = await sb.from("profiles").select("birth_year").eq("id", user.id).maybeSingle();
    if (!data?.birth_year) {
      return NextResponse.redirect(`${origin}/bienvenida?next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
