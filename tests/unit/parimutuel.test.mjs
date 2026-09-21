// Invariante del reparto parimutuel (supabase/migrations/0027_parimutuel.sql,
// resolve_porra): nunca se crean Vinkos.
//   pot       = Σ points_spent de todos los picks
//   win_stake = Σ points_spent de los picks acertantes
//   pay_i     = floor(stake_i × pot / win_stake)   para cada acertante
//   sin acertantes → se devuelve stake_i a cada uno
// Se reimplementa aquí la misma fórmula y se comprueba sobre 200 escenarios
// aleatorios (semilla fija: reproducible). Además se vigila que la ÚLTIMA
// migración que define resolve_porra siga usando esa fórmula.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, ROOT } from "./_harness.mjs";

// Misma aritmética que SQL: numeric exacto + floor → BigInt (división entera).
export function settle(picks, winning) {
  const pot = picks.reduce((s, p) => s + p.stake, 0);
  const winners = picks.filter((p) => p.option === winning);
  const winStake = winners.reduce((s, p) => s + p.stake, 0);
  if (winners.length === 0) return { pot, winners, refunds: picks.map((p) => p.stake), pays: [] };
  const pays = winners.map((p) => Number((BigInt(p.stake) * BigInt(pot)) / BigInt(winStake)));
  return { pot, winners, refunds: [], pays };
}

// mulberry32: PRNG determinista.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260921;
const rand = rng(SEED);
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

function scenario() {
  const nOptions = int(2, 6);
  const nPicks = int(1, 40);
  const picks = Array.from({ length: nPicks }, () => ({ option: int(0, nOptions - 1), stake: int(1, 100) * 10 }));
  const winning = int(0, nOptions - 1);
  return { picks, winning };
}

await test(`200 escenarios aleatorios (semilla ${SEED}): Σ pagos ≤ bote, nadie cobra menos de lo que puso`, () => {
  let conWinners = 0, sinWinners = 0;
  for (let i = 0; i < 200; i++) {
    const { picks, winning } = scenario();
    const r = settle(picks, winning);
    const tag = `escenario ${i}: ${JSON.stringify({ picks, winning })}`;
    if (r.winners.length === 0) {
      sinWinners++;
      assert.deepEqual(r.refunds, picks.map((p) => p.stake), `${tag} · devolución ≠ apostado`);
      assert.equal(r.refunds.reduce((s, x) => s + x, 0), r.pot, `${tag} · Σ devoluciones ≠ bote`);
      continue;
    }
    conWinners++;
    const paid = r.pays.reduce((s, x) => s + x, 0);
    assert.ok(paid <= r.pot, `${tag} · Σ pagos ${paid} > bote ${r.pot}`);
    assert.ok(r.pot - paid < r.winners.length, `${tag} · se pierden ${r.pot - paid} Vinkos por redondeo con ${r.winners.length} acertantes`);
    r.winners.forEach((w, k) => assert.ok(r.pays[k] >= w.stake, `${tag} · el acertante ${k} cobra ${r.pays[k]} < ${w.stake}`));
    r.pays.forEach((p) => assert.ok(Number.isInteger(p) && p >= 0, `${tag} · pago no entero`));
  }
  assert.ok(conWinners > 0 && sinWinners > 0, `la muestra debe cubrir ambos casos (con: ${conWinners}, sin: ${sinWinners})`);
});

await test("sin acertantes: cada uno recupera exactamente lo que puso", () => {
  const r = settle([{ option: 0, stake: 10 }, { option: 1, stake: 500 }, { option: 0, stake: 30 }], 2);
  assert.deepEqual(r.refunds, [10, 500, 30]);
  assert.deepEqual(r.pays, []);
});

await test("todos aciertan: cada uno cobra su importe (Σ pagos = bote)", () => {
  const picks = [{ option: 1, stake: 10 }, { option: 1, stake: 250 }, { option: 1, stake: 1000 }];
  const r = settle(picks, 1);
  assert.deepEqual(r.pays, [10, 250, 1000]);
  assert.equal(r.pays.reduce((s, x) => s + x, 0), r.pot);
});

await test("un único acertante se lleva el bote entero", () => {
  const r = settle([{ option: 0, stake: 10 }, { option: 1, stake: 990 }, { option: 1, stake: 200 }], 0);
  assert.deepEqual(r.pays, [1200]);
});

await test("reparto proporcional: quien pone 500 cobra 50× lo de quien pone 10 (bug de 0026 corregido)", () => {
  const r = settle([{ option: 0, stake: 10 }, { option: 0, stake: 500 }, { option: 1, stake: 510 }], 0);
  // bote 1020, win_stake 510 → ×2 exacto
  assert.deepEqual(r.pays, [20, 1000]);
});

await test("el floor nunca crea Vinkos (caso con división inexacta)", () => {
  const r = settle([{ option: 0, stake: 10 }, { option: 0, stake: 10 }, { option: 0, stake: 10 }, { option: 1, stake: 10 }], 0);
  // bote 40, win_stake 30 → 13.33 → 13 cada uno = 39 ≤ 40
  assert.deepEqual(r.pays, [13, 13, 13]);
  assert.equal(r.pays.reduce((s, x) => s + x, 0), 39);
});

await test("la última migración que define resolve_porra sigue siendo parimutuel con floor + devolución", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const defs = files.filter((f) => /function\s+public\.resolve_porra/.test(readFileSync(join(dir, f), "utf8")));
  assert.ok(defs.length > 0, "ninguna migración define resolve_porra");
  const last = defs[defs.length - 1];
  const sql = readFileSync(join(dir, last), "utf8");
  assert.match(sql, /floor\(\s*r\.points_spent::numeric\s*\*\s*v_pot\s*\/\s*v_win_stake\s*\)/,
    `${last} redefine resolve_porra sin la fórmula floor(stake × pot / win_stake): revisa el reparto y este test`);
  assert.match(sql, /if\s+v_winners\s*=\s*0\s+then[\s\S]*?points\s*=\s*points\s*\+\s*r\.points_spent/,
    `${last}: sin acertantes debe devolver lo apostado`);
});
