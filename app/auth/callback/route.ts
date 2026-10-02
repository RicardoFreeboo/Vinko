import { NextResponse } from "next/server";
import { fetchMe } from "@/lib/me";
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
  // FX-08: el enlace mágico caducado/usado vuelve al login CON mensaje (err=1),
  // no a una pantalla muda, y conserva el next para reintentar al sitio.
  if (!okAuth) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}&err=1`);
  }

  const { data: { user } } = await sb.auth.getUser();
  let needsAge = false;
  if (user) {
    // SEC-01: birth_year/onboarded_at son privadas → propio perfil vía me().
    const me = await fetchMe(sb);
    // FX-15: una cuenta borrada (delete_me) no vuelve a entrar aunque el purgado
    // de auth aún no haya corrido: fuera la sesión y al login con mensaje.
    if (me?.deleted_at) {
      await sb.auth.signOut();
      return NextResponse.redirect(`${origin}/login?err=deleted`);
    }
    needsAge = !me?.birth_year;
    // Onboarding de 3 pantallas (spec F-08): quien tiene año pero no terminó las
    // pantallas 2-3 también pasa por /bienvenida (null explícito; si 0036 no está
    // aplicada el campo no existe y no se fuerza).
    if (!needsAge && me && me.onboarded_at === null) needsAge = true;

    const store = await cookies();

    // Invitación (una sola vez; el servidor ignora auto-invitación y cuentas viejas).
    const ref = store.get("vinko_ref")?.value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
    if (REF_RX.test(ref)) {
      try { await sb.rpc("claim_referral", { p_handle: ref }); } catch { /* nunca bloquea el login */ }
      store.set("vinko_ref", "", { maxAge: 0, path: "/", sameSite: "lax" });
    }

    // Registro diferido (F-01, 0040): si la sesión venía de un invitado
    // (linkIdentity con Google conserva el mismo usuario), convert_guest activa
    // el perfil y cobra la entrada de sus picks invitados. Va DESPUÉS de
    // claim_referral (así la invitación queda apuntada antes de pagarla).
    // Nunca bloquea el login.
    if (!user.is_anonymous) {
      try { await sb.rpc("convert_guest"); } catch { /* nunca bloquea el login */ }
      // RT-06: si venía de un pick invitado (cookie vinko_merge, la deja
      // GuestConvert antes de ir a Google), merge_guest pasa sus picks a ESTA
      // cuenta — exista ya o sea nueva — copia el nombre y borra el perfil
      // invitado. El token es de un solo uso: la cookie caduca sola.
      const mergeTok = store.get("vinko_merge")?.value ?? "";
      if (/^[0-9a-f-]{36}$/.test(mergeTok)) {
        try { await sb.rpc("merge_guest", { p_token: mergeTok }); } catch { /* jamás bloquea */ }
        store.set("vinko_merge", "", { maxAge: 0, path: "/", sameSite: "lax" });
      }
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
