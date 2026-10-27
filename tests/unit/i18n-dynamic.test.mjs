// Claves que el código monta con un prefijo variable (scripts/i18n-parity.mjs
// solo ve las literales): si alguien las «limpia» por huérfanas, la pantalla
// enseña la clave cruda. CountrySelect (OnboardingFlow) usa `${prefix}.country…`
// con prefix onb|ajustes; LegalDoc, `${k}.h` / `${k}.b` por sección.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, ROOT } from "./_harness.mjs";

const load = (f) => JSON.parse(readFileSync(join(ROOT, "messages", f), "utf8"));
const dicts = { es: load("es.json"), en: load("en.json") };

await test("CountrySelect: las 5 claves de país existen para onb y ajustes", () => {
  for (const [lang, d] of Object.entries(dicts)) {
    for (const p of ["onb", "ajustes"]) {
      for (const s of ["country", "countryHint", "countryPick", "countryOther", "countryOtherPh"]) {
        assert.ok(d[`${p}.${s}`], `${lang}: falta ${p}.${s}`);
      }
    }
  }
});

await test("LegalDoc: cada sección de privacidad y términos tiene título y cuerpo", () => {
  const secs = [
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `legal.privacy.s${n}`),
    ...[1, 2, 3, 4, 5, 6].map((n) => `legal.terms.s${n}`),
  ];
  for (const [lang, d] of Object.entries(dicts)) {
    for (const k of secs) {
      assert.ok(d[`${k}.h`] && d[`${k}.b`], `${lang}: falta ${k}.h/.b`);
    }
  }
});
