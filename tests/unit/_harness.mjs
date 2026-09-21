// Mini-harness de tests unitarios, sin runner externo: `assert` de Node + jiti
// para importar los .ts de lib/ tal cual (alias "@" → raíz del repo, como en
// tsconfig). Cada fichero tests/unit/*.test.mjs importa `test` de aquí y
// tests/unit/run.mjs los carga todos y lee `results`.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export { assert };
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// jiti llega hoy como dependencia transitiva (@tailwindcss/node → jiti ^2.7),
// fijada en package-lock. Si algún día desaparece, el mensaje lo dice claro.
let createJiti;
try {
  ({ createJiti } = await import("jiti"));
} catch {
  console.error("✗ tests/unit: falta el paquete «jiti» (carga los .ts de lib/). Instálalo: npm i -D jiti");
  process.exit(1);
}
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

/** Importa un módulo TS del repo por ruta relativa a la raíz: loadTs("lib/cover.ts"). */
export const loadTs = (rel) => jiti.import(`@/${rel.replace(/^\/+/, "")}`);

// Resultados compartidos entre ficheros (los módulos ES son singleton por URL).
export const results = { pass: 0, fail: 0, failures: [] };

export async function test(name, fn) {
  try {
    await fn();
    results.pass++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.fail++;
    results.failures.push(name);
    const msg = String(e?.stack ?? e?.message ?? e).split("\n").slice(0, 4).join("\n        ");
    console.log(`  FAIL  ${name}\n        ${msg}`);
  }
}
