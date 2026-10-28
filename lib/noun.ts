// La palabra VISIBLE para lo que el código (tablas, rutas, RPC) llama «porra».
// Decisión de producto (27-oct): la que se entiende en toda Latinoamérica →
// «predicción», por mercado (markets.noun, 0064/0070). Hoy TODOS los mercados
// activos (GLOBAL, CO, ES) dicen «predicción», así que la copy se pinta con
// esta. La copy no escribe la palabra: usa {noun} · {nouns} · {Noun} · {Nouns}
// y t() la rellena aquí (lib/i18n.ts). Cuando un mercado quiera otra palabra,
// se cambia la resolución aquí, no 180 frases.
// OJO: femenina como «porra» («la/una/tu predicción»): una palabra masculina
// («pronóstico») obligaría a revisar artículos y adjetivos de la copy.
export const NOUN = {
  es: { one: "predicción", many: "predicciones" },
  en: { one: "prediction", many: "predictions" },
} as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rellena {noun}/{nouns}/{Noun}/{Nouns} con la palabra del idioma. */
export function withNoun(s: string, lang: keyof typeof NOUN): string {
  if (!s.includes("{")) return s;
  const n = NOUN[lang];
  return s
    .replaceAll("{noun}", n.one).replaceAll("{nouns}", n.many)
    .replaceAll("{Noun}", cap(n.one)).replaceAll("{Nouns}", cap(n.many));
}
