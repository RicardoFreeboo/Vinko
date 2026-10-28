import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Vercel: SSR completo. Lanzamiento (21-sep): el sitio es público e indexable
// (AdSense y Google lo exigen); la cabecera X-Robots-Tag de la alfa privada
// anulaba el <meta robots> de app/layout.tsx, así que ahora solo cubre las
// zonas con sesión/consola (mismas rutas que app/robots.ts). /dossier sirve el
// investment dossier (HTML estático en public/dossier), reescrito a URL limpia.
const nextConfig: NextConfig = {
  // ESLint es un paso propio del gate (npm run lint / scripts/predeploy.mjs), con
  // su línea base de supresiones (eslint-suppressions.json). `next build` no debe
  // lintar en paralelo: ignora esa base y rompería el build con los avisos
  // preexistentes. El candado de lint vive en CI, no en el build.
  eslint: { ignoreDuringBuilds: true },
  // El recibo para compartir (VINKO_PANTALLAS 09) lee sus fuentes OFL del disco.
  outputFileTracingIncludes: { "/p/[slug]/recibo": ["./lib/og-fonts/*.woff"] },
  async headers() {
    return ["/admin", "/api", "/ajustes", "/buzon", "/saldo", "/secret", "/auth", "/s", "/dossier", "/demo"].map((p) => ({
      source: `${p}/:path*`,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    })).concat(["/admin", "/ajustes", "/buzon", "/saldo", "/secret", "/dossier", "/demo"].map((p) => ({
      source: p,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    })));
  },
  async rewrites() {
    return []; // MON-01: /dossier fuera (era el investment dossier)
  },
};

// Sentry: instrumenta cliente/servidor/edge. Sin subida de source maps (no hay
// authToken) — errores igualmente capturados. Silencioso salvo en CI.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: true },
});
