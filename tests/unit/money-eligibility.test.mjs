// Elegibilidad de dinero (M0, docs/money/CONTRATOS_M0.md §B3, MN-01). Función
// PURA: se carga con jiti y se prueba con una matriz de casos. Cubre el orden y
// la acumulación de razones, y las 4 salidas de effectiveCountry.
import { test, assert, loadTs } from "./_harness.mjs";

const { computeEligibility, effectiveCountry } = await loadTs("lib/money/eligibility.ts");

// País de referencia habilitado (modo real, con límites y KYC verificado).
const ES = {
  mode: "partner",
  enabled: true,
  legal_basis_ref: "dgoj:ref",
  currency: "EUR",
  provider: "partner_x",
  stakes_minor: [500, 1000, 2000],
  limits: { stake_max_minor: 5000, pools_per_day_max: 5 },
  rg: { withdraw_before_close: true },
};

// Caso feliz: todo cuadra → elegible.
const HAPPY = {
  anonymous: false,
  killSwitch: false,
  country: ES,
  ipCountry: "ES",
  declaredCountry: "ES",
  birthYear: 2000,
  nowYear: 2026,
  kyc: { status: "verified", country: "ES" },
  selfExcluded: false,
  poolsToday: 0,
  providerAvailable: true,
};

const with_ = (over) => ({ ...HAPPY, ...over });

// ------------------------------------------------------------------ 1) feliz
await test("caso feliz: elegible, sin razones, con límites y país", () => {
  assert.deepEqual(computeEligibility(HAPPY), {
    eligible: true,
    reasons: [],
    kycStatus: "verified",
    country: "ES",
    limits: { stakeMaxMinor: 5000, poolsPerDayMax: 5, currency: "EUR" },
  });
});

