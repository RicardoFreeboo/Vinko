// Avatares generados (spec D-12): DiceBear 9.x por URL, semilla = handle.
// Sin subida de fotos → cero moderación, cero PII. La misma URL la calcula el
// servidor (avatar_url_for en 0036) para que perfil y UI coincidan siempre.

export const AVATAR_STYLES = [
  "thumbs",
  "fun-emoji",
  "bottts-neutral",
  "adventurer-neutral",
  "big-smile",
  "pixel-art-neutral",
] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = "thumbs";

const BASE = "https://api.dicebear.com/9.x";

export function isAvatarStyle(s: unknown): s is AvatarStyle {
  return typeof s === "string" && (AVATAR_STYLES as readonly string[]).includes(s);
}

/** URL SVG del avatar de un handle. Debe ser idéntica a la SQL de 0036. */
export function avatarUrl(handle: string, style: AvatarStyle = DEFAULT_AVATAR_STYLE): string {
  const seed = handle.trim().replace(/^@+/, "").toLowerCase();
  return `${BASE}/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

/** Estilo DiceBear de una avatar_url, o null si no es un avatar generado (p. ej. foto de Google). */
export function avatarStyleOf(url: string | null | undefined): AvatarStyle | null {
  if (!url || !url.startsWith(BASE + "/")) return null;
  const style = url.slice(BASE.length + 1).split("/")[0];
  return isAvatarStyle(style) ? style : null;
}
