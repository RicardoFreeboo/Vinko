// Vinko Ads · Fase 2 (0072, «los gustos»): invariantes estáticos de la
// migración. El comportamiento se prueba en tests/sql/ads_gustos.test.sql.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, ROOT } from "./_harness.mjs";

const sql = readFileSync(join(ROOT, "supabase/migrations/0072_ads_user_profile.sql"), "utf8");
const code = sql.replace(/--.*$/gm, "");

await test("ads-gustos: todas las tablas ads_* nuevas tienen RLS", () => {
  const tables = [...code.matchAll(/create table if not exists public\.(ads_\w+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 7, `esperaba ≥ 7 tablas, hay ${tables.length}`);
  const rlsList = code.match(/foreach t in array array\[([^\]]+)\]/)?.[1] ?? "";
  for (const t of tables) assert.ok(rlsList.includes(`'${t}'`), `${t} no está en el bucle de RLS`);
  assert.match(code, /enable row level security/);
  assert.match(code, /revoke all on public\.%I from anon, authenticated/);
});

await test("ads-gustos: A7 — política, religión y salud fuera siempre", () => {
  const sens = code.match(/ads_sensitive_categories\(\) returns text\[\][\s\S]*?array\[([^\]]+)\]/)?.[1] ?? "";
  for (const c of ["politica", "religion", "salud"]) assert.ok(sens.includes(`'${c}'`), `falta ${c}`);
  const interests = code.match(/ads_interest_ids\(\) returns text\[\][\s\S]*?array\[([^\]]+)\]/)?.[1] ?? "";
  for (const c of ["politica", "religion", "salud"]) assert.ok(!interests.includes(`'${c}'`), `${c} no puede ser interés`);
  assert.match(code, /constraint ads_user_profile_no_sensitive check/);
  assert.match(code, /VINKO_ADS_SENSITIVE/);
});

await test("ads-gustos: ninguna RPC expuesta acepta un user_id", () => {
  // las listas van tras un comentario-ancla: se buscan en el SQL con comentarios
  const exposed = sql.match(/del usuario \(identidad = auth\.uid\(\)\)[\s\S]*?array\[([^\]]+)\]/)?.[1] ?? "";
  const sigs = [...exposed.matchAll(/'public\.(\w+)\(([^)]*)\)'/g)];
  assert.ok(sigs.length >= 5, "no encuentro la lista de RPC expuestas");
  for (const [, name] of sigs) {
    const def = code.match(new RegExp(`function public\\.${name}\\(([^)]*)\\)`))?.[1] ?? "";
    assert.ok(!/p_user|p_uid|user_id/i.test(def), `${name}(${def}) no puede recibir un user_id`);
  }
  // las que sí reciben un uid son internas: revocadas a anon y authenticated
  const internal = sql.match(/internas: solo el propietario[\s\S]*?array\[([^\]]+)\]/)?.[1] ?? "";
  for (const fn of ["ads_is_adult", "ads_age_band", "ads_holdout_bucket", "ads_profile_refresh", "ads_sides_refresh"]) {
    assert.ok(internal.includes(fn), `${fn} debía ser interna`);
  }
});

await test("ads-gustos: toda función security definer fija search_path", () => {
  const defs = [...code.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$/g)];
  for (const m of defs) {
    if (/security definer/.test(m[0])) assert.match(m[0], /set search_path = public/, `${m[1]} sin search_path`);
  }
});

await test("ads-gustos: trabajos diarios a las 00:10 y 00:20 de Bogotá (UTC)", () => {
  assert.match(code, /cron\.schedule\('vinko-ads-profile-refresh', '10 5 \* \* \*'/);
  assert.match(code, /cron\.schedule\('vinko-ads-sides-refresh',\s+'20 5 \* \* \*'/);
});

await test("ads-gustos: el onboarding pide fecha completa y la guarda por RPC", () => {
  const onb = readFileSync(join(ROOT, "components/OnboardingFlow.tsx"), "utf8");
  assert.match(onb, /type="date"/);
  assert.match(onb, /rpc\("set_birth_date"/);
  const cb = readFileSync(join(ROOT, "app/auth/callback/route.ts"), "utf8");
  assert.match(cb, /rpc\("ads_touch_location"/);
});
