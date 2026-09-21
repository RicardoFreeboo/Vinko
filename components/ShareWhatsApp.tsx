"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture, type EventName } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Botón de compartir por WhatsApp FIABLE.
//
// Es un enlace real <a href="https://wa.me/?text=…"> y no un window.open():
// window.open lo anulan en silencio el bloqueador de ventanas, la app instalada
// (PWA) y los navegadores dentro de Instagram/Facebook. Un enlace de verdad
// abre WhatsApp siempre (app en el móvil, WhatsApp Web en el ordenador).
// Regla del freeze: solo wa.me con copy de lista blanca.
//
// En MÓVIL con Web Share API (F-02) se usa navigator.share({text, url}): la hoja
// nativa deja elegir el chat y WhatsApp pinta la miniatura OG del `url`. Si no
// existe, si el navegador la rechaza o falla, sigue el <a href> de wa.me (que
// además funciona sin JS y en escritorio). Cancelar la hoja no hace nada.
//
// Con `porraId` y sesión, al compartir se pide el reto diario de compartir
// (grant_share_reward: 50 Vinkos, una vez al día, crédito solo en servidor).

// Móvil = UA de Android/iOS o pantalla táctil con puntero grueso.
function isMobile(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return true;
  return navigator.maxTouchPoints > 1 && !!window.matchMedia?.("(pointer: coarse)")?.matches;
}

// La URL final del texto va aparte como `url` (WhatsApp la muestra con
// miniatura) y se quita del cuerpo para no duplicarla. Sin URL al final, el
// texto se comparte tal cual.
export function splitShareText(text: string): { text: string; url?: string } {
  const m = /(https?:\/\/\S+)\s*$/.exec(text);
  if (!m) return { text };
  const body = text.slice(0, m.index).trimEnd();
  return body ? { text: body, url: m[1] } : { text, url: m[1] };
}

export function ShareWhatsApp({
  text, className, children, event = "porra_shared", porraId,
}: {
  text: string;
  className?: string;
  children: React.ReactNode;
  event?: EventName;
  porraId?: string;
}) {
  const [reward, setReward] = useState<number | null>(null);
  const waHref = `https://wa.me/?text=${encodeURIComponent(text)}`;

  function track() {
    capture(event, { is_seed: false });
    const sb = porraId ? supabaseBrowser() : null;
    if (!sb) return;
    void sb.rpc("grant_share_reward", { p_porra: porraId }).then(({ data }) => {
      const n = typeof data === "number" ? data : 0;
      if (n > 0) { setReward(n); setTimeout(() => setReward(null), 3500); }
    });
  }

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    track();
    if (!isMobile() || typeof navigator.share !== "function") return; // → wa.me
    const data = splitShareText(text);
    if (typeof navigator.canShare === "function" && !navigator.canShare(data)) return;
    e.preventDefault();
    navigator.share(data).catch((err: unknown) => {
      // Cancelado por el usuario: nada. Cualquier otro fallo → wa.me en la misma
      // pestaña (sin gesto de usuario ya no se puede abrir una nueva).
      if (err instanceof Error && err.name === "AbortError") return;
      window.location.assign(waHref);
    });
  }

  return (
    <span className="relative inline-flex">
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
      >
        {children}
      </a>
      {reward !== null && (
        <span role="status" className="mono absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--gold)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)] shadow">
          {t("share.reward", { n: String(reward) })}
        </span>
      )}
    </span>
  );
}
