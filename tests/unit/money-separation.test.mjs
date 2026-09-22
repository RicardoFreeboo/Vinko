// Cero mezcla entre las dos capas (VINKO_MONEY_SPEC §10.6, regla de oro 3):
//   (A) ningún RPC de dinero (money_* / results_feed_*) toca la economía de
//       puntos: points, xp, marcador_total, award_xp, award_score.
//   (B) ningún RPC que escriba puntos o llame a award_xp()/award_score() menciona
//       nada del módulo de dinero (money_*).
// Se comprueba sobre la ÚLTIMA definición de cada función en las migraciones
// (create or replace gana la más reciente), misma técnica que skill-guard.test.mjs.
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const dir = path.resolve("supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

// name(args) returns … $$ body $$   (o $function$ … $function$)
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(?:\$\$|\$function\$)([\s\S]*?)(?:\$\$|\$function\$)/gi;
const bodies = new Map();
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of sql.matchAll(re)) bodies.set(m[1], { file: f, body: m[3] });
}

// Identificador completo (evita falsos positivos: "expired" no contiene el token xp,
// "endpoints" no contiene points).
const word = (tok) => new RegExp(`(?<![a-z0-9_])${tok}(?![a-z0-9_])`, "i");
const PUNTERIA = [word("points"), word("xp"), word("marcador_total"), word("award_xp"), word("award_score")];

// (A) funciones del módulo de dinero
const MONEY_FN = /^(money_|results_feed_)/;
const moneyFns = [...bodies.entries()].filter(([name]) => MONEY_FN.test(name));

test("hay RPCs de dinero que auditar (money_* / results_feed_*)", () => {
  assert(moneyFns.length >= 10, `solo ${moneyFns.length} funciones de dinero encontradas`);
});

for (const [name, { file, body }] of moneyFns) {
  test(`${name} (${file}) no toca la economía de puntos`, () => {
    for (const rx of PUNTERIA) assert(!rx.test(body), `${name} menciona ${rx.source}`);
  });
}

// (B) funciones que escriben puntos o puntúan: no pueden mencionar el módulo de dinero.
const WRITES_POINTS = /profiles\s+set\b[^;]*\bpoints\b/i;   // update profiles set … points …
const CALLS_XP = /\baward_xp\s*\(/i;
const CALLS_SCORE = /\baward_score\s*\(/i;
const writers = [...bodies.entries()].filter(
  ([, { body }]) => WRITES_POINTS.test(body) || CALLS_XP.test(body) || CALLS_SCORE.test(body),
);

test("hay RPCs de puntos que auditar (escriben points o puntúan)", () => {
  assert(writers.length >= 3, `solo ${writers.length} funciones de puntos encontradas`);
});

for (const [name, { file, body }] of writers) {
  test(`${name} (${file}) no menciona el módulo de dinero (money_*)`, () => {
    assert(!/money_/i.test(body), `${name} escribe puntos/puntería y menciona money_`);
  });
}
