// 0059 — fallos latentes del 3-oct-2026 + guardia SEC-01 (0055). Estático, sin
// red: mira la ÚLTIMA definición de cada función (la que manda en producción).
// El comportamiento real lo prueba tests/sql/latentes.test.sql (Postgres local).
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, assert, ROOT } from "./_harness.mjs";

const MIG = join(ROOT, "supabase/migrations");
const migs = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

// Cuerpo de la última definición de public.<name>(…) entre todas las migraciones.
function latestFn(name) {
  const re = new RegExp(String.raw`create\s+or\s+replace\s+function\s+(?:public\.)?${name}\s*\([\s\S]*?\$\$([\s\S]*?)\$\$`, "gi");
  let found = null;
  for (const f of migs) {
    for (const m of readFileSync(join(MIG, f), "utf8").matchAll(re)) found = { file: f, body: m[1] };
  }
  assert.ok(found, `no se encuentra la definición de ${name}`);
  return found;
}

// Columnas públicas de profiles: las del grant de SEC-01 (0055).
const PUBLIC_COLS = (() => {
  const src = readFileSync(join(MIG, "0055_sec01_profiles_private.sql"), "utf8");
  const m = src.match(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.profiles/i);
  assert.ok(m, "0055 debe conceder select por columnas en profiles");
  return new Set(m[1].split(",").map((c) => c.trim()).filter(Boolean));
})();

const ECONOMIA = /\bpoints\b|\bxp\b|marcador_total|award_xp|award_score/;

test("0059.1 safer_play_set_limit construye 'limits' en vez de jsonb_set anidado", () => {
  const { file, body } = latestFn("safer_play_set_limit");
  assert.ok(file >= "0059", `la definición vigente debe ser la de 0059 (es ${file})`);
  assert.ok(!/jsonb_set\s*\(\s*v\s*,\s*array\['limits'/.test(body), "jsonb_set con ruta anidada no crea 'limits' y no guarda nada");
  assert.match(body, /jsonb_build_object\('limits'/, "debe reescribir el objeto limits entero");
  assert.match(body, /p_period not in \('daily', 'weekly', 'monthly'\)/, "valida el periodo");
  assert.match(body, /p_minor < 0/, "rechaza importes negativos");
  assert.ok(!ECONOMIA.test(body), "Juego más seguro no toca la economía de puntos");
});

test("0059.2 profile_public filtra invitados y borrados y solo da columnas públicas", () => {
  const { body } = latestFn("profile_public");
  assert.match(body, /not\s+coalesce\(p\.is_anonymous,\s*false\)/, "debe excluir invitados (0040)");
  assert.match(body, /p\.deleted_at\s+is\s+null/, "debe excluir cuentas borradas (0037)");
  const keys = [...body.matchAll(/'([a-z_]+)',\s*p\.[a-z_]+/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, "no se encuentran las claves devueltas");
  for (const k of keys) assert.ok(PUBLIC_COLS.has(k), `profile_public devuelve '${k}', que no es columna pública (0055)`);
  const src = readFileSync(join(MIG, migs.filter((f) => readFileSync(join(MIG, f), "utf8").includes("function public.profile_public")).pop()), "utf8");
  assert.match(src, /grant execute on function public\.profile_public\(text\) to anon, authenticated/, "la OG sin sesión la llama con anon");
});

test("0059.3 club_apply_event no pisa con nulls, protege el estado ante el checkout y mapea estados", () => {
  const { file, body } = latestFn("club_apply_event");
  assert.ok(file >= "0059", `la definición vigente debe ser la de 0059 (es ${file})`);
  assert.match(body, /plan\s*=\s*coalesce\(p_plan,\s*club_subscriptions\.plan\)/, "un plan ausente no pisa el guardado");
  assert.match(body, /current_period_end\s*=\s*coalesce\(p_period_end,\s*club_subscriptions\.current_period_end\)/, "fecha ausente no pisa");
  assert.match(body, /cancel_at_period_end\s*=\s*coalesce\(p_cancel,\s*club_subscriptions\.cancel_at_period_end\)/, "cancel ausente no pisa");
  assert.match(body, /checkout\.session\.completed/, "el checkout no cambia el estado de una suscripción conocida");
  assert.match(body, /incomplete_expired/, "mapea estados de Stripe fuera del enum");
  assert.ok(!/coalesce\(p_status,\s*'none'\)::club_status/.test(body), "el cast directo rompe con estados desconocidos (22P02)");
  assert.match(body, /coalesce\(v_final_end,\s*club_until\)/, "club_until nunca pasa a null por un evento sin fecha");
  assert.ok(!ECONOMIA.test(body), "el Club no toca la economía de puntos");
});

test("0059.3 billing-webhook: fecha de fin de la API nueva y plan desconocido = null", () => {
  const src = readFileSync(join(ROOT, "supabase/functions/billing-webhook/index.ts"), "utf8");
  assert.match(src, /itemsPeriodEnd\(obj\.items\)/, "current_period_end también desde items (API basil)");
  assert.ok(!/"annual"\s*:\s*"monthly"\s*;/.test(src), "planFromItems no debe inventar 'monthly' cuando no lo sabe");
  const toml = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
  assert.match(toml, /\[functions\.billing-webhook\]\s*\nverify_jwt\s*=\s*false/, "Stripe no lleva JWT: la firma lo sustituye");
});

// ── Guardia SEC-01: nada vuelve a leer de profiles columnas privadas ─────────
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "node_modules") out.push(...walk(p)); }
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

// Fallbacks para bases SIN 0055 (solo corren si la RPC equivalente no existe).
const FALLBACK_PRE_0055 = {
  "lib/me.ts": new Set(["*"]),                                         // fetchMe sin me()
  "app/api/admin/kpi-chat/route.ts": new Set(["referred_by", "role"]), // sin admin_kpi_profiles()
};

test("SEC-01: los select literales a profiles solo piden columnas públicas", () => {
  const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
  const bad = [];
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, "/");
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/from\(\s*["']profiles["']\s*\)\s*\.select\(\s*(["'])([^"']*)\1/g)) {
      const cols = m[2].split(",").map((c) => c.trim()).filter(Boolean);
      for (const c of cols) {
        if (FALLBACK_PRE_0055[rel]?.has(c)) continue;
        if (!PUBLIC_COLS.has(c)) bad.push(`${rel}: '${c}'`);
      }
    }
  }
  assert.deepEqual(bad, [], `columnas privadas leídas directamente (usa me()/RPC): ${bad.join(" · ")}`);
});

test("SEC-01: afiliación y cartera no leen profiles directamente", () => {
  for (const rel of ["components/AffiliateSlot.tsx", "app/cartera/actions.ts"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.ok(!/from\(\s*["']profiles["']\s*\)/.test(src), `${rel} debe usar la sesión (me()) o una RPC`);
  }
});
