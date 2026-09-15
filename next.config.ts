import type { NextConfig } from "next";

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

export default nextConfig;
