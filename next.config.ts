import type { NextConfig } from "next";

// Vercel: SSR completo (login, loop, OG dinámica, scraper server). Alfa privada:
// noindex por cabecera + <meta> (layout) + candado /secret.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
