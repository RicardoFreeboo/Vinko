"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capture, type EventName } from "@/lib/analytics";

// Captura el enlace de invitación y el evento de auth. No pinta nada.
//
//  · ?ref=<handle> (cualquier página, incluida /p/[slug]) → cookie vinko_ref
//    (30 días, SameSite=Lax) + localStorage. La lee /auth/callback tras el
//    login y llama a claim_referral: solo apunta quién te invitó; los Vinkos
//    se pagan a los dos cuando el invitado hace su PRIMER pick (0030).
//  · vinko_auth_evt=sign_up|login (cookie corta que deja /auth/callback) →
//    un capture() con is_seed:false y se borra. Así el evento sale del
//    navegador con el distinct_id de PostHog, no del servidor.
const REF_RX = /^[a-z0-9_]{3,30}$/;
const REF_MAX_AGE = 30 * 24 * 3600;

export function RefCatcher() {
  const path = usePathname();

  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("ref");
      const ref = raw?.trim().replace(/^@+/, "").toLowerCase() ?? "";
      if (REF_RX.test(ref)) {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `vinko_ref=${ref}; Max-Age=${REF_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
        try { localStorage.setItem("vinko_ref", ref); } catch { /* sin storage */ }
      }
    } catch { /* jamás rompe la página */ }

    try {
      const m = document.cookie.match(/(?:^|;\s*)vinko_auth_evt=(sign_up|login)(?:;|$)/);
      if (m) {
        document.cookie = "vinko_auth_evt=; Max-Age=0; Path=/; SameSite=Lax";
        // y quitar este cast.
        capture(m[1] as EventName, { is_seed: false });
      }
    } catch { /* la analítica jamás rompe la UI */ }
  }, [path]);

  return null;
}
