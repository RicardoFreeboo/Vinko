import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
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
        {children}
      </body>
    </html>
  );
}
