import type { Metadata } from "next";
import Script from "next/script";
import { Gate } from "@/components/Gate";
import { Analytics } from "@/components/Analytics";
import { getSession } from "@/lib/session";
import { t } from "@/lib/i18n";
import "./globals.css";

// AdSense: solo el cargador (verificación del sitio + display cuando se active).
// NO renderiza unidades de anuncio aquí. Mantener Auto Ads OFF en el panel para
// no inyectar en /p (regla del ALPHA FREEZE: cero ads en /p, display solo HOME).
const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-7388549278894123";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vinko.fun";

// Verificación de propiedad del dominio (Search Console). Google la exige para
// publicar el consentimiento OAuth. Se inyecta como <meta name="google-site-
// verification">. Basta con poner el token en la variable de entorno.
const GSV = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: t("brand"), template: `%s — ${t("brand")}` },
  description: t("tagline"),
  // Staging no indexable mientras LEGAL_LOCK (refuerzo de la cabecera global).
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Vinko", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  ...(GSV ? { verification: { google: GSV } } : {}),
};

export const viewport = { themeColor: "#0c1011" };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Consentimiento de analítica: solo con sesión y +18 declarado (age-gate),
  // que es el mismo punto de opt-in que PostHog. Sin eso, GA queda denegado.
  const session = await getSession().catch(() => null);
  const consent = !!session?.birth_year;
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]">
        <Analytics consent={consent} />
        <Gate>{children}</Gate>
        {ADSENSE_CLIENT && (
          <Script
            id="adsbygoogle-init"
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
      </body>
    </html>
  );
}
