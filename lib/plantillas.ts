// Plantillas de /nueva (F-03): cada chip precarga pregunta, opciones, cierre,
// criterio de resolución y fecha de resolución esperada. Textos en
// messages/parts/crear.*.json (t()). Sin backend: puro cálculo de fechas.
import { t } from "@/lib/i18n";

export type ClosePreset = "1h" | "tonight" | "tomorrow" | "weekend" | "custom";
export type PlantillaKey = "partido" | "reality" | "boda" | "oficina" | "viaje" | "serie" | "libre";

export type Plantilla = {
  key: PlantillaKey;      // porras.template_key
  emoji: string;
  close: ClosePreset;     // cierre por defecto
  resolveOffsetH: number; // horas tras el cierre en las que se espera el resultado
};

export const PLANTILLAS: Plantilla[] = [
  { key: "partido", emoji: "⚽", close: "tonight",  resolveOffsetH: 3 },
  { key: "reality", emoji: "📺", close: "tomorrow", resolveOffsetH: 4 },
  { key: "boda",    emoji: "💍", close: "tonight",  resolveOffsetH: 6 },
  { key: "oficina", emoji: "💼", close: "weekend",  resolveOffsetH: 12 },
  { key: "viaje",   emoji: "🚗", close: "1h",       resolveOffsetH: 3 },
  { key: "serie",   emoji: "🍿", close: "weekend",  resolveOffsetH: 2 },
  { key: "libre",   emoji: "✍️", close: "tomorrow", resolveOffsetH: 0 },
];

export const PLANTILLA_LIBRE = PLANTILLAS[PLANTILLAS.length - 1];

export function plantilla(key: PlantillaKey): Plantilla {
  return PLANTILLAS.find((p) => p.key === key) ?? PLANTILLA_LIBRE;
}

// Textos precargados. "libre" deja pregunta y criterio vacíos a propósito: el
// criterio ha de ser concreto, no una frase genérica.
export function plantillaTextos(p: Plantilla, tr: (k: string) => string = t): { question: string; options: string[]; criteria: string } {
  const options = tr(`crear.tpl.${p.key}.opts`).split("|").map((s) => s.trim()).filter(Boolean);
  if (p.key === "libre") return { question: "", options, criteria: "" };
  return { question: tr(`crear.tpl.${p.key}.q`), options, criteria: tr(`crear.tpl.${p.key}.crit`) };
}

// ---- cierre -----------------------------------------------------------------
export const MIN_CLOSE_MS = 15 * 60 * 1000; // 15 min (mismo margen que el trigger 0041)

export function maxClose(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() + 12); // 12 meses: cápsula del tiempo (D-08)
  return d;
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 0, 0);
  return e;
}

// Fecha de cierre según el preset (hora local del usuario). null si falta la
// fecha exacta o no se puede leer.
export function closeFromPreset(preset: ClosePreset, custom: string, now = new Date()): Date | null {
  if (preset === "custom") {
    if (!custom) return null;
    const d = new Date(custom);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (preset === "1h") return new Date(now.getTime() + 60 * 60 * 1000);
  if (preset === "tonight") {
    const d = endOfDay(now);
    // Si ya es casi medianoche, "esta noche" pasa a la siguiente.
    if (d.getTime() - now.getTime() < MIN_CLOSE_MS) d.setDate(d.getDate() + 1);
    return d;
  }
  if (preset === "tomorrow") {
    const d = endOfDay(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  // weekend: el domingo que viene a las 23:59 (hoy mismo si es domingo y queda margen)
  const d = endOfDay(now);
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday);
  if (d.getTime() - now.getTime() < MIN_CLOSE_MS) d.setDate(d.getDate() + 7);
  return d;
}

export function closeRangeOk(d: Date, now = new Date()): boolean {
  return d.getTime() >= now.getTime() + MIN_CLOSE_MS && d.getTime() <= maxClose(now).getTime();
}

// yyyy-MM-ddTHH:mm en hora local (lo que espera <input type="datetime-local">).
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Resolución esperada por defecto: cierre + horas de la plantilla.
export function defaultResolves(close: Date, p: Plantilla): Date {
  return new Date(close.getTime() + p.resolveOffsetH * 60 * 60 * 1000);
}
