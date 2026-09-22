#!/usr/bin/env node
// Puerta previa al deploy: encadena los checks y PARA en el primero que falle.
//   node scripts/predeploy.mjs              → todo, incluido `npm run build`
//   node scripts/predeploy.mjs --no-build   → sin build (rápido, para iterar)
//   node scripts/predeploy.mjs --e2e        → además, smoke E2E contra BASE_URL
//                                             (producción por defecto; solo lectura)
// Orden: léxico → paridad i18n → tests unitarios → invariante de esquema → tsc → build [→ e2e].
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));

const STEPS = [
  { name: "Léxico prohibido (copy pública + migraciones ≥ 0030)", cmd: "node scripts/lexicon-check.mjs" },
  { name: "Paridad i18n es/en", cmd: "node scripts/i18n-parity.mjs", needsFile: "scripts/i18n-parity.mjs" },
  { name: "Tests unitarios", cmd: "node tests/unit/run.mjs" },
  { name: "Invariante de esquema de dinero (base real)", cmd: "node scripts/schema-invariant.mjs", needsFile: "scripts/schema-invariant.mjs" },
  { name: "TypeScript (tsc --noEmit)", cmd: "npx tsc --noEmit" },
  { name: "Build de Next (npm run build)", cmd: "npm run build", skipFlag: "--no-build" },
  { name: "Smoke E2E (tests/e2e/smoke.mjs)", cmd: "node tests/e2e/smoke.mjs", onlyFlag: "--e2e" },
];

const steps = STEPS.filter((s) => !s.onlyFlag || args.has(s.onlyFlag));
const t0 = Date.now();
let done = 0;

for (const [i, s] of steps.entries()) {
  const tag = `[${i + 1}/${steps.length}]`;
  if (s.skipFlag && args.has(s.skipFlag)) {
    console.log(`\n${tag} ${s.name} · omitido (${s.skipFlag})`);
    continue;
  }
  if (s.needsFile && !existsSync(join(root, s.needsFile))) {
    console.log(`\n${tag} ${s.name} · AVISO: falta ${s.needsFile}, paso omitido. Crea el script (o quítalo de scripts/predeploy.mjs).`);
    continue;
  }
  console.log(`\n${tag} ${s.name}\n    $ ${s.cmd}`);
  const t1 = Date.now();
  const r = spawnSync(s.cmd, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  const secs = ((Date.now() - t1) / 1000).toFixed(1);
  if (r.status !== 0) {
    const code = r.status ?? `señal ${r.signal}`;
    console.error(`\n✗ PREDEPLOY DETENIDO en ${tag} «${s.name}» (salida ${code}, ${secs} s). No despliegues hasta arreglarlo.`);
    process.exit(typeof r.status === "number" && r.status !== 0 ? r.status : 1);
  }
  done++;
  console.log(`    ✓ ${s.name} (${secs} s)`);
}

console.log(`\n✓ Predeploy OK: ${done} paso(s) en ${((Date.now() - t0) / 1000).toFixed(1)} s${args.has("--no-build") ? " (sin build)" : ""}. Listo para desplegar.`);
