// packages/money-provider (M0, docs/money/CONTRATOS_M0.md §B1): mock sin estado
// con ids deterministas, firma HMAC de webhooks y event_id idempotente.
import { test, assert, loadTs } from "./_harness.mjs";

const mp = await loadTs("packages/money-provider/src/index.ts");
const {
  MockMoneyProvider,
  mockEvent,
  eventId,
  hmacHex,
  signBody,
  verifySignature,
  MONEY_WEBHOOK_TYPES,
  SIG_HEADER,
  EVENT_HEADER,
  PROVIDER_HEADER,
  SIG_TOLERANCE_S,
} = mp;

/** Proveedor mock con captura de eventos emitidos. */
function make(extra = {}) {
  const emitted = [];
  const provider = new MockMoneyProvider({ emit: async (evt) => void emitted.push(evt), ...extra });
  return { provider, emitted };
}

const POOL_INPUT = {
  porraId: "porra-1",
  country: "ES",
  currency: "EUR",
  stakeMinor: 500,
  rakeBps: 500,
  closesAt: "2026-10-01T18:00:00.000Z",
  optionsCount: 3,
  resolutionSourceRef: "manual:futbol:clasico-2026",
  createdByUserId: "admin-1",
};

// ---------------------------------------------------------------- constantes
await test("constantes del contrato (cabeceras, tolerancia, tipos de webhook)", () => {
  assert.equal(SIG_HEADER, "x-money-signature");
  assert.equal(EVENT_HEADER, "x-money-event-id");
  assert.equal(PROVIDER_HEADER, "x-money-provider");
  assert.equal(SIG_TOLERANCE_S, 300);
  assert.deepEqual([...MONEY_WEBHOOK_TYPES], [
    "participation.confirmed", "participation.failed", "participation.refunded", "participation.paid",
    "pool.closed", "pool.settled", "pool.voided", "kyc.updated", "account.suspended",
  ]);
});

// ---------------------------------------------------------------- createPool
await test("createPool: determinista e idempotente (mock:<porraId>), sin emitir eventos", async () => {
  const { provider, emitted } = make();
  assert.equal(provider.id, "mock");
  const a = await provider.createPool(POOL_INPUT);
  const b = await provider.createPool(POOL_INPUT);
  assert.equal(a.externalPoolId, "mock:porra-1");
  assert.deepEqual(a, b);
  // Otra instancia (servidor efímero) → mismo id.
  const c = await make().provider.createPool(POOL_INPUT);
  assert.equal(c.externalPoolId, a.externalPoolId);
  assert.equal(emitted.length, 0);
});

// ---------------------------------------------------------------- join
await test("join: participationRef determinista y cashierUrl con pool, ref, opt y return codificados", async () => {
  const { provider } = make();
  const returnUrl = "https://vinko.fun/p/clasico?ref=abc&x=1";
  const r = await provider.join({ externalPoolId: "mock:porra-1", userId: "user-1", optionIdx: 2, returnUrl });
  assert.equal(r.participationRef, "mockp:mock:porra-1:user-1");
  assert.ok(r.cashierUrl.startsWith("/money/mock/cashier?"), r.cashierUrl);
  // Codificados tal cual en la cadena…
  assert.ok(r.cashierUrl.includes("pool=" + encodeURIComponent("mock:porra-1")), r.cashierUrl);
  assert.ok(r.cashierUrl.includes("ref=" + encodeURIComponent("mockp:mock:porra-1:user-1")), r.cashierUrl);
  assert.ok(r.cashierUrl.includes("opt=2"), r.cashierUrl);
  assert.ok(r.cashierUrl.includes("return=" + encodeURIComponent(returnUrl)), r.cashierUrl);
  assert.ok(!r.cashierUrl.includes("return=https://"), "return debe ir codificado");
  // …y recuperables al decodificar.
  const u = new URL(r.cashierUrl, "http://localhost");
  assert.equal(u.searchParams.get("pool"), "mock:porra-1");
  assert.equal(u.searchParams.get("ref"), "mockp:mock:porra-1:user-1");
  assert.equal(u.searchParams.get("opt"), "2");
  assert.equal(u.searchParams.get("return"), returnUrl);
  // Misma entrada → misma salida (sin estado).
  const r2 = await provider.join({ externalPoolId: "mock:porra-1", userId: "user-1", optionIdx: 2, returnUrl });
  assert.deepEqual(r2, r);
});

