import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Alfa: staging no indexable mientras LEGAL_LOCK (cabecera global de refuerzo;
  // el robots noindex va también en el layout).
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
