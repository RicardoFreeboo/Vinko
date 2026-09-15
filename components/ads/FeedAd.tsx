"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ADS_ENABLED, ADSENSE_CLIENT, ADSENSE_FEED_SLOT } from "@/lib/ads";
import { t } from "@/lib/i18n";

// FeedAdAdapter (PASO 6): 1 hueco cada 5 tarjetas, SOLO en el feed de HOME.
// JAMÁS en /p (este componente no se importa allí).
// Cascada: 1) AdSense real (unidad "Vinko feed"); 2) si no rellena —sitio nuevo
// o sin inventario— HOUSE ad (promo de la capa social), para que el hueco no
// quede vacío. Reglas de oro: la house ad no toca dinero ni juego real.
declare global {
  interface Window { adsbygoogle?: unknown[] }
}
const HOUSE = [
  { emoji: "🤝", key: "invite", href: "/grupos" },
  { emoji: "✏️", key: "create", href: "/nueva" },
  { emoji: "🔥", key: "streak", href: "/saldo" },
] as const;

export function FeedAd({ seed = 0 }: { seed?: number }) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [fallback, setFallback] = useState(!ADSENSE_FEED_SLOT);
  const [i, setI] = useState(seed % HOUSE.length);

  // rota la house ad (solo se ve si AdSense no rellena)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % HOUSE.length), 6000);
    return () => clearInterval(id);
  }, []);

  // pide el anuncio real y SONDEA su estado: "filled" → mantener; "unfilled" (o
  // sin resolver a los 8 s) → house ad, para que nunca quede un hueco gris.
  useEffect(() => {
    if (!ADS_ENABLED || !ADSENSE_FEED_SLOT || pushed.current) return;
    pushed.current = true;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* noop */ }
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      const status = insRef.current?.getAttribute("data-ad-status");
      if (status === "filled") { clearInterval(iv); return; }
      if (status === "unfilled" || tries >= 16) { clearInterval(iv); setFallback(true); }
    }, 500);
    return () => clearInterval(iv);
  }, []);

  if (!ADS_ENABLED) return null;

  // ---- HOUSE AD (relleno propio) ----
  if (fallback) {
    const h = HOUSE[i];
    return (
      <Link href={h.href}
        className="relative block overflow-hidden rounded-[16px] border border-[var(--gold)]/40 bg-gradient-to-br from-[var(--ink2)] to-[var(--ink3)] p-4">
        <span className="mono absolute right-3 top-3 rounded-full border border-[var(--muted2)]/50 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--muted2)]">
          {t("ad.label")}
        </span>
        <div className="flex items-center gap-3 pr-16">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-[var(--gold)]/15 text-2xl">{h.emoji}</span>
          <div className="min-w-0">
            <p className="text-[15px] font-black leading-tight text-[var(--cream)]">{t(`ad.house.${h.key}.title`)}</p>
            <p className="text-[12px] text-[var(--muted)]">{t(`ad.house.${h.key}.sub`)}</p>
          </div>
        </div>
        <span className="mt-3 flex items-center justify-center rounded-[10px] bg-[var(--gold)] py-2 text-[13px] font-black text-[var(--ink)]">
          {t(`ad.house.${h.key}.cta`)}
        </span>
      </Link>
    );
  }

  // ---- ANUNCIO REAL (AdSense) ----  etiqueta ARRIBA, sin solaparse con el ad
  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--ink2)]">
      <div className="flex justify-end px-3 pt-2">
        <span className="mono rounded-full border border-[var(--muted2)]/50 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[var(--muted2)]">
          {t("ad.label")}
        </span>
      </div>
      <ins ref={insRef} className="adsbygoogle" style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_FEED_SLOT}
        data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
