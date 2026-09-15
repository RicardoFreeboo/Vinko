import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Vercel: SSR completo. Alfa privada: noindex. /dossier sirve el investment
// dossier (HTML estático en public/dossier), reescrito a URL limpia.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
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
