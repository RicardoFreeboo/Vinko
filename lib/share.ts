// Enlaces compartibles (usable en servidor y en cliente).
export const SITE = "https://www.vinko.fun";

export function porraUrl(slug: string): string {
  return `${SITE}/p/${slug}`;
}
