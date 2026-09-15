"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Google Analytics 4 (adquisición y tráfico). PostHog sigue siendo la analítica
// de producto (cohortes, funnels): NO se duplica el trabajo.
//
// RGPD: el consentimiento arranca DENEGADO. Solo se concede cuando la persona
// ha pasado el age-gate (+18 declarado), que es el mismo punto de opt-in que
// usa PostHog. Sin consentimiento GA no rastrea nada.
// Jamás se mandan datos personales: ni email, ni handle, ni nombre.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { dataLayer?: any[]; gtag?: (...args: any[]) => void }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function Analytics({ consent }: { consent: boolean }) {
  const pathname = usePathname();

  // Concede/retira el consentimiento cuando cambia el estado de sesión.
  useEffect(() => {
    if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
    window.gtag("consent", "update", {
      analytics_storage: consent ? "granted" : "denied",
    });
  }, [consent]);

  // El App Router no dispara page_view al navegar en cliente: se manda a mano.
  useEffect(() => {
    if (!GA_ID || !consent || typeof window === "undefined" || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: pathname });
  }, [pathname, consent]);

  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('consent', 'default', { analytics_storage: 'denied' });
        gtag('config', '${GA_ID}', { anonymize_ip: true, send_page_view: false });
      `}</Script>
    </>
  );
}

// Espejo del taxonomy de PostHog, sin datos personales. Se llama desde el
// mismo sitio donde ya se hace capture() de PostHog.
export function gaEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!GA_ID || typeof window === "undefined" || !window.gtag) return;
  try { window.gtag("event", name, params); } catch { /* la analítica nunca rompe la UI */ }
}
