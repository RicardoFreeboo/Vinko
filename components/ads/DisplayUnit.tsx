"use client";
import { useEffect } from "react";
import { ADS_ENABLED, ADSENSE_CLIENT } from "@/lib/ads";

// Display AdSense (FeedAdAdapter): 1 hueco cada 5 tarjetas SOLO en HOME.
// JAMÁS se importa en /p/[slug] (regla del freeze: cero ads en /p).
// Sin ADS_ENABLED o sin fill → no renderiza (nada de hueco gris).
declare global {
  interface Window { adsbygoogle?: unknown[] }
}

export function DisplayUnit({ slot }: { slot: string }) {
  useEffect(() => {
    if (!ADS_ENABLED) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* noop */ }
  }, []);

  if (!ADS_ENABLED) return null;

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format="fluid"
      data-full-width-responsive="true"
    />
  );
}
