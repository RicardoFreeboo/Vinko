#!/usr/bin/env node
// Siembra idempotente de secretos de BD por entorno (C1). Hoy: cron_secret, la
// fila de internal.secrets que leen los crons (0009/0060) para la cabecera
// x-cron-secret. Si falta, la Edge Function responde 403 y, como pg_net es
// fire-and-forget, el push NO sale y NADIE se entera. Este script la crea/actualiza
// y comprueba que la BD queda con el valor del env CRON_SECRET.
//
//   # por Management API (token personal):
//   CRON_SECRET=xxxx SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=<ref> \
//     node scripts/seed-secrets.mjs
//   # o por psql directo (Session pooler con contraseña):
//   CRON_SECRET=xxxx SUPABASE_DB_URL='postgresql://...' node scripts/seed-secrets.mjs
//
// IMPORTANTE: este MISMO valor de CRON_SECRET debe estar como secreto del lado
// Edge (CRON_SECRET en las variables del proyecto Supabase). Si no coinciden, la
// función responde 403. Este script no puede leer el secreto del Edge; valida el
// lado BD y te recuerda alinear el Edge. Ver RUNBOOK-INFRA.md (inventario).
import { spawnSync } from "node:child_process";

const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const cronSecret = process.env.CRON_SECRET ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";
const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const ref = process.env.SUPABASE_PROJECT_REF ?? "";

if (!cronSecret) fail("falta CRON_SECRET en el entorno (el valor a sembrar en internal.secrets.cron_secret).");
if (!dbUrl && (!token || !ref)) {
  fail("faltan credenciales: SUPABASE_DB_URL, o bien SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF.");
}

// Dollar-quoting con tag improbable para no tener que escapar el secreto.
const TAG = "vinko_seed_x9";
if (cronSecret.includes(`$${TAG}$`)) fail("el CRON_SECRET contiene el tag de dollar-quoting; usa otro valor.");

// Ejecuta SQL y devuelve el texto de respuesta (Management API) o '' (psql).
function runSql(sql) {
  if (dbUrl) {
    const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" });
    if (r.status !== 0) fail(`psql falló: ${r.stderr || r.stdout}`);
    return (r.stdout ?? "").trim();
  }
  const r = spawnSync("curl", [
    "-sS", "-X", "POST", `https://api.supabase.com/v1/projects/${ref}/database/query`,
    "-H", `Authorization: Bearer ${token}`, "-H", "Content-Type: application/json",
    "--data-binary", "@-",
  ], { input: JSON.stringify({ query: sql }), encoding: "utf8" });
  if (r.status !== 0) fail(`curl falló: ${r.stderr || r.stdout}`);
  return (r.stdout ?? "").trim();
}

// 1) Upsert idempotente.
runSql(
  `insert into internal.secrets(key, value) values ('cron_secret', $${TAG}$${cronSecret}$${TAG}$)\n` +
  `on conflict (key) do update set value = excluded.value;`,
);

// 2) Verificar que la BD quedó con el valor esperado, SIN imprimir el secreto.
const check = runSql(
  `select (value = $${TAG}$${cronSecret}$${TAG}$) as ok from internal.secrets where key = 'cron_secret';`,
);
const ok = /(^|[\s:"[])t(rue)?([\s,"\]]|$)/i.test(check) || /"ok"\s*:\s*true/i.test(check) || check.trim() === "t";
if (!ok) fail(`la BD no quedó con el cron_secret esperado (respuesta: ${check.slice(0, 200)}).`);

console.log("✓ internal.secrets.cron_secret sembrado y verificado en la BD.");
console.log("  Recuerda: el secreto CRON_SECRET del lado Edge debe tener EXACTAMENTE este mismo valor.");
