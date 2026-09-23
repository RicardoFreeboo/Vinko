import type { MetadataRoute } from "next";
import { SITE } from "@/lib/share";

// Público desde el lanzamiento: portada, feed, porras y legales rastreables
// (AdSense y Google lo necesitan). Fuera: consola, API y zonas con sesión.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/ajustes", "/buzon", "/saldo", "/cartera", "/verificar", "/juego-seguro", "/secret", "/auth/", "/s/", "/demo", "/showcase", "/dossier"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