await test("join/startKyc: respetan cashierBase personalizado (sin barra final duplicada)", async () => {
  const { provider } = make({ cashierBase: "https://preview.vinko.fun/money/mock/" });
  const r = await provider.join({ externalPoolId: "mock:p", userId: "u", optionIdx: 0, returnUrl: "/p/x" });
  assert.ok(r.cashierUrl.startsWith("https://preview.vinko.fun/money/mock/cashier?"), r.cashierUrl);
  const k = await provider.startKyc("u", "ES", "/p/x");
  assert.ok(k.url.startsWith("https://preview.vinko.fun/money/mock/kyc?"), k.url);
});

// ---------------------------------------------------------------- settle / void
await test("settle(n): emite pool.settled con el MISMO event_id al repetir (idempotencia por event_id)", async () => {
  const lookup = async () => ({ status: "closed", participants: 7, winners_n: 3 });
  const { provider, emitted } = make({ lookup });
  const input = { externalPoolId: "mock:porra-1", winningOptionIdx: 1, resultSourceRef: "manual:futbol:clasico-2026" };
  const a = await provider.settle(input);
  const b = await provider.settle(input);
  assert.deepEqual(a, { accepted: true });
  assert.deepEqual(b, { accepted: true });
  assert.equal(emitted.length, 2);
  const [e1, e2] = emitted;
  assert.equal(e1.type, "pool.settled");
  assert.equal(e1.provider, "mock");
  assert.equal(e1.event_id, eventId("pool.settled", "mock:porra-1"));
  assert.equal(e1.event_id, "pool.settled:mock:porra-1");
  assert.equal(e2.event_id, e1.event_id);
  assert.deepEqual(e1.payload, { external_pool_id: "mock:porra-1", participants: 7, winners_n: 3 });
});

await test("settle(n) sin lookup: participants y winners_n a 0 (el mock no guarda estado)", async () => {
  const { provider, emitted } = make();
  await provider.settle({ externalPoolId: "mock:p2", winningOptionIdx: 0, resultSourceRef: "manual:x:y" });
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].payload, { external_pool_id: "mock:p2", participants: 0, winners_n: 0 });
});

await test("settle(null): emite pool.voided con reason 'void'", async () => {
  const { provider, emitted } = make();
  const r = await provider.settle({ externalPoolId: "mock:porra-1", winningOptionIdx: null, resultSourceRef: "manual:x:y" });
  assert.deepEqual(r, { accepted: true });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "pool.voided");
  assert.equal(emitted[0].event_id, eventId("pool.voided", "mock:porra-1"));
  assert.deepEqual(emitted[0].payload, { external_pool_id: "mock:porra-1", reason: "void" });
});

await test("voidPool: emite pool.voided con el motivo y event_id = eventId('pool.voided', id)", async () => {
  const { provider, emitted } = make();
  const r = await provider.voidPool({ externalPoolId: "mock:porra-1", reason: "event_cancelled" });
  assert.deepEqual(r, { accepted: true });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "pool.voided");
  assert.equal(emitted[0].provider, "mock");
  assert.equal(emitted[0].event_id, "pool.voided:mock:porra-1");
  assert.deepEqual(emitted[0].payload, { external_pool_id: "mock:porra-1", reason: "event_cancelled" });
  // Repetir → mismo event_id (la BD lo deduplica).
  await provider.voidPool({ externalPoolId: "mock:porra-1", reason: "otra" });
  assert.equal(emitted[1].event_id, emitted[0].event_id);
});

