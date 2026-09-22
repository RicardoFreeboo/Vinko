// Diccionario regulado de dinero (M0, §B4): paridad de claves, aislamiento del
// léxico general y candado legal de loadMoneyDict.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";
import { test, assert, ROOT } from "./_harness.mjs";

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const readText = (rel) => readFileSync(join(ROOT, rel), "utf8");

const es = readJson("messages/money/es.json");
const en = readJson("messages/money/en.json");

// jiti propio: "server-only" no se resuelve fuera del bundler de Next, así que
// lo apuntamos al shim vacío que ya trae Next; "@" a la raíz, como en tsconfig.
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": ROOT,
    "server-only": join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js"),
  },
});

await test("money-i18n: _meta completo y legal_approved:false en es y en", () => {
  for (const [name, d] of [["es", es], ["en", en]]) {
    assert.ok(d._meta && typeof d._meta === "object", `${name}: falta _meta`);
    assert.equal(d._meta.legal_approved, false, `${name}: legal_approved debe ser false`);
    assert.equal(d._meta.country, "ES", `${name}: _meta.country`);
    assert.ok("approved_by" in d._meta && d._meta.approved_by === null, `${name}: approved_by null`);
    assert.ok("approved_at" in d._meta && d._meta.approved_at === null, `${name}: approved_at null`);
  }
});

await test("money-i18n: misma lista de claves en es y en", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort(), "las claves de es y en deben coincidir");
});

await test("money-i18n: ninguna clave money.* en messages/es.json", () => {
  const main = readJson("messages/es.json");
  const bad = Object.keys(main).filter((k) => k.startsWith("money."));
  assert.deepEqual(bad, [], `messages/es.json no debe tener claves money.*: ${bad.join(", ")}`);
});

await test("money-i18n: lib/i18n.ts no referencia messages/money", () => {
  assert.ok(!readText("lib/i18n.ts").includes("messages/money"), "lib/i18n.ts no debe cargar messages/money");
});

await test("money-i18n: scripts/lexicon-check.mjs no cubre messages/money", () => {
  assert.ok(!readText("scripts/lexicon-check.mjs").includes("messages/money"), "el léxico no debe escanear messages/money");
});

await test("money-i18n: loadMoneyDict → null en producción sin aprobar; diccionario fuera de producción", async () => {
  const { loadMoneyDict } = await jiti.import("@/lib/money/i18n.ts");
  const prev = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "production";
    assert.equal(await loadMoneyDict("es"), null, "en producción sin legal_approved debe devolver null");

    delete process.env.VERCEL_ENV;
    const dict = await loadMoneyDict("es");
    assert.ok(dict && typeof dict === "object", "fuera de producción debe devolver el diccionario");
    assert.equal(dict._meta, undefined, "el diccionario devuelto no debe incluir _meta");
    assert.equal(dict["money.cta"], es["money.cta"], "debe traer las claves money.*");
  } finally {
    if (prev === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prev;
  }
});
