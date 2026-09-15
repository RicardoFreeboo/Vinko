// Test de léxico prohibido (L5 del spec de gamificación + lista negra de
// CLAUDE.md). Corre en CI y falla si un término prohibido aparece en el COPY
// PÚBLICO (messages/es.json, messages/en.json). Ámbito deliberado: solo los
// strings de UI — los comentarios de código y este repo pueden nombrar
// "apuesta" para explicarse; lo que nunca puede es salir en pantalla.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["messages/es.json", "messages/en.json"];

// Términos prohibidos (regex, case-insensitive, con límites de palabra donde
// haga falta para no dar falsos positivos). "dinero" a secas NO entra: la copy
// blanca obligatoria dice "no se canjean por dinero".
const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /\bbets\b/i, /betting/i, /\bwager\w*/i,
  /\bcuota\w*/i, /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i,
  /\bcasino\b/i, /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i,
  /prediction market/i, /polymarket/i, /kalshi/i,
];

function flatten(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && out.push(x));
    else if (v && typeof v === "object") flatten(v, out);
  }
  return out;
}

let hits = 0;
for (const file of FILES) {
  const json = JSON.parse(readFileSync(join(root, file), "utf8"));
  for (const [key, val] of Object.entries(json)) {
    const text = Array.isArray(val) ? val.join(" ") : String(val);
    for (const rx of BANNED) {
      const m = text.match(rx);
      if (m) { console.error(`✗ ${file} · "${key}": término prohibido «${m[0]}» → ${text}`); hits++; }
    }
  }
}

if (hits > 0) {
  console.error(`\nLéxico prohibido: ${hits} incidencia(s). Corrige la copy pública (L5).`);
  process.exit(1);
}
console.log("✓ Léxico limpio: sin términos prohibidos en la copy pública.");
