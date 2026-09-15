import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";

// Fuentes del backstage (sala de control). Solo se aplican en /admin — el juego
// del jugador sigue con system-ui para no cargar fuentes de más.
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"], weight: ["500", "700"], variable: "--font-display", display: "swap",
});
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono2", display: "swap",
});
export const inter = Inter({
  subsets: ["latin"], weight: ["400", "600"], variable: "--font-body", display: "swap",
});
