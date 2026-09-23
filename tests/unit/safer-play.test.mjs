// Juego más seguro (0051, §5.11 / RD 176/2023). Cortafuegos y reglas: no toca
// puntos, la autoexclusión solo se extiende (nunca se acorta) y valida periodos.
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const sql = fs.readFileSync(path.resolve("supabase/migrations/0051_safer_play.sql"), "utf8");
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
const fns = new Map();
for (const m of sql.matchAll(re)) fns.set(m[1], m[3]);

const word = (tok) => new RegExp(`(?<![a-z0-9_])${tok}(?![a-z0-9_])`, "i");
const PUNTERIA = [word("points"), word("xp"), word("marcador_total"), word("award_xp"), word("award_score")];

test("0051 define safer_play_get / self_exclude / set_limit", () => {
  for (const n of ["safer_play_get", "safer_play_self_exclude", "safer_play_set_limit"]) assert(fns.has(n), `falta ${n}`);
});

test("juego seguro no toca la economía de puntos", () => {
  for (const [n, body] of fns) for (const rx of PUNTERIA) assert(!rx.test(body), `${n} menciona ${rx.source}`);
});

test("autoexclusión: valida periodo y NO se puede acortar", () => {
  const b = fns.get("safer_play_self_exclude");
  assert(/p_days not in \(30, 90, 180, 365\)/.test(b), "periodos válidos");
  assert(/v_prev is not null and v_prev > v_new then v_new := v_prev/.test(b), "no acortar una exclusión vigente");
  assert(/self_exclusion_activated/.test(b), "emite el evento");
});

test("límites: valida periodo e importe no negativo", () => {
  const b = fns.get("safer_play_set_limit");
  assert(/p_period not in \('daily', 'weekly', 'monthly'\)/.test(b), "periodos");
  assert(/p_minor < 0/.test(b), "no negativo");
});

test("safer_play es jsonb (preferencia), no una columna de saldo", () => {
  assert(/add column if not exists safer_play jsonb/.test(sql), "jsonb, no _minor/_amount");
});
