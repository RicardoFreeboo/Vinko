// Test de léxico prohibido (L5 del spec de gamificación + lista negra de
// CLAUDE.md). Corre en CI y en predeploy y falla si un término prohibido
// aparece en el COPY PÚBLICO. Ámbito deliberado: solo lo que puede salir en
// pantalla — los comentarios de código y este repo pueden nombrar "apuesta"
// para explicarse.
//   1. messages/es.json y messages/en.json (+ messages/parts/*.json si existe)
//   2. supabase/migrations/NNNN_*.sql con NNNN ≥ 0030: SOLO los literales SQL
//      '…' (avisos, notificaciones, textos que llegan al usuario). Se informa
//      fichero:línea. No cuentan: tokens tipo identificador ('cuotas' como
//      clave de flag), patrones de búsqueda (like / ~* / texto eliminado por
//      replace) ni líneas con `lexicon:ignore` en un comentario (p. ej. una
//      regex que LISTA los términos para bloquearlos).
// Las funciones se exportan para tests/unit/lexicon.test.mjs; el escaneo solo
// corre cuando se ejecuta este fichero directamente.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["messages/es.json", "messages/en.json"];
const PARTS_DIR = "messages/parts";
const MIG_DIR = "supabase/migrations";
export const MIG_FROM = 30; // primera migración vigilada (0030_launch_hardening.sql)

// Términos prohibidos (regex, case-insensitive, con límites de palabra donde
// haga falta para no dar falsos positivos). "dinero" a secas NO entra: la copy
// blanca obligatoria dice "no se canjean por dinero".
export const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /\bbets\b/i, /betting/i, /\bwager\w*/i,
  /\bcuota\w*/i, /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i,
  /\bcasino\b/i, /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i,
  /prediction market/i, /polymarket/i, /kalshi/i,
];

/** Primer término prohibido que aparece en `text`, o null. */
export function bannedIn(text) {
  for (const rx of BANNED) {
    const m = text.match(rx);
    if (m) return m[0];
  }
  return null;
}

function flatten(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && out.push(x));
    else if (v && typeof v === "object") flatten(v, out);
  }
  return out;
}

/** Incidencias en un JSON de mensajes: [{key, term, text}]. */
export function jsonHits(json) {
  const hits = [];
  for (const [key, val] of Object.entries(json)) {
    const text = Array.isArray(val) ? val.join(" ") : typeof val === "object" && val ? flatten(val).join(" ") : String(val);
    const term = bannedIn(text);
    if (term) hits.push({ key, term, text });
  }
  return hits;
}

/**
 * Incidencias en UNA línea de SQL: literales '…' (con '' como escape) que
 * contienen un término prohibido → [{text, term}]. Excluye identificadores,
 * patrones de búsqueda y líneas marcadas con `lexicon:ignore`.
 */
export function sqlLineHits(raw) {
  if (/lexicon:ignore/i.test(raw)) return [];
  const line = raw.replace(/--.*$/, ""); // fuera comentarios SQL
  const hits = [];
  for (const m of line.matchAll(/'(?:[^']|'')*'/g)) {
    const text = m[0].slice(1, -1).replace(/''/g, "'");
    // Un token minúsculas-sin-espacios ('cuotas', 'lexico', 'open') es una
    // clave/enum/identificador, no copy: el texto que ve el usuario lleva
    // espacios, mayúsculas o puntuación.
    if (/^[a-z0-9_-]+$/.test(text)) continue;
    // Patrones de BÚSQUEDA no son copy: `like '…'`, `~* '…'`, y el texto que
    // se elimina en `replace(col, '…', …)` (limpiezas de datos).
    const before = line.slice(0, m.index).trimEnd();
    if (/(\blike|\bilike|\bsimilar to|!?~\*?)$/i.test(before)) continue;
    if (/\b(regexp_)?replace\(\s*[^,()]*,$/i.test(before)) continue;
    const term = bannedIn(text);
    if (term) hits.push({ text, term });
  }
  return hits;
}

/** Migraciones vigiladas (nombre de fichero), ordenadas. */
export function watchedMigrations(dir = join(root, MIG_DIR)) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && parseInt(f.slice(0, 4), 10) >= MIG_FROM)
    .sort();
}

function main() {
  let hits = 0;

  // 1) Copy de UI (JSON de mensajes)
  const jsonFiles = [...FILES];
  if (existsSync(join(root, PARTS_DIR))) {
    for (const f of readdirSync(join(root, PARTS_DIR)).filter((f) => f.endsWith(".json")).sort()) {
      jsonFiles.push(`${PARTS_DIR}/${f}`);
    }
  }
  for (const file of jsonFiles) {
    const json = JSON.parse(readFileSync(join(root, file), "utf8"));
    for (const h of jsonHits(json)) {
      console.error(`✗ ${file} · "${h.key}": término prohibido «${h.term}» → ${h.text}`);
      hits++;
    }
  }

  // 2) Migraciones ≥ MIG_FROM: literales SQL, línea a línea.
  const migFiles = watchedMigrations();
  for (const f of migFiles) {
    const lines = readFileSync(join(root, MIG_DIR, f), "utf8").split(/\r?\n/);
    lines.forEach((raw, i) => {
      for (const h of sqlLineHits(raw)) {
        console.error(`✗ ${MIG_DIR}/${f}:${i + 1}: término prohibido «${h.term}» → '${h.text}'`);
        hits++;
      }
    });
  }

  if (hits > 0) {
    console.error(`\nLéxico prohibido: ${hits} incidencia(s). Corrige la copy pública (L5).`);
    process.exit(1);
  }
  console.log(`✓ Léxico limpio: ${jsonFiles.length} JSON de mensajes y ${migFiles.length} migración(es) ≥ ${String(MIG_FROM).padStart(4, "0")} sin términos prohibidos.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
