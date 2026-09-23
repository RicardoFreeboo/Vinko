// Afiliación a operador licenciado (0049, regla de oro 5). Cortafuegos estático:
// no toca puntos, la atribución viaja como HASH (nunca el id en claro en la URL),
// exige age-gate +18 y que la afiliación del país esté habilitada, y el alta de
// admin exige {subid} y base legal. Está apagado por defecto.
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const sql = fs.readFileSync(path.resolve("supabase/migrations/0049_affiliate.sql"), "utf8");
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
const fns = new Map();
for (const m of sql.matchAll(re)) fns.set(m[1], m[3]);

const word = (tok) => new RegExp(`(?<![a-z0-9_])${tok}(?![a-z0-9_])`, "i");
const PUNTERIA = [word("points"), word("xp"), word("marcador_total"), word("award_xp"), word("award_score")];

test("0049 define affiliate_go / affiliate_link_upsert / affiliate_offer", () => {
  for (const n of ["affiliate_go", "affiliate_link_upsert", "affiliate_offer"]) assert(fns.has(n), `falta ${n}`);
});

test("ninguna función de afiliación toca la economía de puntos", () => {
  for (const [n, body] of fns) for (const rx of PUNTERIA) assert(!rx.test(body), `${n} menciona ${rx.source}`);
});

test("affiliate_go: el subid es un hash y no filtra el id en claro en la URL", () => {
  const body = fns.get("affiliate_go");
  assert(/md5\(auth\.uid\(\)/.test(body), "el subid/hash debe derivar de md5(auth.uid()…)");
  assert(/\{subid\}/.test(body), "debe resolver {subid} en la plantilla");
  // No se devuelve el id en claro: el return es la URL con el subid, no auth.uid().
  assert(!/return\s+auth\.uid\(\)/.test(body), "no debe devolver el id en claro");
});

test("affiliate_go: age-gate +18 y afiliación habilitada", () => {
  const body = fns.get("affiliate_go");
  assert(/birth_year/.test(body) && /< 18/.test(body), "debe exigir +18 declarado");
  assert(/affiliate'->>'enabled'/.test(body), "debe exigir affiliate.enabled del país");
  assert(/VINKO_NOT_GUEST/.test(body), "no permite invitados");
});

test("affiliate_link_upsert: solo admin, exige {subid} y base legal", () => {
  const body = fns.get("affiliate_link_upsert");
  assert(/is_admin\(\)/.test(body), "solo admin");
  assert(/\{subid\}/.test(body) && /NO_SUBID/.test(body), "exige {subid} en la plantilla");
  assert(/NO_LEGAL_BASIS/.test(body), "exige base legal (contrato/piloto)");
});
