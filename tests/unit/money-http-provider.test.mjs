// HttpMoneyProvider (modo vinko_money / partner_*): construye peticiones firmadas,
// con Idempotency-Key determinista, y mapea las respuestas al contrato. Sin red:
// se inyecta un fetch falso que captura la llamada.
import { test, assert, loadTs } from "./_harness.mjs";

const mod = await loadTs("packages/money-provider/src/http.ts");
const signing = await loadTs("packages/money-provider/src/signing.ts");
const { HttpMoneyProvider, providerEnvSuffix } = mod;

function fakeFetch(responseBody, capture) {
  return async (url, init) => {
    capture.url = url;
    capture.init = init;
    return {
      ok: true,
      status: 200,
      async json() { return responseBody; },
      async text() { return JSON.stringify(responseBody); },
    };
  };
}

function make(responseBody, capture) {
  return new HttpMoneyProvider({
    id: "vinko_money",
    baseUrl: "https://api.example.test/v1/",
    apiKey: "key-abc",
    signingSecret: "sec-123",
    fetchImpl: fakeFetch(responseBody, capture),
  });
}

test("createPool: POST /pools, firmado, Bearer, idempotencia por porra", async () => {
  const cap = {};
  const p = make({ externalPoolId: "ext-1" }, cap);
  const out = await p.createPool({
    porraId: "porra-9", country: "ES", currency: "EUR", stakeMinor: 500, rakeBps: 500,
    closesAt: "2026-10-01T00:00:00Z", optionsCount: 3, resolutionSourceRef: "manual:football:x", createdByUserId: "u1",
  });
  assert.equal(out.externalPoolId, "ext-1");
  assert.equal(cap.url, "https://api.example.test/v1/pools"); // sin doble barra
  assert.equal(cap.init.method, "POST");
  assert.equal(cap.init.headers["authorization"], "Bearer key-abc");
  assert.equal(cap.init.headers["idempotency-key"], "pool:porra-9");
  assert.match(cap.init.headers["x-money-signature"], /^t=\d+,v1=[0-9a-f]+$/);
  // la firma es sobre el cuerpo crudo exacto que se envía
  const sig = cap.init.headers["x-money-signature"];
  const t = Number(sig.match(/t=(\d+)/)[1]);
  const r = await signing.verifySignature("sec-123", sig, cap.init.body, t);
  assert.deepEqual(r, { ok: true });
});

test("join: ruta con externalPoolId codificado + idempotencia por (pool,user)", async () => {
  const cap = {};
  const p = make({ cashierUrl: "https://pay.example/x", participationRef: "pr-1" }, cap);
  const out = await p.join({ externalPoolId: "ext/1", userId: "u2", optionIdx: 1, returnUrl: "/p/slug" });
  assert.equal(out.cashierUrl, "https://pay.example/x");
  assert.equal(cap.url, "https://api.example.test/v1/pools/ext%2F1/join");
  assert.equal(cap.init.headers["idempotency-key"], "join:ext/1:u2");
});

test("settle: manda winningOptionIdx y resultSourceRef; devuelve accepted", async () => {
  const cap = {};
  const p = make({ accepted: true }, cap);
  const out = await p.settle({ externalPoolId: "ext-1", winningOptionIdx: 2, resultSourceRef: "manual:football:x" });
  assert.equal(out.accepted, true);
  assert.equal(cap.url, "https://api.example.test/v1/pools/ext-1/settle");
  assert.deepEqual(JSON.parse(cap.init.body), { winningOptionIdx: 2, resultSourceRef: "manual:football:x" });
});

test("eligibility: sanea kycStatus/reasons desconocidos", async () => {
  const cap = {};
  const p = make({ eligible: false, reasons: ["kyc_required"], kycStatus: "loquesea" }, cap);
  const e = await p.eligibility("u1", "ES");
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ["kyc_required"]);
  assert.equal(e.kycStatus, "none"); // valor no válido → none
});

test("getPoolStatus: GET sin cuerpo; estado desconocido → open", async () => {
  const cap = {};
  const p = make({ status: "raro", participants: 4 }, cap);
  const s = await p.getPoolStatus("ext-1");
  assert.equal(cap.init.method, "GET");
  assert.equal(cap.init.body, undefined);
  assert.equal(s.status, "open");
  assert.equal(s.participants, 4);
});

test("respuesta no-2xx lanza error con el código", async () => {
  const p = new HttpMoneyProvider({
    id: "partner_uk", baseUrl: "https://x.test", apiKey: "k", signingSecret: "s",
    fetchImpl: async () => ({ ok: false, status: 503, async text() { return "down"; }, async json() { return {}; } }),
  });
  await assert.rejects(() => p.getPoolStatus("e1"), /money_provider_503/);
});

test("providerEnvSuffix normaliza el id a nombre de variable", () => {
  assert.equal(providerEnvSuffix("vinko_money"), "VINKO_MONEY");
  assert.equal(providerEnvSuffix("partner_uk"), "PARTNER_UK");
  assert.equal(providerEnvSuffix("partner_es-1"), "PARTNER_ES_1");
});
