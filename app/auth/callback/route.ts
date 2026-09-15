import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Vuelta de Google / enlace mágico. Soporta los dos formatos de enlace:
//  · PKCE (?code=…) → exchangeCodeForSession
//  · token_hash (?token_hash=…&type=…) → verifyOtp
// Si el perfil aún no tiene año de nacimiento → pantalla +18 (/bienvenida).
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/hoy";

  const sb = await supabaseServer();
  if (!sb) return NextResponse.redirect(`${origin}/login`);

  let okAuth = false;
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    okAuth = !error;
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    okAuth = !error;
  }
  if (!okAuth) return NextResponse.redirect(`${origin}/login`);

  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { data } = await sb.from("profiles").select("birth_year").eq("id", user.id).maybeSingle();
    if (!data?.birth_year) {
      return NextResponse.redirect(`${origin}/bienvenida?next=${encodeURIComponent(next)}`);
    }
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/hoy"}`);
}
