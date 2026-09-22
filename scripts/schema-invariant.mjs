#!/usr/bin/env node
// Invariante de esquema en VIVO (VINKO_MONEY_SPEC §10.1, regla de oro 1).
// Llama al RPC money_schema_invariant() en la base real por REST y falla (exit 1)
// si devuelve alguna fila: una columna de saldo/tarjeta/cuenta ligada a un usuario.
// El RPC (0045 §10) es de solo lectura, ejecutable por el rol anon.
//
// El complemento estático (sin base de datos) es tests/unit/money-invariant.test.mjs,
// que recorre las migraciones. Este script comprueba lo que hay DESPLEGADO.
//
// Variables: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY, de
// process.env o de .env.local. Sin ellas: AVISA y sale 0 (como i18n-parity cuando
// falta su script), para no romper CI/predeploy en entornos sin secretos.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// process.env manda; .env.local rellena lo que falte (KEY=valor, comillas opcionales).
function loadEnv() {
  const env = { ...process.env };
  const file = join(root, ".env.local");
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (env[key] === undefined) env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.log("• Invariante de esquema · AVISO: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (env o .env.local). Paso omitido.");
  process.exit(0);
}

const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/money_schema_invariant`;
let res;
try {
  res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: "{}",
  });
} catch (e) {
  console.error(`✗ Invariante de esquema: no se pudo llamar a ${endpoint} (${e?.message ?? e}).`);
  process.exit(1);
}

const text = await res.text();
// La migración 0045 aún puede no estar aplicada en la base apuntada (otros
// constructores / deploys ajenos al módulo de dinero). Si el RPC no existe,
// AVISA y sale 0 (misma «omisión» que sin env): no rompe deploys ajenos.
if (res.status === 404 || /PGRST202|Could not find the function|does not exist/i.test(text)) {
  console.log("• Invariante de esquema · AVISO: money_schema_invariant() no existe en la base (¿migración 0045 sin aplicar?). Paso omitido.");
  process.exit(0);
}
if (!res.ok) {
  console.error(`✗ Invariante de esquema: HTTP ${res.status} de money_schema_invariant. ${text.slice(0, 300)}`);
  process.exit(1);
}

let rows;
try { rows = JSON.parse(text); } catch { console.error(`✗ Invariante de esquema: respuesta no-JSON. ${text.slice(0, 300)}`); process.exit(1); }
if (!Array.isArray(rows)) { console.error(`✗ Invariante de esquema: se esperaba una lista de filas. ${text.slice(0, 300)}`); process.exit(1); }

if (rows.length > 0) {
  console.error(`✗ Invariante de esquema VIOLADO: ${rows.length} columna(s) de dinero ligadas a usuario:`);
  for (const r of rows) console.error(`  · ${r.table_name}.${r.column_name}`);
  console.error("Regla de oro 1: el núcleo guarda referencias, jamás saldos de usuario. Revierte la columna.");
  process.exit(1);
}

console.log("✓ Invariante de esquema: 0 columnas de dinero ligadas a usuario en la base real.");
process.exit(0);
