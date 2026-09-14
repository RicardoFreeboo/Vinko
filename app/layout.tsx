import type { Metadata } from "next";
import { Gate } from "@/components/Gate";
import { t } from "@/lib/i18n";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vinko.fun";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: t("brand"), template: `%s — ${t("brand")}` },
  description: t("tagline"),
  // Staging no indexable mientras LEGAL_LOCK (refuerzo de la cabecera global).
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased [font-family:system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif]">
        <Gate>{children}</Gate>
      </body>
    </html>
  );
}
