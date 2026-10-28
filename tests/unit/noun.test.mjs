// lib/noun.ts — la palabra visible de «porra» («predicción», decisión del 27-oct).
// La copy escribe {noun}/{nouns}/{Noun}/{Nouns} y t() la rellena; ninguna frase
// de messages/*.json debe volver a escribir la palabra a mano.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, loadTs, ROOT } from "./_harness.mjs";

const { withNoun } = await loadTs("lib/noun.ts");
const { t } = await loadTs("lib/i18n.ts");

await test("withNoun: singular, plural y mayúscula en es y en", () => {
  assert.equal(withNoun("Nueva {noun} · tus {nouns}", "es"), "Nueva predicción · tus predicciones");
  assert.equal(withNoun("{Noun} anulada. {Nouns} abiertas", "es"), "Predicción anulada. Predicciones abiertas");
  assert.equal(withNoun("New {noun} · {Nouns}", "en"), "New prediction · Predictions");
  assert.equal(withNoun("sin llaves", "es"), "sin llaves");
});

await test("t(): rellena la palabra y respeta las variables", () => {
  assert.equal(t("nueva06.title"), "Nueva predicción");
  assert.equal(t("buzon.openCreated", { n: "3" }), "3 predicciones tuyas siguen abiertas");
});

await test("messages: ninguna frase escribe «porra» ni «pool» a mano", () => {
  const dir = join(ROOT, "messages");
  const files = ["es.json", "en.json", ...readdirSync(join(dir, "parts")).map((f) => `parts/${f}`)];
  const hits = [];
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    const obj = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && /\b(porras?|pools?)\b/i.test(v)) hits.push(`${f} ${k}`);
    }
  }
  assert.deepEqual(hits, []);
});