// ---------------------------------------------------------------- eligibility / kyc / status
await test("eligibility: según kyc (verified → elegible; pending → kyc_pending; otros → kyc_required)", async () => {
  const kycOf = { u_ok: "verified", u_pend: "pending", u_none: "none", u_rej: "rejected", u_exp: "expired" };
  const { provider } = make({ kyc: (u) => kycOf[u] });
  const ok = await provider.eligibility("u_ok", "ES");
  assert.deepEqual(ok, {
    eligible: true, reasons: [], kycStatus: "verified", country: "ES",
    limits: { stakeMaxMinor: 5000, poolsPerDayMax: 5, currency: "EUR" },
  });
  const pend = await provider.eligibility("u_pend", "ES");
  assert.equal(pend.eligible, false);
  assert.deepEqual(pend.reasons, ["kyc_pending"]);
  assert.equal(pend.kycStatus, "pending");
  for (const u of ["u_none", "u_rej", "u_exp"]) {
    const e = await provider.eligibility(u, "ES");
    assert.equal(e.eligible, false, u);
    assert.deepEqual(e.reasons, ["kyc_required"], u);
    assert.equal(e.kycStatus, kycOf[u]);
  }
  // Moneda por país: GB → GBP, resto → EUR.
  const gb = await provider.eligibility("u_ok", "GB");
  assert.equal(gb.limits.currency, "GBP");
  assert.equal(gb.country, "GB");
  // Sin `kyc` → verified por defecto.
  const def = await make().provider.eligibility("cualquiera", "PT");
  assert.equal(def.eligible, true);
  assert.equal(def.kycStatus, "verified");
  assert.equal(def.limits.currency, "EUR");
});

await test("startKyc: url del cajero con user, country y return codificados", async () => {
  const { provider } = make();
  const r = await provider.startKyc("user-1", "ES", "/p/clasico?x=1");
  assert.equal(r.url, `/money/mock/kyc?user=user-1&country=ES&return=${encodeURIComponent("/p/clasico?x=1")}`);
});

await test("getPoolStatus: lookup si existe; si no, open/0", async () => {
  const noLookup = await make().provider.getPoolStatus("mock:p");
  assert.deepEqual(noLookup, { status: "open", participants: 0 });
  const seen = [];
  const { provider } = make({ lookup: async (id) => (seen.push(id), { status: "settled", participants: 4, winners_n: 1 }) });
  const st = await provider.getPoolStatus("mock:p9");
  assert.deepEqual(st, { status: "settled", participants: 4 });
  assert.deepEqual(seen, ["mock:p9"]);
});

// ---------------------------------------------------------------- eventId / mockEvent
await test("eventId: `${type}:${parts.join(':')}` determinista", () => {
  assert.equal(eventId("pool.settled", "mock:p1"), "pool.settled:mock:p1");
  assert.equal(eventId("participation.confirmed", "mock:p1", "mockp:mock:p1:u1"), "participation.confirmed:mock:p1:mockp:mock:p1:u1");
  assert.equal(eventId("account.suspended"), "account.suspended:");
});

await test("mockEvent: provider 'mock' y event_id determinista a partir del payload", () => {
  const p = { external_pool_id: "mock:p1", participation_ref: "mockp:mock:p1:u1" };
  const a = mockEvent("participation.confirmed", p);
  const b = mockEvent("participation.confirmed", { ...p });
  assert.equal(a.provider, "mock");
  assert.equal(a.type, "participation.confirmed");
  assert.equal(a.event_id, eventId("participation.confirmed", "mock:p1", "mockp:mock:p1:u1"));
  assert.equal(a.event_id, b.event_id);
  assert.deepEqual(a.payload, p);
  // Tipos distintos sobre la misma participación → ids distintos (confirmed ≠ failed).
  assert.notEqual(mockEvent("participation.failed", p).event_id, a.event_id);
  // kyc.updated: user, país y estado (verified y expired no se pisan).
  const k1 = mockEvent("kyc.updated", { user_id: "u1", country: "ES", kyc_status: "verified" });
  const k2 = mockEvent("kyc.updated", { user_id: "u1", country: "ES", kyc_status: "expired" });
  assert.equal(k1.event_id, "kyc.updated:u1:ES:verified");
  assert.notEqual(k1.event_id, k2.event_id);
  // Coherente con lo que emite la clase para pool.*
  assert.equal(mockEvent("pool.voided", { external_pool_id: "mock:p1", reason: "x" }).event_id, eventId("pool.voided", "mock:p1"));
});

