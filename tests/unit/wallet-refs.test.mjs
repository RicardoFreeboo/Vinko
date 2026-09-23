// Motor de dinero fase 2 (0050): cuentas + espejo de ledger. Cortafuegos legal
// (el núcleo no lleva saldos: custodia en el proveedor) y la derivación del saldo
// que muestra wallet_get, replicada en JS para fijar el contrato.
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const sql = fs.readFileSync(path.resolve("supabase/migrations/0050_wallet_refs.sql"), "utf8");
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
const fns = new Map();
for (const m of sql.matchAll(re)) fns.set(m[1], m[3]);

const word = (tok) => new RegExp(`(?<![a-z0-9_])${tok}(?![a-z0-9_])`, "i");
const PUNTERIA = [word("points"), word("xp"), word("marcador_total"), word("award_xp"), word("award_score")];

test("0050 define money_ledger_apply / wallet_get", () => {
  assert(fns.has("money_ledger_apply") && fns.has("wallet_get"));
});

test("wallet_get y money_ledger_apply no tocan la economía de puntos", () => {
  for (const n of ["wallet_get", "money_ledger_apply"]) {
    const body = fns.get(n);
    for (const rx of PUNTERIA) assert(!rx.test(body), `${n} menciona ${rx.source}`);
  }
});

test("money_ledger_apply es solo servicio (auth.uid() is null)", () => {
  const b = fns.get("money_ledger_apply");
  assert(/auth\.uid\(\) is not null then raise exception 'VINKO_SERVICE_ONLY'/.test(b), "debe rechazar llamadas con sesión");
  assert(/on conflict \(event_id\) do nothing/.test(b), "idempotente por event_id");
  assert(/on conflict \(external_ref\)/.test(b), "idempotente por external_ref");
});

test("el núcleo guarda referencias, no saldos (documentado + invariante)", () => {
  // money_accounts se declara explícitamente sin saldo (la custodia es del proveedor).
  assert(/comment on table public\.money_accounts is '[^']*[Ss]in saldo/.test(sql), "money_accounts documentada como sin saldo");
  // El invariante exime cuenta (config) y espejo (apuntes), nunca saldos.
  const inv = fns.get("money_schema_invariant");
  assert(/money_accounts.*currency/.test(inv) && /money_ledger_refs.*amount_minor/.test(inv), "excepciones fase 2 en el invariante");
});

// Réplica de la derivación del saldo de wallet_get (solo lo confirmado).
function balance(entries) {
  const c = entries.filter((e) => e.status === "completed");
  const s = (kinds, sign) => c.filter((e) => kinds.includes(e.kind)).reduce((a, e) => a + sign * e.amount, 0);
  const available = s(["deposit", "payout", "refund", "stake_release"], 1) - s(["withdraw", "stake_hold"], 1);
  const locked = s(["stake_hold"], 1) - s(["stake_release", "refund"], 1);
  return { available: Math.max(available, 0), locked: Math.max(locked, 0) };
}

test("derivación del saldo: depósito, retención y liberación", () => {
  assert.deepEqual(balance([{ kind: "deposit", amount: 5000, status: "completed" }]), { available: 5000, locked: 0 });
  assert.deepEqual(balance([
    { kind: "deposit", amount: 5000, status: "completed" },
    { kind: "stake_hold", amount: 500, status: "completed" },
  ]), { available: 4500, locked: 500 });
  // Pendiente no cuenta.
  assert.deepEqual(balance([{ kind: "deposit", amount: 5000, status: "pending" }]), { available: 0, locked: 0 });
});
