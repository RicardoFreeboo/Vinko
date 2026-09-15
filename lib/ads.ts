// PASO 6 — configuración de anuncios. Flags del ALPHA FREEZE.
// ADS_ENABLED=false por defecto → stub rewarded + display no-op (sin hueco gris).
// LEGAL_LOCK=true → el botón rewarded queda oculto en público hasta que Ricardo
// lo quite. Los puntos por anuncio NUNCA son compra de puntos (regla de oro 2):
// crédito solo en servidor, +10 fijos, máx. 5/día, 0 si el anuncio no termina.
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
export const LEGAL_LOCK = process.env.NEXT_PUBLIC_LEGAL_LOCK !== "false"; // default true

export const REWARD_AMOUNT = 10;
export const REWARD_CAP_PER_DAY = 5;

// Display: AdSense (solo banners). Rewarded: NO existe en AdSense — requiere
// Google Ad Manager (GPT rewarded web). Ese id se pondrá aquí cuando exista.
export const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-7388549278894123";
// Unidad "Vinko feed" (Display responsive) — 1 hueco cada 5 tarjetas en Hoy.
export const ADSENSE_FEED_SLOT =
  process.env.NEXT_PUBLIC_ADSENSE_FEED_SLOT ?? "5485973348";
export const GAM_REWARDED_UNIT = process.env.NEXT_PUBLIC_GAM_REWARDED_UNIT ?? "";
