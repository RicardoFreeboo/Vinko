// ALPHA FREEZE: todos los strings en messages/es.json y messages/en.json.
// UI del alfa en es. Cero strings hardcoded en JSX. PT-BR no se activa.
import es from "@/messages/es.json";
import en from "@/messages/en.json";

const dicts = { es, en } as const;
export type Locale = keyof typeof dicts;

const LOCALE: Locale = "es"; // UI del alfa en español

export function t(key: string, vars?: Record<string, string>): string {
  const d = dicts[LOCALE] as Record<string, string>;
  const base = d[key] ?? (dicts.es as Record<string, string>)[key] ?? key;
  if (!vars) return base;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v),
    base,
  );
}
