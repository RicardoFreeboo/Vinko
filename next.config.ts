import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Vercel: SSR completo. Lanzamiento (21-sep): el sitio es público e indexable
// (AdSense y Google lo exigen); la cabecera X-Robots-Tag de la alfa privada
// anulaba el <meta robots> de app/layout.tsx, así que ahora solo cubre las
// zonas con sesión/consola (mismas rutas que app/robots.ts). /dossier sirve el
// investment dossier (HTML estático en public/dossier), reescrito a URL limpia.
const nextConfig: NextConfig = {
  async headers() {
    return ["/admin", "/api", "/ajustes", "/buzon", "/saldo", "/secret", "/auth", "/s", "/dossier"].map((p) => ({
      source: `${p}/:path*`,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    })).concat(["/admin", "/ajustes", "/buzon", "/saldo", "/secret", "/dossier"].map((p) => ({
      source: p,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    })));
  },
  async rewrites() {
    return [{ source: "/dossier", destination: "/dossier/index.html" }];
  },
};

// Sentry: instrumenta cliente/servidor/edge. Sin subida de source maps (no hay
// authToken) — errores igualmente capturados. Silencioso salvo en CI.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: true },
});
