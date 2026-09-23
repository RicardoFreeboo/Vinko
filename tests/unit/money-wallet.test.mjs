// Wallet + escrow del proveedor (custodia en el proveedor; el núcleo solo refs).
// El mock es determinista y sin estado: los ids salen de la entrada y cada método
// emite el webhook que el núcleo espera (nunca se fía de la redirección).
import { test, assert, loadTs } from "./_harness.mjs";

const mp = await loadTs("packages/money-provider/src/index.ts");
const { MockMoneyProvider, WALLET_WEBHOOK_TYPES } = mp;

function make(extra = {}) {
  const emitted = [];
  const provider = new MockMoneyProvider({ emit: async (evt) => void emitted.push(evt), ...extra });
  return { provider, emitted };
}
const types = (emitted) => emitted.map((e) => e.type);

await test("WALLET_WEBHOOK_TYPES está separado de los de dinero de porras (12 tipos)", () => {
  assert.equal(WALLET_WEBHOOK_TYPES.length, 12);
  assert.ok(WALLET_WEBHOOK_TYPES.includes("wallet.deposit.completed"));
  assert.ok(WALLET_WEBHOOK_TYPES.includes("escrow.payout"));
  // No se mezclan con MONEY_WEBHOOK_TYPES (que la Edge Function ya acepta).
  assert.ok(!WALLET_WEBHOOK_TYPES.includes("pool.settled"));
});

await test("ensureAccount: id determinista y emite account.created", async () => {
  const { provider, emitted } = make();
  const a = await provider.ensureAccount("user-1", "ES");
  const b = await make().provider.ensureAccount("user-1", "ES");
  assert.equal(a.externalAccountId, "mockacct:user-1");
  assert.equal(a.externalAccountId, b.externalAccountId);
  assert.equal(a.kycLevel, 2);
  assert.deepEqual(types(emitted), ["account.created"]);
});

await test("getBalance: usa opts.balances; por defecto cero", async () => {
  const zero = await make().provider.getBalance("mockacct:x");
  assert.deepEqual(zero, { availableMinor: 0, lockedMinor: 0, currency: "EUR" });
  const bal = { availableMinor: 4200, lockedMinor: 1500, currency: "EUR" };
  const { provider } = make({ balances: () => bal });
  assert.deepEqual(await provider.getBalance("mockacct:x"), bal);
});

await test("deposit: ref determinista por idempotency_key, cajero con importe, webhook completed", async () => {
  const { provider, emitted } = make();
  const r = await provider.deposit({ externalAccountId: "mockacct:u", amountMinor: 2000, method: "bizum", returnUrl: "/cartera", idempotencyKey: "idem-1" });
  assert.equal(r.ledgerRef, "mockdep:mockacct:u:idem-1");
  assert.ok(r.cashierUrl.includes("amount=2000") && r.cashierUrl.includes("method=bizum"));
  assert.deepEqual(types(emitted), ["wallet.deposit.completed"]);
  assert.equal(emitted[0].payload.amount_minor, 2000);
  // Mismo idempotency_key ⇒ misma ref (reintento no duplica).
  const r2 = await make().provider.deposit({ externalAccountId: "mockacct:u", amountMinor: 2000, method: "bizum", returnUrl: "/x", idempotencyKey: "idem-1" });
  assert.equal(r2.ledgerRef, r.ledgerRef);
});

await test("withdraw: queda pendiente (revisión), nunca auto-completa", async () => {
  const { provider, emitted } = make();
  const r = await provider.withdraw({ externalAccountId: "mockacct:u", amountMinor: 3000, destinationRef: "iban-1", idempotencyKey: "w-1" });
  assert.equal(r.ledgerRef, "mockwd:mockacct:u:w-1");
  assert.deepEqual(types(emitted), ["wallet.withdraw.pending"]);
});

await test("escrowHold: bloquea la entrada y emite escrow.held", async () => {
  const { provider, emitted } = make();
  await provider.escrowHold({ externalPoolId: "mock:p1", externalAccountId: "mockacct:u", amountMinor: 500, idempotencyKey: "h-1" });
  assert.deepEqual(types(emitted), ["escrow.held"]);
  assert.equal(emitted[0].payload.amount_minor, 500);
});

await test("escrowSettle: un pago por acertante + apunte de comisión (rake) de Vinko", async () => {
  const { provider, emitted } = make();
  await provider.escrowSettle({ externalPoolId: "mock:p1", winners: [
    { externalAccountId: "mockacct:a", amountMinor: 700 },
    { externalAccountId: "mockacct:b", amountMinor: 700 },
  ], rakeMinor: 100 });
  assert.deepEqual(types(emitted), ["escrow.payout", "escrow.payout", "escrow.released"]);
  const rake = emitted.find((e) => e.type === "escrow.released");
  assert.equal(rake.payload.kind, "rake");
  assert.equal(rake.payload.amount_minor, 100);
});

await test("escrowRefund: devuelve (porra anulada) y emite escrow.refunded", async () => {
  const { provider, emitted } = make();
  await provider.escrowRefund({ externalPoolId: "mock:p1" });
  assert.deepEqual(types(emitted), ["escrow.refunded"]);
});

await test("HttpMoneyProvider implementa todo el contrato de wallet/escrow", async () => {
  const { HttpMoneyProvider } = mp;
  const p = new HttpMoneyProvider({ id: "vinko_money", baseUrl: "https://x", apiKey: "k", signingSecret: "s", fetchImpl: async () => new Response("{}", { status: 200 }) });
  for (const m of ["ensureAccount", "getBalance", "deposit", "withdraw", "escrowHold", "escrowSettle", "escrowRefund"]) {
    assert.equal(typeof p[m], "function", `falta ${m}`);
  }
});