// --------------------------------------------------------------- 2) anónimo
await test("anónimo: cortocircuita a ['anonymous'] aunque todo lo demás falle", () => {
  const r = computeEligibility(with_({
    anonymous: true, killSwitch: true, birthYear: null, providerAvailable: false,
    kyc: { status: "none" }, country: null,
  }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["anonymous"]);
  assert.equal(r.country, null);
});

// ------------------------------------------------------------ 3) kill switch
await test("kill switch: única razón kill_switch", () => {
  const r = computeEligibility(with_({ killSwitch: true }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["kill_switch"]);
});

// -------------------------------------------------------- 4) país sin declarar
await test("país sin declarar: country_undeclared (país efectivo = IP)", () => {
  const r = computeEligibility(with_({ declaredCountry: null }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["country_undeclared"]);
  assert.equal(r.country, "ES"); // eff devuelve la IP cuando no hay declarado
});

// ------------------------------------------------------------ 5) IP desconocida
await test("IP desconocida: geo_unknown (país efectivo = declarado)", () => {
  const r = computeEligibility(with_({ ipCountry: null }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["geo_unknown"]);
  assert.equal(r.country, "ES");
});

// --------------------------------------------------------------- 6) geo_mismatch
await test("geo_mismatch: IP ≠ declarado", () => {
  const r = computeEligibility(with_({ ipCountry: "FR", declaredCountry: "ES", kyc: { status: "verified", country: "ES" } }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["geo_mismatch"]);
  assert.equal(r.country, "ES");
});

await test("geo_mismatch: KYC en otro país que el declarado", () => {
  const r = computeEligibility(with_({ kyc: { status: "verified", country: "FR" } }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["geo_mismatch"]);
});

// ------------------------------------------------------------- 7) país apagado
await test("país apagado: country_disabled con cfg null, enabled:false o modo no real", () => {
  for (const country of [null, { ...ES, enabled: false }, { ...ES, mode: "affiliate_only" }, { ...ES, mode: "points_only" }]) {
    const r = computeEligibility(with_({ country }));
    assert.equal(r.eligible, false);
    assert.ok(r.reasons.includes("country_disabled"), JSON.stringify(country));
  }
});

await test("modo affiliate_only: country_disabled (no es partner/own)", () => {
  const r = computeEligibility(with_({ country: { ...ES, mode: "affiliate_only" } }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["country_disabled"]);
});

// ------------------------------------------------------------------- 8) menor
await test("menor: underage con año nulo, con 17 años, y frontera en 18", () => {
  assert.deepEqual(computeEligibility(with_({ birthYear: null })).reasons, ["underage"]);
  assert.deepEqual(computeEligibility(with_({ birthYear: 2009 })).reasons, ["underage"]); // 2026-2009 = 17
  assert.equal(computeEligibility(with_({ birthYear: 2008 })).eligible, true); // 18 justos
});

// ------------------------------------------------------------ 9) sin proveedor
await test("sin proveedor: provider_unavailable", () => {
  const r = computeEligibility(with_({ providerAvailable: false }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["provider_unavailable"]);
});

// --------------------------------------------------------------- 10-12) KYC
await test("kyc none/null: kyc_required", () => {
  assert.deepEqual(computeEligibility(with_({ kyc: { status: "none" } })).reasons, ["kyc_required"]);
  assert.deepEqual(computeEligibility(with_({ kyc: null })).reasons, ["kyc_required"]);
  const rejected = computeEligibility(with_({ kyc: { status: "rejected", country: "ES" } }));
  assert.deepEqual(rejected.reasons, ["kyc_required"]);
  assert.equal(rejected.kycStatus, "rejected");
});

await test("kyc pending: kyc_pending", () => {
  const r = computeEligibility(with_({ kyc: { status: "pending", country: "ES" } }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["kyc_pending"]);
  assert.equal(r.kycStatus, "pending");
});

await test("kyc verified: no aporta razón (contribuye al caso feliz)", () => {
  assert.equal(computeEligibility(with_({ kyc: { status: "verified", country: "ES" } })).eligible, true);
});

// -------------------------------------------------------------- 13) autoexcluido
await test("autoexcluido: self_excluded", () => {
  const r = computeEligibility(with_({ selfExcluded: true }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ["self_excluded"]);
});

// -------------------------------------------------------------- 14) límite diario
await test("límite diario: limit_reached cuando poolsToday ≥ pools_per_day_max", () => {
  assert.deepEqual(computeEligibility(with_({ poolsToday: 5 })).reasons, ["limit_reached"]); // == máx
  assert.deepEqual(computeEligibility(with_({ poolsToday: 9 })).reasons, ["limit_reached"]); // > máx
  assert.equal(computeEligibility(with_({ poolsToday: 4 })).eligible, true); // < máx
});

// ------------------------------------------------ acumulación (no cortocircuita)
await test("acumula TODAS las razones en el orden de MN-01", () => {
  const r = computeEligibility(with_({
    killSwitch: true,
    ipCountry: "FR", // geo_mismatch
    country: { ...ES, enabled: false }, // country_disabled
    birthYear: null, // underage
    providerAvailable: false, // provider_unavailable
    kyc: { status: "pending", country: "ES" }, // kyc_pending
    selfExcluded: true, // self_excluded
    poolsToday: 5, // limit_reached
  }));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, [
    "kill_switch",
    "geo_mismatch",
    "country_disabled",
    "underage",
    "provider_unavailable",
    "kyc_pending",
    "self_excluded",
    "limit_reached",
  ]);
});

// ------------------------------------------------ effectiveCountry (4 salidas)
await test("effectiveCountry: sus 4 salidas y el país que devuelve cada una", () => {
  assert.deepEqual(effectiveCountry({ ipCountry: "ES", declaredCountry: "ES" }), { country: "ES", reason: "ok" });
  assert.deepEqual(effectiveCountry({ ipCountry: null, declaredCountry: "ES" }), { country: "ES", reason: "geo_unknown" });
  assert.deepEqual(effectiveCountry({ ipCountry: "ES", declaredCountry: null }), { country: "ES", reason: "country_undeclared" });
  assert.deepEqual(effectiveCountry({ ipCountry: "FR", declaredCountry: "ES" }), { country: "ES", reason: "geo_mismatch" });
  // KYC en otro país → geo_mismatch aunque IP == declarado.
  assert.deepEqual(effectiveCountry({ ipCountry: "ES", declaredCountry: "ES", kycCountry: "FR" }), { country: "ES", reason: "geo_mismatch" });
  // Ambos nulos → geo_unknown (se comprueba la IP primero), país nulo.
  assert.deepEqual(effectiveCountry({ ipCountry: null, declaredCountry: null }), { country: null, reason: "geo_unknown" });
  // Normaliza a mayúsculas y valida ISO-2 (basura → null).
  assert.deepEqual(effectiveCountry({ ipCountry: "es", declaredCountry: "ES" }), { country: "ES", reason: "ok" });
  assert.deepEqual(effectiveCountry({ ipCountry: "ZZZ", declaredCountry: "ES" }), { country: "ES", reason: "geo_unknown" });
});
