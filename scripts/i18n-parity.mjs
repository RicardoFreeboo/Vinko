// Paridad i18n (ALPHA FREEZE: cero strings hardcoded, mismas claves en es/en).
// Falla (exit 1) si:
//  · los conjuntos de claves de messages/es.json y messages/en.json difieren;
//  · alguna clave estática t("clave") usada en app/, components/ o lib/ no
//    existe en es.json (las claves con template literal t(`…${x}`) se ignoran).
// Avisa (sin fallar) de claves duplicadas dentro de un mismo JSON (JSON.parse
// se queda con la última en silencio).
// Uso: node scripts/i18n-parity.mjs [--parts]   (--parts: cuenta también
//      messages/parts/*.es.json / *.en.json aún no fusionados)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const withParts = process.argv.includes("--parts");
const SCAN_DIRS = ["app", "components", "lib"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const T_RX = /\bt\(\s*"([^"]+)"/g;

function loadJson(rel) {
  const raw = readFileSync(join(root, rel), "utf8");
  const json = JSON.parse(raw);
  // claves duplicadas en el fichero (no las ve JSON.parse)
  const seen = new Map();
  for (const m of raw.matchAll(/^\s*"((?:[^"\\]|\\.)+)"\s*:/gm)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  const dups = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  return { json, dups };
}

function partsFor(lang) {
  const dir = join(root, "messages", "parts");
  if (!existsSync(dir)) return {};
  let out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(`.${lang}.json`)).sort()) {
    out = { ...out, ...JSON.parse(readFileSync(join(dir, f), "utf8")) };
  }
  return out;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== "node_modules" && name !== ".next") yield* walk(p); }
    else if (EXT.has(p.slice(p.lastIndexOf(".")))) yield p;
  }
}

const es = loadJson("messages/es.json");
const en = loadJson("messages/en.json");
let esKeys = new Set(Object.keys(es.json));
let enKeys = new Set(Object.keys(en.json));
if (withParts) {
  for (const k of Object.keys(partsFor("es"))) esKeys.add(k);
  for (const k of Object.keys(partsFor("en"))) enKeys.add(k);
}

let fail = false;
for (const [file, dups] of [["messages/es.json", es.dups], ["messages/en.json", en.dups]]) {
  if (dups.length) console.warn(`! ${file}: ${dups.length} clave(s) duplicada(s) (gana la última): ${dups.join(", ")}`);
}

const onlyEs = [...esKeys].filter((k) => !enKeys.has(k)).sort();
const onlyEn = [...enKeys].filter((k) => !esKeys.has(k)).sort();
if (onlyEs.length || onlyEn.length) {
  fail = true;
  if (onlyEs.length) console.error(`✗ Solo en es.json (${onlyEs.length}):\n  ${onlyEs.join("\n  ")}`);
  if (onlyEn.length) console.error(`✗ Solo en en.json (${onlyEn.length}):\n  ${onlyEn.join("\n  ")}`);
}

// claves usadas en código
const used = new Map(); // key → [file:line]
for (const dir of SCAN_DIRS) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(T_RX)) {
      const line = src.slice(0, m.index).split("\n").length;
      const where = `${relative(root, file).replaceAll("\\", "/")}:${line}`;
      if (!used.has(m[1])) used.set(m[1], []);
      used.get(m[1]).push(where);
    }
  }
}
const missing = [...used].filter(([k]) => !esKeys.has(k)).sort(([a], [b]) => a.localeCompare(b));
if (missing.length) {
  fail = true;
  console.error(`✗ Claves usadas en código y ausentes en es.json${withParts ? " (+parts)" : ""} (${missing.length}):`);
  for (const [k, where] of missing) console.error(`  ${k}  ← ${where.slice(0, 3).join(", ")}${where.length > 3 ? ` (+${where.length - 3})` : ""}`);
}

if (fail) {
  console.error("\nParidad i18n: FALLO.");
  process.exit(1);
}
console.log(`✓ Paridad i18n: ${esKeys.size} claves es/en iguales · ${used.size} claves estáticas en código, todas presentes${withParts ? " (contando parts)" : ""}.`);
