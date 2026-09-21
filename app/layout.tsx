import type { Metadata } from "next";
import { Gate } from "@/components/Gate";
import { Analytics } from "@/components/Analytics";
import { AdsLoader } from "@/components/ads/AdsLoader";
import { RefCatcher } from "@/components/RefCatcher";
import { ConsentBanner } from "@/components/ConsentBanner";
import { A2HSPrompt } from "@/components/A2HSPrompt";
import { DesktopShell } from "@/components/DesktopShell";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import "./globals.css";

// AdSense: solo el cargador, y solo fuera de /p (ver AdsLoader). Mantener Auto
// Ads OFF en el panel para no inyectar en /p (freeze: cero ads en /p).

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vinko.fun";

// Verificación de propiedad del dominio (Search Console). Google la exige para
// publicar el consentimiento OAuth. Se inyecta como <meta name="google-site-
// verification">. Basta con poner el token en la variable de entorno.
const GSV = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: t("brand"), template: `%s — ${t("brand")}` },
  description: t("tagline"),
  // Lanzamiento (21-sep): la app es pública e indexable. Las zonas privadas
  // (/admin, /buzon, /saldo, /ajustes) se excluyen en app/robots.ts y AdSense
  // necesita poder rastrear /, /p/* y las legales para aprobar el sitio.
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Vinko", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  ...(GSV ? { verification: { google: GSV } } : {}),
};

export const viewport = { themeColor: "#0c1011" };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Consentimiento de analítica (RGPD, spec F-10): solo si pulsó «Aceptar» en
  // el banner (cookie vinko_consent=1). Por defecto, denegado.
  const session = await getSession().catch(() => null);
  const consent = (await cookies()).get("vinko_consent")?.value === "1";
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]">
        <Analytics consent={consent} />
        <RefCatcher />
        <Gate hasSession={!!session}>
          <DesktopShell>{children}</DesktopShell>
        </Gate>
        <ConsentBanner />
        <A2HSPrompt />
        <AdsLoader />
      </body>
    </html>
  );
}
