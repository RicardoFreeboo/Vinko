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
// Con `porraId` y sesión, al compartir se pide el reto diario de compartir
// (grant_share_reward: 50 Vinkos, una vez al día, crédito solo en servidor).
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
  function onClick() {
    capture(event, { is_seed: false });
    const sb = porraId ? supabaseBrowser() : null;
    if (!sb) return;
    void sb.rpc("grant_share_reward", { p_porra: porraId }).then(({ data }) => {
      const n = typeof data === "number" ? data : 0;
      if (n > 0) { setReward(n); setTimeout(() => setReward(null), 3500); }
    });
  }
  return (
    <span className="relative inline-flex">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
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
