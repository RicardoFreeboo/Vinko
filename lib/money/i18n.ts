import "server-only";

// Diccionario regulado de las pantallas de dinero (M0, docs/money/CONTRATOS_M0.md
// §B4). VIVE APARTE de lib/i18n.ts a propósito: aquí sí puede usarse el
// vocabulario regulado, y se carga SOLO en servidor y SOLO cuando hay una bolsa
// elegible. En producción no se sirve hasta que un abogado apruebe el copy
// (_meta.legal_approved === true): mientras tanto loadMoneyDict devuelve null y
// la UI de dinero no se monta.

type MoneyDict = Record<string, string>;

type MoneyMeta = {
  country: string;
  legal_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
};

// Carga el diccionario de dinero del idioma pedido. Devuelve null en producción
// mientras el copy no esté aprobado legalmente. Quita _meta del resultado.
export async function loadMoneyDict(lang: "es" | "en"): Promise<MoneyDict | null> {
  const mod = await import(`@/messages/money/${lang}.json`);
  const raw = ((mod as { default?: unknown }).default ?? mod) as Record<string, unknown>;
  const meta = raw._meta as MoneyMeta | undefined;

  // Candado legal: en producción, sin aprobación firmada no se sirve copy de dinero.
  if (process.env.VERCEL_ENV === "production" && !meta?.legal_approved) return null;

  const dict: MoneyDict = {};
  for (const [key, val] of Object.entries(raw)) {
    if (key === "_meta") continue;
    if (typeof val === "string") dict[key] = val;
  }
  return dict;
}

// Traducción con interpolación {x}. Sin fallback a otro idioma: la clave cruda
// si falta (nunca debería, la paridad la vigila tests/unit/money-i18n.test.mjs).
export function tm(dict: MoneyDict, key: string, vars?: Record<string, string>): string {
  const base = dict[key] ?? key;
  if (!vars) return base;
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), base);
}
