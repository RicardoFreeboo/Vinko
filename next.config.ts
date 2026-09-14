import type { NextConfig } from "next";

// Demo en hosting compartido (Hostinger, sin Node): export estático.
// /p/[slug] y sus OG se prerenderizan para todas las porras conocidas
// (plantillas + editoriales @vinko). El login/loop real necesita Node (fase
// siguiente); aquí queda como showcase navegable. noindex vía <meta> (layout).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
