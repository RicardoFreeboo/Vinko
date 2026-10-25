#!/usr/bin/env node
// Puerta previa al deploy: encadena los checks y PARA en el primero que falle.
//   node scripts/predeploy.mjs              → todo, incluido `npm run build`
//   node scripts/predeploy.mjs --no-build   → sin build (rápido, para iterar)
//   node scripts/predeploy.mjs --e2e        → además, smoke E2E contra BASE_URL
//                                             (producción por defecto; solo lectura)
// Orden: léxico → términos prohibidos → paridad i18n → unit → invariante de
//        esquema → SQL (migraciones+tests) → ESLint → tsc → build [→ e2e].
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));

// ¿Hay un Postgres servible en local (initdb/pg_ctl)? tests/sql/run.sh lo necesita.
// Si no, el paso se OMITE con aviso (igual que i18n-parity o schema-invariant sin
// sus requisitos): en CI sí está, así que allí bloquea de verdad.
function hasLocalPostgres() {
  const r = spawnSync("sh", ["-c", "ls -d /usr/lib/postgresql/*/bin >/dev/null 2>&1 || command -v pg_ctl >/dev/null 2>&1"], { cwd: root });
  return r.status === 0;
}

const STEPS = [
  { name: "Léxico prohibido (copy pública + migraciones ≥ 0030)", cmd: "node scripts/lexicon-check.mjs" },
  { name: "Términos de dinero fuera de src/ (candado solo-puntos)", cmd: "node scripts/forbidden-terms.mjs", needsFile: "scripts/forbidden-terms.mjs" },
  { name: "Paridad i18n es/en", cmd: "node scripts/i18n-parity.mjs", needsFile: "scripts/i18n-parity.mjs" },
  { name: "Tests unitarios", cmd: "node tests/unit/run.mjs" },
  { name: "Invariante de esquema de dinero (base real)", cmd: "node scripts/schema-invariant.mjs", needsFile: "scripts/schema-invariant.mjs" },
  { name: "SQL: migraciones desde cero + tests (tests/sql/run.sh)", cmd: "bash tests/sql/run.sh", needsFile: "tests/sql/run.sh", probe: hasLocalPostgres, probeMsg: "no hay Postgres local (initdb/pg_ctl)" },
  { name: "ESLint (eslint .)", cmd: "npx eslint .", needsFile: "eslint.config.mjs" },
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
  if (s.probe && !s.probe()) {
    console.log(`\n${tag} ${s.name} · AVISO: ${s.probeMsg ?? "requisito no disponible"}, paso omitido (en CI sí corre).`);
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
