// lib/cover.ts — coverTheme(category, title): temática de la portada de una
// porra sin vídeo. Fija el mapeo con títulos reales del feed para que un cambio
// en las regex no mande "La Velada" a Realities o "Alonso" a Actualidad.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, loadTs, ROOT } from "./_harness.mjs";

const { coverTheme } = await loadTs("lib/cover.ts");

const CASES = [
  // [categoría, título, tema esperado]
  [null, "¿Se producirá una hoguera de confrontación en 'La isla de las tentaciones'?", "reality"],
  ["TV", "¿Quién será el próximo expulsado en Supervivientes All Stars?", "reality"],
  ["reality_internet", "¿Aceptará la comunidad de streamers la disculpa de TheGrefg?", "streaming"],
  [null, "¿Quién gana el combate estelar de La Velada de Ibai?", "streaming"],
  ["Deporte", "¿Sube Fernando Alonso al podio este domingo?", "motor"],
  [null, "¿Gana Márquez el Gran Premio de MotoGP?", "motor"],
  ["Deporte", "¿Llega Alcaraz a la final del próximo torneo?", "tenis"],
  [null, "¿Llegará Ben Shelton a la final del US Open 2026?", "tenis"],
  ["Deporte", "¿Quién gana el próximo Clásico de Liga?", "futbol"],
  [null, "¿Quién ganará el Balón de Oro 2026?", "futbol"],
  ["Cripto", "¿Cierra Bitcoin el mes por encima de 100.000 $?", "economia"],
  ["Economía", "¿Sube el Salario Mínimo en la próxima revisión?", "economia"],
  ["Música", "¿Aguanta la canción del momento otra semana en el nº1?", "musica"],
  [null, "¿Cantará Aitana en directo en Bilbao?", "musica"],
  [null, "¿Qué película se lleva el Goya a mejor dirección?", "tele"],
  ["Clima", "¿Llueve en Madrid este fin de semana?", "tiempo"],
  [null, "¿Quién será el próximo presidente del Gobierno?", "actualidad"],
];

for (const [cat, title, expected] of CASES) {
  await test(`«${title.slice(0, 48)}» → ${expected}`, () => {
    assert.equal(coverTheme(cat, title).key, expected);
  });
}

await test("la categoría manda aunque el título no diga nada (acentos y mayúsculas normalizados)", () => {
  assert.equal(coverTheme("Fútbol", "¿Quién marca primero?").key, "futbol");
  assert.equal(coverTheme("DEPORTE", "ALONSO Y SAINZ").key, "motor");
  assert.equal(coverTheme(undefined, "¿Llueve mañana?").key, "tiempo");
});

await test("streamers antes que realities: category reality_internet es drama de streamers", () => {
  assert.equal(coverTheme("reality_internet", "¿Vuelve el drama esta semana?").key, "streaming");
  assert.equal(coverTheme("reality_tv", "¿Vuelve el drama esta semana?").key, "reality");
});

await test("cada tema devuelve {key, emoji, from, glow} y el fallback es actualidad", () => {
  const th = coverTheme(null, "Pregunta sin tema reconocible");
  assert.equal(th.key, "actualidad");
  for (const k of ["key", "emoji", "from", "glow"]) assert.equal(typeof th[k], "string", `falta ${k}`);
  assert.match(th.from, /^#[0-9a-f]{6}$/i);
});

await test("todos los temas tienen etiqueta i18n cover.<key> en es.json y en.json", () => {
  const keys = ["streaming", "reality", "motor", "tenis", "futbol", "musica", "tele", "tiempo", "economia", "actualidad"];
  for (const lang of ["es", "en"]) {
    const json = JSON.parse(readFileSync(join(ROOT, "messages", `${lang}.json`), "utf8"));
    for (const k of keys) assert.ok(typeof json[`cover.${k}`] === "string" && json[`cover.${k}`].length > 0, `messages/${lang}.json sin cover.${k}`);
  }
});
