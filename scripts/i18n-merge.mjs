// Funde messages/parts/<x>.es.json y <x>.en.json en messages/es.json y en.json.
// Los constructores en paralelo escriben sus claves en `parts/` para no pisarse;
// este script las integra (una sola vez por clave), elimina claves duplicadas
// dentro de cada archivo (se queda la ÚLTIMA definición, como hace JSON.parse)
// y avisa de claves que solo existen en un idioma.
//   node scripts/i18n-merge.mjs          → funde y reescribe es.json / en.json
//   node scripts/i18n-merge.mjs --check  → solo informa
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..");
const dir = path.join(root, "messages");
const check = process.argv.includes("--check");

function readPairs(file) {
  // Conserva el orden y detecta duplicados (JSON.parse los perdería en silencio).
  const txt = fs.readFileSync(file, "utf8");
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm;
  const out = new Map(); const dups = [];
  for (const m of txt.matchAll(re)) {
    const k = JSON.parse(`"${m[1]}"`); const v = JSON.parse(m[2]);
    if (out.has(k)) dups.push(k);
    out.set(k, v);
  }
  const parsed = JSON.parse(txt);
  if (Object.keys(parsed).length !== out.size) throw new Error(`${file}: el parser simple no coincide con JSON.parse`);
  return { map: out, dups };
}

const langs = ["es", "en"];
const base = Object.fromEntries(langs.map((l) => [l, readPairs(path.join(dir, `${l}.json`))]));
for (const l of langs) if (base[l].dups.length) console.log(`· ${l}.json: ${base[l].dups.length} claves duplicadas (se conserva la última): ${base[l].dups.join(", ")}`);

const partsDir = path.join(dir, "parts");
const parts = fs.existsSync(partsDir) ? fs.readdirSync(partsDir).filter((f) => f.endsWith(".json")).sort() : [];
let added = 0;
for (const f of parts) {
  const m = /^(.+)\.(es|en)\.json$/.exec(f);
  if (!m) { console.log(`· parts/${f}: nombre no reconocido, se ignora`); continue; }
  const lang = m[2];
  const obj = JSON.parse(fs.readFileSync(path.join(partsDir, f), "utf8"));
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== "string") continue;
    if (!base[lang].map.has(k)) added++;
    base[lang].map.set(k, v);
  }
}

const onlyEs = [...base.es.map.keys()].filter((k) => !base.en.map.has(k));
const onlyEn = [...base.en.map.keys()].filter((k) => !base.es.map.has(k));
// Si falta en un idioma, se copia del otro para no romper t(); queda avisado.
for (const k of onlyEs) base.en.map.set(k, base.es.map.get(k));
for (const k of onlyEn) base.es.map.set(k, base.en.map.get(k));
if (onlyEs.length) console.log(`· solo en es (copiadas a en): ${onlyEs.join(", ")}`);
if (onlyEn.length) console.log(`· solo en en (copiadas a es): ${onlyEn.join(", ")}`);
console.log(`· ${parts.length} archivos en parts, ${added} claves nuevas, total es=${base.es.map.size} en=${base.en.map.size}`);

if (!check) {
  for (const l of langs) {
    const obj = Object.fromEntries(base[l].map);
    fs.writeFileSync(path.join(dir, `${l}.json`), JSON.stringify(obj, null, 2) + "\n");
  }
  console.log("✓ es.json y en.json reescritos");
}
