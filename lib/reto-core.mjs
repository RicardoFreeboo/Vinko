// ============================================================================
// El Reto — lógica pura compartida (espejos JS de las reglas SQL de 0057).
// En .mjs plano para que tests/unit/reto.test.mjs la importe con Node directo;
// la app la consume tipada vía lib/reto.ts. La fuente de verdad es la base.
// ============================================================================

// RT-01 — veto de importes en el premio: el premio es una COSA («una cena»),
// nunca dinero. Espejo del trigger stake_text_guard (0057).
// lexicon:ignore — patrón que BLOQUEA estos términos, no copy.
export const STAKE_MONEY_RX =
  /[€$£]|\d\s*(eur|euros?|pesos?|soles|reales|usd|d[oó]lares?)\b|\bdinero\b/i;
// lexicon:ignore — ídem: lista negra, no copy.
export const STAKE_LEXICON_RX =
  /apuest|apost|\bcuotas?\b|\bbote\b|casino|wallet|\bcash\b|\bbet(s|ting)?\b/i;

/** @param {string} text @returns {"short"|"long"|"money"|"lexicon"|null} */
export function stakeTextError(text) {
  const t = text.trim();
  if (t.length < 3) return "short";
  if (t.length > 60) return "long";
  if (STAKE_MONEY_RX.test(t)) return "money";
  if (STAKE_LEXICON_RX.test(t)) return "lexicon";
  return null;
}

// RT-07 — objeciones para «Sin acuerdo»: 1 en un 1v1; en grupo el 30 % (mín. 1).
/** @param {number} participants */
export function objectionThreshold(participants) {
  return Math.max(1, Math.ceil(0.3 * Math.max(participants, 0)));
}

// RT-02 — chips de «¿Qué os jugáis?». "otro" abre campo libre; "vinkos" es la
// porra clásica de puntos.
export const STAKE_PRESETS = /** @type {const} */ ([
  { key: "cena", emoji: "🍽️" },
  { key: "cafe", emoji: "☕" },
  { key: "ronda", emoji: "🍻" },
  { key: "otro", emoji: "🎁" },
  { key: "vinkos", emoji: "🪙" },
]);

/** @param {string | null | undefined} stakeText */
export function stakeEmoji(stakeText) {
  const t = (stakeText ?? "").toLowerCase();
  if (/cena|comida|restaurante/.test(t)) return "🍽️";
  if (/caf[eé]|desayuno/.test(t)) return "☕";
  if (/ronda|cañas|caña|birra|cerveza|copa/.test(t)) return "🍻";
  return "🎁";
}

// RT-03 — un /p se pinta como RETO si se juega un premio o si es una porra de
// usuario pequeña (≤6 participantes reales): cara a cara, no termómetro.
/** @param {string|null|undefined} stakeKind @param {string|null|undefined} source @param {number} participants */
export function esReto(stakeKind, source, participants) {
  if (stakeKind === "prize") return true;
  return source === "user" && participants <= 6;
}
