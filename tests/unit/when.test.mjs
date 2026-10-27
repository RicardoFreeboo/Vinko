// lib/when.ts — fechas cortas del inicio (VINKO_PANTALLAS 04): «Hoy 7:00 p. m.»,
// «quedan 2 d 14 h», «2:14 h para saberlo». Zona fija (Bogotá) y «ahora» fijo.
import { test, assert, loadTs } from "./_harness.mjs";

const { whenLabel, leftLabel, clockLeft } = await loadTs("lib/when.ts");
const TZ = "America/Bogota";
const now = new Date("2026-10-27T12:00:00-05:00"); // martes 27-oct, 12:00 en Bogotá

await test("whenLabel: hoy, mañana, día de la semana y fecha", () => {
  assert.match(whenLabel("2026-10-27T19:00:00-05:00", TZ, now), /^Hoy 7:00\sp\.\sm\.$/);
  assert.match(whenLabel("2026-10-28T09:00:00-05:00", TZ, now), /^Mañana 9:00\sa\.\sm\.$/);
  assert.match(whenLabel("2026-11-01T21:00:00-05:00", TZ, now), /^Dom 9:00\sp\.\sm\.$/);
  assert.equal(whenLabel("2026-11-12T21:00:00-05:00", TZ, now), "12 nov");
});

await test("whenLabel: sin espacios duros (Node y el navegador deben pintar lo mismo al hidratar)", () => {
  for (const iso of ["2026-10-27T19:00:00-05:00", "2026-11-01T21:00:00-05:00", "2026-11-12T21:00:00-05:00"]) {
    assert.doesNotMatch(whenLabel(iso, TZ, now), /[\u00a0\u202f]/);
  }
});

await test("whenLabel: el día lo decide la zona, no UTC (23:30 en Bogotá ya es mañana en UTC)", () => {
  assert.match(whenLabel("2026-10-27T23:30:00-05:00", TZ, now), /^Hoy /);
});

await test("leftLabel: días+horas, horas+min, minutos y «ya»", () => {
  assert.equal(leftLabel("2026-10-29T14:30:00-05:00", now), "2 d 2 h");
  assert.equal(leftLabel("2026-10-27T17:20:00-05:00", now), "5 h 20 min");
  assert.equal(leftLabel("2026-10-27T12:12:00-05:00", now), "12 min");
  assert.equal(leftLabel("2026-10-27T11:00:00-05:00", now), "ya");
});

await test("clockLeft: h:mm hasta la fecha, null si ya pasó", () => {
  assert.equal(clockLeft("2026-10-27T14:14:30-05:00", now), "2:14");
  assert.equal(clockLeft("2026-10-27T12:05:00-05:00", now), "0:05");
  assert.equal(clockLeft("2026-10-27T11:59:00-05:00", now), null);
});
