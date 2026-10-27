// Motor de contenido (F2) — lógica pura del proveedor deportivo
// (supabase/functions/sports-provider/deportes.ts): estados, ganador en tiempo
// reglamentario, decisión por partido (B.9.2), ventana de comprobación,
// clásicos y plantilla match_winner (B.5).
import { test, assert, loadTs } from "./_harness.mjs";

const d = await loadTs("supabase/functions/sports-provider/deportes.ts");

const H = 3600_000;
const INICIO = "2026-11-04T00:30:00+00:00"; // 19:30 en Bogotá
const T0 = Date.parse(INICIO);
// Fixture con la forma de API-Football v3
const fx = (short, { ft = [null, null], goles = ft, fecha = INICIO } = {}) => ({
  fixture: { id: 1234567, date: fecha, status: { short } },
  league: { id: 239, name: "Primera A" },
  teams: { home: { id: 1137, name: "Millonarios" }, away: { id: 1132, name: "America de Cali" } },
  goals: { home: goles[0], away: goles[1] },
  score: { fulltime: { home: ft[0], away: ft[1] } },
});

await test("estados: FT/AET/PEN terminados, PST aplazado, CANC, ABD y despachos", () => {
  assert.equal(d.estadoDe("NS"), "scheduled");
  assert.equal(d.estadoDe("2H"), "live");
  assert.equal(d.estadoDe("HT"), "live");
  for (const s of ["FT", "AET", "PEN"]) assert.equal(d.estadoDe(s), "finished");
  assert.equal(d.estadoDe("PST"), "postponed");
  assert.equal(d.estadoDe("CANC"), "cancelled");
  assert.equal(d.estadoDe("ABD"), "abandoned");
  assert.equal(d.estadoDe("AWD"), "abandoned");
});

await test("ganador en tiempo reglamentario: la prórroga y los penales no cuentan", () => {
  assert.deepEqual(d.ganadorReglamentario(fx("FT", { ft: [2, 1] })), { ganador: "home", home: 2, away: 1 });
  assert.equal(d.ganadorReglamentario(fx("FT", { ft: [0, 0] })).ganador, "draw");
  // 1-1 a los 90', gana el visitante en la prórroga: cuenta el empate
  assert.equal(d.ganadorReglamentario(fx("AET", { ft: [1, 1], goles: [1, 2] })).ganador, "draw");
  assert.equal(d.ganadorReglamentario(fx("PEN", { ft: [0, 0], goles: [0, 0] })).ganador, "draw");
  assert.equal(d.ganadorReglamentario(fx("2H", { ft: [null, null], goles: [1, 0] })), null);
});

await test("decidir: tras el final espera 15 min y luego resuelve", () => {
  const f = fx("FT", { ft: [0, 2] });
  assert.equal(d.decidir(f, { inicio: INICIO, finVisto: null, ahora: T0 + 2 * H }).accion, "esperar");
  const fin = new Date(T0 + 2 * H).toISOString();
  assert.equal(d.decidir(f, { inicio: INICIO, finVisto: fin, ahora: T0 + 2 * H + 10 * 60_000 }).accion, "esperar");
  const r = d.decidir(f, { inicio: INICIO, finVisto: fin, ahora: T0 + 2 * H + 16 * 60_000 });
  assert.equal(r.accion, "resolver");
  assert.equal(r.ganador, "away");
});

await test("decidir: aplazado con fecha nueva en 48 h amplía; más tarde o sin fecha, anula", () => {
  const amp = d.decidir(fx("PST", { fecha: new Date(T0 + 24 * H).toISOString() }), { inicio: INICIO, finVisto: null, ahora: T0 });
  assert.equal(amp.accion, "ampliar");
  assert.equal(amp.nuevoInicio, new Date(T0 + 24 * H).toISOString());
  const lejos = d.decidir(fx("PST", { fecha: new Date(T0 + 72 * H).toISOString() }), { inicio: INICIO, finVisto: null, ahora: T0 });
  assert.equal(lejos.accion, "anular");
  assert.equal(d.decidir(fx("PST"), { inicio: INICIO, finVisto: null, ahora: T0 + H }).accion, "esperar");
  assert.equal(d.decidir(fx("PST"), { inicio: INICIO, finVisto: null, ahora: T0 + 7 * H }).accion, "anular");
});

await test("decidir: cancelado y suspendido anulan; en los despachos anula y avisa", () => {
  assert.deepEqual(d.decidir(fx("CANC"), { inicio: INICIO, finVisto: null, ahora: T0 }), { accion: "anular", motivo: "cancelado", avisar: false });
  assert.equal(d.decidir(fx("ABD"), { inicio: INICIO, finVisto: null, ahora: T0 }).accion, "anular");
  for (const s of ["AWD", "WO"]) {
    const r = d.decidir(fx(s), { inicio: INICIO, finVisto: null, ahora: T0 });
    assert.equal(r.accion, "anular");
    assert.equal(r.avisar, true);
  }
  assert.equal(d.decidir(fx("2H", { goles: [1, 0] }), { inicio: INICIO, finVisto: null, ahora: T0 + H }).accion, "esperar");
});

await test("opción ganadora de match_winner: Local 0 · Empate 1 · Visitante 2", () => {
  assert.equal(d.opcionDe("match_winner", "home"), 0);
  assert.equal(d.opcionDe("match_winner", "draw"), 1);
  assert.equal(d.opcionDe("match_winner", "away"), 2);
  assert.equal(d.opcionDe(null, "home"), null);
});

await test("ventana: en cada pasada durante el partido; fuera, una vez por hora", () => {
  assert.equal(d.tocaComprobar(INICIO, new Date(T0).toISOString(), T0 + H), true);
  assert.equal(d.tocaComprobar(INICIO, new Date(T0 + 5 * H - 10 * 60_000).toISOString(), T0 + 5 * H), false);
  assert.equal(d.tocaComprobar(INICIO, new Date(T0 + 4 * H).toISOString(), T0 + 5 * H + 60_000), true);
  assert.equal(d.tocaComprobar(INICIO, null, T0 + 20 * H), true);
});

await test("clásicos: en cualquier orden y sin tildes", () => {
  const pares = [["Millonarios", "Santa Fe"], ["America", "Deportivo Cali"]];
  assert.equal(d.esClasico("Independiente Santa Fe", "Millonarios", pares), true);
  assert.equal(d.esClasico("América de Cali", "Deportivo Cali", pares), true);
  assert.equal(d.esClasico("Millonarios", "Junior", pares), false);
});

await test("plantilla match_winner: opciones ≤ 40, cierre al empezar, resolución 2 h 15 después", () => {
  const t = d.plantillaMatchWinner({ home: "Millonarios", away: "America de Cali", starts_at: INICIO, competition: "Liga BetPlay", external_id: "1234567" });
  assert.equal(t.title, "¿Quién gana Millonarios vs America de Cali?");
  assert.deepEqual(t.options, ["Millonarios", "Empate", "America de Cali"]);
  assert.equal(t.closes_at, new Date(T0).toISOString());
  assert.equal(t.resolves_at, new Date(T0 + 2 * H + 15 * 60_000).toISOString());
  assert.match(t.resolution_criteria, /tiempo reglamentario/);
  assert.match(t.resolution_criteria, /según/);
  const largo = "Club Deportivo Independiente Santa Fe de Bogotá Distrito Capital";
  const t2 = d.plantillaMatchWinner({ home: largo, away: largo, starts_at: INICIO, competition: null, external_id: "1" });
  assert.ok(t2.options.every((o) => o.length <= d.MAX_OPCION));
  assert.ok(t2.title.length <= 120);
});
