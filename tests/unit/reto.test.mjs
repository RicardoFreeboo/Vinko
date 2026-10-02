// RT-01/RT-07/RT-03 — espejos JS de las reglas SQL de 0057 (lib/reto.ts).
import { test, assert } from "./_harness.mjs";
import { stakeTextError, objectionThreshold, esReto, stakeEmoji } from "../../lib/reto-core.mjs";

await test("stake: una cosa vale; el dinero y los importes no", () => {
  assert.equal(stakeTextError("Una cena"), null);
  assert.equal(stakeTextError("Fregar un mes"), null);
  assert.equal(stakeTextError("El honor"), null);
  assert.equal(stakeTextError("50 €"), "money");
  assert.equal(stakeTextError("20 euros"), "money");
  assert.equal(stakeTextError("5 usd"), "money");
  assert.equal(stakeTextError("dinero en mano"), "money");
  assert.equal(stakeTextError("una apuesta"), "lexicon");
  assert.equal(stakeTextError("el bote"), "lexicon");
  assert.equal(stakeTextError("ab"), "short");
  assert.equal(stakeTextError("x".repeat(61)), "long");
});

await test("umbral de objeciones: 1 en 1v1; 30 % (mín. 1) en grupo", () => {
  assert.equal(objectionThreshold(2), 1);  // 1v1
  assert.equal(objectionThreshold(3), 1);
  assert.equal(objectionThreshold(4), 2);
  assert.equal(objectionThreshold(10), 3);
  assert.equal(objectionThreshold(0), 1);
});

await test("esReto: premio siempre; usuario pequeño sí; grande o editorial no", () => {
  assert.equal(esReto("prize", "editorial", 100), true);
  assert.equal(esReto("vinkos", "user", 2), true);
  assert.equal(esReto("vinkos", "user", 6), true);
  assert.equal(esReto("vinkos", "user", 7), false);
  assert.equal(esReto("vinkos", "editorial", 2), false);
});

await test("emoji del premio según el texto", () => {
  assert.equal(stakeEmoji("Una cena"), "🍽️");
  assert.equal(stakeEmoji("los cafés de la semana"), "☕");
  assert.equal(stakeEmoji("una ronda de cañas"), "🍻");
  assert.equal(stakeEmoji("fregar un mes"), "🎁");
});
