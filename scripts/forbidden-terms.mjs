// Candado anti-reintroducción del modo SOLO-PUNTOS (B2 de la tarea de infra).
// Escanea el CÓDIGO FUENTE (no la copy pública: de eso va scripts/lexicon-check.mjs)
// de app/, components/, lib/, packages/ y supabase/ buscando los términos del
// subsistema de dinero. Su objetivo es que, una vez que la rama claude/solo-puntos
// retire el dinero, NADIE pueda volver a introducir wallet/kyc/payout/odds/… sin
// que CI lo bloquee.
//
// Mientras el dinero AÚN vive en main, un "falla si aparece el término" pondría
// CI en rojo el día uno (hay ~65 ficheros con estos términos). Por eso el test
// funciona como RATCHET con línea base:
//   · scripts/forbidden-terms.baseline.json fija las ocurrencias ACTUALES por
//     fichero y término (recuento).
//   · CI (sin flags) FALLA solo ante ocurrencias NUEVAS: un fichero nuevo con un
//     término, un término nuevo en un fichero, o más ocurrencias que la base.
//   · Nunca falla por ocurrencias que ya estaban → verde hoy.
// Cuando solo-puntos borre el dinero, se regenera la base (`--update`) y queda a
// cero: a partir de ahí, tolerancia CERO.
//
//   node scripts/forbidden-terms.mjs            → comprueba contra la base (CI)
//   node scripts/forbidden-terms.mjs --update   → regenera la base (uso manual,
//                                                 p. ej. tras retirar código)
//
// Marcar una línea con `forbidden-terms:ignore` en un comentario la excluye
// (p. ej. una lista que nombra los términos a propósito).
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(root, "scripts", "forbidden-terms.baseline.json");

// Directorios de código vigilados (tal cual pide el brief de infra).
export const SCAN_DIRS = ["app", "components", "lib", "packages", "supabase"];
// Extensiones de texto que tienen sentido escanear.
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".json"]);

// Términos del modo solo-puntos. Stems en minúscula, comparación case-insensitive
// como subcadena ("afiliad" cubre afiliado/afiliada/afiliación; "affiliate" cubre
// affiliate/affiliated). El orden no importa.
export const TERMS = [
  "bizum", "paypal", "wallet", "withdraw", "retirada", "kyc", "affiliate",
  "afiliad", "escrow", "payout", "cashout", "odds", "cuota",
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(p.slice(p.lastIndexOf(".")))) out.push(p);
  }
  return out;
}

/** Recuento de cada término (como subcadena) en un texto, saltando líneas con el marcador de ignorar. */
export function countTerms(text) {
  const counts = {};
  for (const raw of text.split(/\r?\n/)) {
    if (/forbidden-terms:ignore/i.test(raw)) continue;
    const low = raw.toLowerCase();
    for (const t of TERMS) {
      let i = 0, n = 0;
      while ((i = low.indexOf(t, i)) !== -1) { n++; i += t.length; }
      if (n) counts[t] = (counts[t] || 0) + n;
    }
  }
  return counts;
}

/** Escanea los directorios y devuelve { relPath: { term: count } } (solo ficheros con algún término). */
export function scan() {
  const result = {};
  for (const d of SCAN_DIRS) {
    for (const file of walk(join(root, d))) {
      const counts = countTerms(readFileSync(file, "utf8"));
      if (Object.keys(counts).length) result[relative(root, file).split("\\").join("/")] = counts;
    }
  }
  return result;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, "utf8"));
}

function main() {
  const current = scan();

  if (process.argv.includes("--update")) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    const files = Object.keys(current).length;
    const total = Object.values(current).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);
    console.log(`✓ Línea base regenerada: ${files} fichero(s), ${total} ocurrencia(s). Revísala en el diff antes de commitear.`);
    return;
  }

  const base = loadBaseline();
  const violations = [];
  for (const [file, counts] of Object.entries(current)) {
    const baseCounts = base[file] || {};
    for (const [term, n] of Object.entries(counts)) {
      const allowed = baseCounts[term] || 0;
      if (n > allowed) {
        violations.push(
          allowed === 0
            ? `✗ ${file}: término nuevo «${term}» (${n} ocurrencia(s), la base no permite ninguna)`
            : `✗ ${file}: «${term}» sube de ${allowed} a ${n} ocurrencia(s)`,
        );
      }
    }
  }

  if (violations.length) {
    for (const v of violations) console.error(v);
    console.error(
      `\nTérminos de dinero reintroducidos: ${violations.length} incidencia(s) por encima de la línea base.\n` +
      `El modo solo-puntos no admite wallet/kyc/payout/odds/… nuevos en el código. Si es legítimo\n` +
      `(p. ej. retirada de dinero en la rama solo-puntos), regenera la base con:\n` +
      `  node scripts/forbidden-terms.mjs --update`,
    );
    process.exit(1);
  }

  const files = Object.keys(current).length;
  console.log(`✓ Términos de dinero: sin reintroducciones (${files} fichero(s) en la línea base, 0 ocurrencias nuevas).`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
