// Runner de tests unitarios: importa todos los tests/unit/*.test.mjs en orden
// alfabético y sale con código 1 si falla alguno (o si un fichero no carga).
//   node tests/unit/run.mjs   ·   npm run test:unit
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { results } from "./_harness.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort();
const t0 = Date.now();

for (const f of files) {
  console.log(`\n${f}`);
  try {
    await import(pathToFileURL(join(dir, f)).href);
  } catch (e) {
    results.fail++;
    results.failures.push(`${f} (no carga)`);
    console.log(`  FAIL  ${f} no se pudo cargar\n        ${e?.stack ?? e}`);
  }
}

console.log(`\n${results.pass} OK · ${results.fail} fallo(s) · ${files.length} fichero(s) · ${Date.now() - t0} ms`);
if (results.fail) {
  console.log(`Fallan: ${results.failures.join(", ")}`);
  process.exit(1);
}
