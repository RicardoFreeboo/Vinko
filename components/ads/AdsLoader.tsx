"use client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { ADSENSE_CLIENT } from "@/lib/ads";

// Cargador de AdSense. SOLO en las pantallas de la app con display (feed y
// portada). Jamás en /p/[slug]: es la landing que abre quien recibe el enlace
// de WhatsApp (métrica sagrada <2 s) y el freeze exige cero ads ahí. Tampoco en
// legales, admin ni login.
const SIN_ADS = ["/p/", "/admin", "/privacidad", "/terminos", "/login", "/auth", "/bienvenida", "/secret", "/nueva"];

export function AdsLoader() {
  const path = usePathname() ?? "/";
  if (!ADSENSE_CLIENT || SIN_ADS.some((r) => path.startsWith(r))) return null;
  return (
    <Script
      id="adsbygoogle-init"
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
