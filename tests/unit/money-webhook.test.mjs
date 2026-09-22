// B2 — la verificación de firma del webhook (verify.ts, copia en Deno) acepta lo
// que firma packages/money-provider/src/signing.ts y rechaza lo alterado/caducado/mal formado.
import { test, assert, loadTs } from "./_harness.mjs";

const signing = await loadTs("packages/money-provider/src/signing.ts");
const verify = await loadTs("supabase/functions/money-webhook/verify.ts");

const SECRET = "s3cret-de-pruebas";
const BODY = JSON.stringify({ event_id: "pool.settled:mock:porra-1", type: "pool.settled", payload: { external_pool_id: "mock:porra-1" } });

test("verify: firma de signing.ts la acepta verify.ts", async () => {
  const now = 1_700_000_000;
  const header = await signing.signBody(SECRET, BODY, now);
  const r = await verify.verifySignature(SECRET, header, BODY, now);
  assert.deepEqual(r, { ok: true });
});

test("verify: cuerpo alterado → mismatch", async () => {
  const now = 1_700_000_000;
  const header = await signing.signBody(SECRET, BODY, now);
  const r = await verify.verifySignature(SECRET, header, BODY + " ", now);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "mismatch");
});

test("verify: secreto distinto → mismatch", async () => {
  const now = 1_700_000_000;
  const header = await signing.signBody(SECRET, BODY, now);
  const r = await verify.verifySignature("otro-secreto", header, BODY, now);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "mismatch");
});

test("verify: marca de tiempo caducada → stale", async () => {
  const t = 1_700_000_000;
  const header = await signing.signBody(SECRET, BODY, t);
  const r = await verify.verifySignature(SECRET, header, BODY, t + 10_000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stale");
});

test("verify: cabecera mal formada → malformed", async () => {
  const r = await verify.verifySignature(SECRET, "t=abc,v1=zz", BODY, 1_700_000_000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "malformed");
});

test("verify: sin v1 → malformed", async () => {
  const r = await verify.verifySignature(SECRET, "t=1700000000", BODY, 1_700_000_000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "malformed");
});

test("verify: cabecera ausente → missing", async () => {
  const r = await verify.verifySignature(SECRET, null, BODY, 1_700_000_000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing");
});

test("verify: hex en mayúsculas se acepta", async () => {
  const now = 1_700_000_000;
  const hex = await signing.hmacHex(SECRET, `${now}.${BODY}`);
  const r = await verify.verifySignature(SECRET, `t=${now},v1=${hex.toUpperCase()}`, BODY, now);
  assert.deepEqual(r, { ok: true });
});
