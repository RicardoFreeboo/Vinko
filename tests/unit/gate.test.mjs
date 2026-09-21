// lib/gate.ts — código diario de la puerta (djb2 de día|SALT → 6 dígitos) y
// reloj de Madrid. No se fija el valor del código (rota con SALT), solo sus
// propiedades: determinista por día, 6 dígitos, distinto entre días.
import { test, assert, loadTs } from "./_harness.mjs";

const { dailyCode, madridClock } = await loadTs("lib/gate.ts");

await test("dailyCode: 6 dígitos con ceros a la izquierda", () => {
  for (const d of ["2026-09-21", "2026-01-01", "2030-12-31"]) assert.match(dailyCode(d), /^\d{6}$/);
});

await test("dailyCode: el mismo día siempre da el mismo código", () => {
  assert.equal(dailyCode("2026-09-21"), dailyCode("2026-09-21"));
  assert.equal(dailyCode("2026-09-22"), dailyCode("2026-09-22"));
});

await test("dailyCode: días distintos dan códigos distintos (30 días seguidos sin repetir)", () => {
  assert.notEqual(dailyCode("2026-09-21"), dailyCode("2026-09-22"));
  const codes = new Set();
  const d = new Date(Date.UTC(2026, 8, 1));
  for (let i = 0; i < 30; i++) {
    codes.add(dailyCode(d.toISOString().slice(0, 10)));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  assert.equal(codes.size, 30);
});

await test("madridClock: día YYYY-MM-DD y segundos a medianoche en (0, 86400]", () => {
  const { day, secsToMidnight } = madridClock();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(secsToMidnight > 0 && secsToMidnight <= 86400, `secsToMidnight=${secsToMidnight}`);
});

await test("madridClock: cambia de día a medianoche de Madrid, no de UTC (verano = UTC+2)", () => {
  // 21-sep 22:30 UTC = 22-sep 00:30 en Madrid
  const a = madridClock(new Date("2026-09-21T22:30:00Z"));
  assert.equal(a.day, "2026-09-22");
  assert.equal(a.secsToMidnight, 86400 - 30 * 60);
  // 21-sep 21:59:59 UTC = 21-sep 23:59:59 en Madrid → queda 1 s
  const b = madridClock(new Date("2026-09-21T21:59:59Z"));
  assert.equal(b.day, "2026-09-21");
  assert.equal(b.secsToMidnight, 1);
  // invierno = UTC+1: 15-ene 23:30 UTC = 16-ene 00:30 en Madrid
  const c = madridClock(new Date("2026-01-15T23:30:00Z"));
  assert.equal(c.day, "2026-01-16");
});
