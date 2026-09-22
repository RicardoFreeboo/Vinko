// Geolocalización por IP (M0, docs/money/CONTRATOS_M0.md §B3). Solo servidor:
// lee las cabeceras que Vercel añade a cada petición (región dub1). En `next
// dev` no existen → null. No es un dato de dinero: la usan la elegibilidad y la
// UI apagada, y como sugerencia de país en el onboarding.
import { headers } from "next/headers";

// Valores "no sé" de Vercel: XX (país desconocido), T1 (red Tor), ZZ (reservado).
const UNKNOWN = new Set(["XX", "T1", "ZZ"]);

// País por IP en mayúsculas (ISO-2). null si falta o es un valor "no sé".
export async function ipCountry(): Promise<string | null> {
  try {
    const raw = (await headers()).get("x-vercel-ip-country");
    if (!raw) return null;
    const iso = raw.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso) || UNKNOWN.has(iso)) return null;
    return iso;
  } catch {
    return null;
  }
}

// Región/subdivisión por IP (p. ej. provincia AR). null si falta o "no sé".
export async function ipRegion(): Promise<string | null> {
  try {
    const raw = (await headers()).get("x-vercel-ip-country-region");
    if (!raw) return null;
    const v = raw.trim().toUpperCase();
    if (!v || UNKNOWN.has(v)) return null;
    return v;
  } catch {
    return null;
  }
}