// ---------------------------------------------------------------- firma HMAC
await test("hmacHex: vector conocido HMAC-SHA256 en hex minúsculas", async () => {
  // RFC-style vector: HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
  const h = await hmacHex("key", "The quick brown fox jumps over the lazy dog");
  assert.equal(h, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  assert.match(h, /^[0-9a-f]{64}$/);
});

const SECRET = "s3cr3t-mock";
const BODY = JSON.stringify({ event_id: "pool.settled:mock:p1", type: "pool.settled", payload: { external_pool_id: "mock:p1" } });
const NOW = 1_790_000_000;

await test("signBody/verifySignature: ida y vuelta OK (formato t=<s>,v1=<hex>)", async () => {
  const header = await signBody(SECRET, BODY, NOW);
  assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.ok(header.startsWith(`t=${NOW},v1=`));
  assert.equal(header, `t=${NOW},v1=${await hmacHex(SECRET, `${NOW}.${BODY}`)}`);
  assert.deepEqual(await verifySignature(SECRET, header, BODY, NOW), { ok: true });
  // Dentro de la tolerancia (por defecto 300 s) también vale, en ambos sentidos.
  assert.deepEqual(await verifySignature(SECRET, header, BODY, NOW + 299), { ok: true });
  assert.deepEqual(await verifySignature(SECRET, header, BODY, NOW - 299), { ok: true });
  // Sin `t` explícito usa el reloj actual y verifica contra él.
  const live = await signBody(SECRET, BODY);
  assert.deepEqual(await verifySignature(SECRET, live, BODY), { ok: true });
});

await test("verifySignature: cuerpo alterado → mismatch (también secreto distinto)", async () => {
  const header = await signBody(SECRET, BODY, NOW);
  assert.deepEqual(await verifySignature(SECRET, header, BODY + " ", NOW), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifySignature("otro-secreto", header, BODY, NOW), { ok: false, reason: "mismatch" });
  // Firma hex válida pero de otra longitud → mismatch (no malformed).
  assert.deepEqual(await verifySignature(SECRET, `t=${NOW},v1=abcd`, BODY, NOW), { ok: false, reason: "mismatch" });
});

await test("verifySignature: t de hace 10 min → stale (y tolerancia configurable)", async () => {
  const header = await signBody(SECRET, BODY, NOW - 600);
  assert.deepEqual(await verifySignature(SECRET, header, BODY, NOW), { ok: false, reason: "stale" });
  // Del futuro también es stale.
  const future = await signBody(SECRET, BODY, NOW + 600);
  assert.deepEqual(await verifySignature(SECRET, future, BODY, NOW), { ok: false, reason: "stale" });
  // Con tolerancia amplia la misma cabecera pasa.
  assert.deepEqual(await verifySignature(SECRET, header, BODY, NOW, 900), { ok: true });
});

await test("verifySignature: cabecera sin v1 → malformed (y otros formatos rotos)", async () => {
  assert.deepEqual(await verifySignature(SECRET, `t=${NOW}`, BODY, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifySignature(SECRET, `t=${NOW},v2=abcd`, BODY, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifySignature(SECRET, `v1=${"a".repeat(64)}`, BODY, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifySignature(SECRET, `t=ayer,v1=${"a".repeat(64)}`, BODY, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifySignature(SECRET, `t=${NOW},v1=zz`, BODY, NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifySignature(SECRET, "garbage", BODY, NOW), { ok: false, reason: "malformed" });
});

await test("verifySignature: cabecera null o vacía → missing", async () => {
  assert.deepEqual(await verifySignature(SECRET, null, BODY, NOW), { ok: false, reason: "missing" });
  assert.deepEqual(await verifySignature(SECRET, "", BODY, NOW), { ok: false, reason: "missing" });
  assert.deepEqual(await verifySignature(SECRET, "   ", BODY, NOW), { ok: false, reason: "missing" });
});

await test("signing.ts no importa nada de Node (debe ser copiable a Deno tal cual)", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { ROOT } = await import("./_harness.mjs");
  const src = readFileSync(join(ROOT, "packages/money-provider/src/signing.ts"), "utf8");
  assert.ok(!/from\s+["']node:/.test(src), "sin imports node:*");
  assert.ok(!/require\(/.test(src), "sin require()");
  assert.ok(src.includes("globalThis.crypto.subtle"), "usa Web Crypto");
});
