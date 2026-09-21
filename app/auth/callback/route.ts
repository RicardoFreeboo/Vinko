import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Vuelta de Google / enlace mágico. Soporta los dos formatos de enlace:
//  · PKCE (?code=…) → exchangeCodeForSession
//  · token_hash (?token_hash=…&type=…) → verifyOtp
// Si el perfil aún no tiene año de nacimiento → pantalla +18 (/bienvenida).
//
// Invitaciones: si hay cookie vinko_ref (la deja RefCatcher al abrir un
// enlace con ?ref=<handle>) se llama UNA vez a claim_referral con la sesión
// del usuario y se borra la cookie. Solo apunta referred_by: los Vinkos se
// pagan a los dos en el primer pick del invitado (0030, pay_referral).
//
// Analítica: se deja vinko_auth_evt=sign_up|login (5 min) para que RefCatcher
// dispare el evento desde el navegador (is_seed:false) y la borre.
const REF_RX = /^[a-z0-9_]{3,30}$/;
const NEW_USER_WINDOW_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/feed";

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
  let needsAge = false;
  if (user) {
    const { data } = await sb.from("profiles").select("birth_year").eq("id", user.id).maybeSingle();
    needsAge = !data?.birth_year;

    const store = await cookies();

    // Invitación (una sola vez; el servidor ignora auto-invitación y cuentas viejas).
    const ref = store.get("vinko_ref")?.value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
    if (REF_RX.test(ref)) {
      try { await sb.rpc("claim_referral", { p_handle: ref }); } catch { /* nunca bloquea el login */ }
      store.set("vinko_ref", "", { maxAge: 0, path: "/", sameSite: "lax" });
    }

    // Primer login (cuenta recién creada o sin +18 aún) vs. vuelta.
    const createdMs = Date.parse(user.created_at ?? "");
    const isNew = needsAge || (Number.isFinite(createdMs) && Date.now() - createdMs < NEW_USER_WINDOW_MS);
    store.set("vinko_auth_evt", isNew ? "sign_up" : "login", {
      maxAge: 300, path: "/", sameSite: "lax", httpOnly: false,
    });
  }

  if (needsAge) {
    return NextResponse.redirect(`${origin}/bienvenida?next=${encodeURIComponent(next)}`);
  }
  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/feed"}`);
}
