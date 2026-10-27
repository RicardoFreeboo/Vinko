"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capture, type EventName } from "@/lib/analytics";
import { supabaseBrowser } from "@/lib/supabase/client";

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

// Atribución de marketing (primer toque): la PRIMERA vez que el navegador llega
// con utm_* (o gclid/fbclid de campañas de pago) se guardan en localStorage y
// NO se sobrescriben, para conservar la campaña que trajo al usuario. Se
// adjuntan al evento sign_up. Solo llegan a PostHog si hay consentimiento:
// capture() ya lo exige (F-10). Sin cookie: el alta se dispara en el cliente, así
// que localStorage basta y evitamos una cookie de marketing extra.
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"] as const;

function cleanUtm(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120); // sin control chars, tope 120
  return s.length ? s : null;
}

function readStoredUtm(): Record<string, string> {
  try {
    const raw = localStorage.getItem("vinko_utm");
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* sin storage o JSON corrupto */ }
  return {};
}

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

    // utm_* de primer toque: se guardan UNA sola vez (ver nota de arriba).
    try {
      const sp = new URLSearchParams(window.location.search);
      const incoming: Record<string, string> = {};
      for (const k of UTM_KEYS) {
        const c = cleanUtm(sp.get(k));
        if (c) incoming[k] = c;
      }
      if (Object.keys(incoming).length > 0) {
        try {
          if (!localStorage.getItem("vinko_utm")) localStorage.setItem("vinko_utm", JSON.stringify(incoming));
        } catch { /* sin storage */ }
      }
    } catch { /* jamás rompe la página */ }

    try {
      const m = document.cookie.match(/(?:^|;\s*)vinko_auth_evt=(sign_up|login)(?:;|$)/);
      if (m) {
        document.cookie = "vinko_auth_evt=; Max-Age=0; Path=/; SameSite=Lax";
        // En el alta adjuntamos la campaña de primer toque (atribución).
        capture(m[1] as EventName, { is_seed: false, ...(m[1] === "sign_up" ? readStoredUtm() : {}) });
      }
    } catch { /* la analítica jamás rompe la UI */ }
  }, [path]);

  // G-06 antiabuso: huella salada (UA + pantalla + idioma) una vez al día si hay
  // sesión. Sin sesión la RPC falla y se ignora. No se guarda nada legible.
  useEffect(() => {
    try {
      const key = "vinko_dh_" + new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(key)) return;
      const raw = `vinko|${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.language}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      void crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then((buf) => {
        const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        const sb = supabaseBrowser();
        if (!sb) return;
        void sb.rpc("set_device_hash", { p_hash: hex }).then(({ error }) => { if (!error) localStorage.setItem(key, "1"); });
      });
    } catch { /* sin crypto/storage: nada */ }
  }, []);
  return null;
}
