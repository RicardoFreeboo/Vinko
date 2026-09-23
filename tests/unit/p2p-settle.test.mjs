// P2P sin custodia (0048). Dos cosas:
//  (A) La matemática del reparto: réplica en JS del algoritmo voraz de
//      p2p_pool_resolve() para fijar el contrato (céntimos enteros, exacto,
//      determinista). Si el SQL cambia, este test debe seguir cuadrando.
//  (B) Cortafuegos legal: ninguna función p2p_* toca la economía de puntos, y
//      money_schema_invariant() documenta las excepciones P2P (no hay saldos).
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

// -- (A) réplica del reparto (mismo orden y redondeo que el plpgsql) ----------
function settle(stakeMinor, winners, losers) {
  const W = winners.length, L = losers.length;
  if (W === 0 || L === 0) return [];
  const pot = L * stakeMinor;
  const base = Math.floor(pot / W);
  const rem = pot - base * W;
  const cre = [...winners].sort();            // order by user_id
  const creAmt = cre.map((_, k) => base + (k < rem ? 1 : 0));
  const deb = [...losers].sort();
  const edges = [];
  let j = 0;
  for (const from of deb) {
    let owe = stakeMinor;
    while (owe > 0) {
      const m = Math.min(owe, creAmt[j]);
      edges.push({ from, to: cre[j], amount: m });
      owe -= m; creAmt[j] -= m;
      if (creAmt[j] === 0) j++;
    }
  }
  return edges;
}

const sum = (a) => a.reduce((s, x) => s + x, 0);
const byUser = (edges, key) => edges.reduce((m, e) => ((m[e[key]] = (m[e[key]] || 0) + e.amount), m), {});

function checkConservation(stake, winners, losers) {
  const edges = settle(stake, winners, losers);
  const pot = losers.length * stake;
  assert(edges.every((e) => Number.isInteger(e.amount) && e.amount > 0), "importes enteros y positivos");
  assert(sum(edges.map((e) => e.amount)) === pot, `el total movido = ${pot}`);
  const paid = byUser(edges, "from");
  for (const l of losers) assert(paid[l] === stake, `${l} paga su entrada (${stake})`);
  const got = byUser(edges, "to");
  const base = Math.floor(pot / winners.length), rem = pot - base * winners.length;
  [...winners].sort().forEach((w, k) => assert(got[w] === base + (k < rem ? 1 : 0), `${w} cobra su parte`));
  return edges;
}

test("reparto: 2 ganan, 2 pierden, 10€", () => { checkConservation(1000, ["c", "d"], ["a", "b"]); });
test("reparto: 1 gana, 2 pierden", () => { checkConservation(1000, ["z"], ["a", "b"]); });
test("reparto: 2 ganan, 1 pierde (mitades)", () => { checkConservation(1000, ["y", "z"], ["a"]); });
test("reparto: 3 ganan, 1 pierde (con céntimo sobrante)", () => {
  const edges = checkConservation(1000, ["x", "y", "z"], ["a"]);
  const got = byUser(edges, "to");
  assert(Math.max(...Object.values(got)) - Math.min(...Object.values(got)) <= 1, "diferencia máx. 1 céntimo");
});
test("reparto: nadie acierta → sin transferencias", () => { assert(settle(1000, [], ["a", "b", "c"]).length === 0); });
test("reparto: aciertan todos → sin transferencias", () => { assert(settle(1000, ["a", "b"], []).length === 0); });

// -- (B) cortafuegos legal en 0048 -------------------------------------------
const sql = fs.readFileSync(path.resolve("supabase/migrations/0048_p2p_settle.sql"), "utf8");
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
const p2pFns = [];
const invariant = { body: "" };
for (const m of sql.matchAll(re)) {
  if (/^p2p_/.test(m[1])) p2pFns.push({ name: m[1], body: m[3] });
  if (m[1] === "money_schema_invariant") invariant.body = m[3];
}
const word = (tok) => new RegExp(`(?<![a-z0-9_])${tok}(?![a-z0-9_])`, "i");
const PUNTERIA = [word("points"), word("xp"), word("marcador_total"), word("award_xp"), word("award_score")];

test("0048 define funciones p2p_", () => { assert(p2pFns.length >= 6, `solo ${p2pFns.length} funciones p2p_`); });
for (const f of p2pFns) {
  test(`${f.name} no toca la economía de puntos`, () => {
    for (const rx of PUNTERIA) assert(!rx.test(f.body), `${f.name} menciona ${rx.source}`);
  });
}
test("money_schema_invariant documenta las excepciones P2P", () => {
  assert(/p2p_pools/.test(invariant.body) && /p2p_settlements/.test(invariant.body),
    "el invariante debe eximir stake/importe de las tablas P2P (registro, no saldo)");
});
