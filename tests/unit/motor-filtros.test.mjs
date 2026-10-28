// Motor de contenido (F1) — filtros puros del agente (supabase/functions/trend-generate/filtros.ts):
// vetos (azar, conflicto, electoral; la política ya no veta), fechas en la zona
// del mercado, reglas de la candidata (B.5) y nota 0–100 (B.6).
import { test, assert, loadTs } from "./_harness.mjs";

const f = await loadTs("supabase/functions/trend-generate/filtros.ts");

// 27-oct-2026 10:00 en Bogotá (UTC-5)
const NOW = Date.parse("2026-10-27T15:00:00Z");
const MATERIAL = "Millonarios vs América de Cali, reprogramado para el 4 de noviembre a las 19:30 en El Campín";
const valida = () => ({
  pregunta: "¿Quién gana el clásico Millonarios vs América del 4 de noviembre?",
  opciones: ["Millonarios", "Empate", "América de Cali"],
  categoria: "futbol",
  fecha_evento: "2026-11-04T19:30",
  fecha_resultado: "2026-11-04T21:30",
  ya_ocurrido: false,
  criterio_de_resolucion: "Gana la opción que coincida con el marcador final del tiempo reglamentario según el resultado oficial de la Dimayor.",
  fuente_resolucion: "Dimayor (web oficial)",
  tipo_fuente: "proveedor_oficial",
  reparto_esperado: 45,
  confianza: 0.9,
  es_politica: false,
  es_electoral: false,
  invalida: false,
});
const REGLAS = { now: NOW, tz: "America/Bogota" };

await test("vetos: loterías y sorteos fuera (azar)", () => {
  assert.equal(f.vetoed("Último sorteo de la Lotería de Cundinamarca: resultados de hoy"), "azar");
  assert.equal(f.vetoed("Baloto acumula 20.000 millones para el sábado"), "azar");
  assert.equal(f.vetoed("Sorteo de la Copa Libertadores: posibles rivales de Nacional"), "azar");
});

await test("vetos: cuotas con decimales, conflicto armado y menores siguen fuera", () => {
  assert.equal(f.vetoed("Millonarios paga 2.10 ante América"), "cuotas");
  assert.equal(f.vetoed("Ataque del ELN en el Cauca deja heridos"), "conflicto");
  assert.equal(f.vetoed("El delantero de 16 años que debuta con Nacional el domingo"), "menores");
});

await test("vetos: la política entra (marcada), lo electoral solo en modo electoral", () => {
  const t = "El Congreso vota la reforma pensional el martes";
  assert.equal(f.vetoed(t), null);
  assert.equal(f.esPolitica(t), true);
  assert.equal(f.esPolitica("Millonarios recibe a América el domingo"), false);
  const e = "La Registraduría publica el escrutinio de la consulta popular";
  assert.equal(f.vetoed(e), null);
  assert.equal(f.vetoed(e, { electoral: true }), "electoral");
});

await test("fechas: cierre 1 h antes del evento, en hora de Bogotá", () => {
  assert.equal(f.cierreDesde("2026-11-04T19:30", "America/Bogota").closesAt, "2026-11-04T23:30:00.000Z");
  // solo con día: a las 00:00 de Bogotá
  const d = f.cierreDesde("2026-11-04", "America/Bogota");
  assert.equal(d.closesAt, "2026-11-04T05:00:00.000Z");
  assert.equal(d.conHora, false);
  assert.equal(f.cierreDesde("el domingo", "America/Bogota"), null);
});

await test("fechas: resolves_at con hora o a las 23:59 del día (Bogotá)", () => {
  assert.equal(f.resolucionDesde("2026-11-04T21:30", "America/Bogota").resolvesAt, "2026-11-05T02:30:00.000Z");
  assert.equal(f.resolucionDesde("2026-11-04", "America/Bogota").resolvesAt, "2026-11-05T04:59:00.000Z");
  assert.equal(f.resolucionDesde("", "America/Bogota"), null);
  assert.equal(f.diaLocal("2026-11-05T03:00:00Z", "America/Bogota"), "2026-11-04");
});

await test("candidata válida pasa", () => {
  assert.equal(f.rejectReason(valida(), MATERIAL, REGLAS), null);
});

await test("candidata: tiene que dividir (20–80)", () => {
  assert.equal(f.rejectReason({ ...valida(), reparto_esperado: 85 }, MATERIAL, REGLAS), "consenso");
  assert.equal(f.rejectReason({ ...valida(), reparto_esperado: 15 }, MATERIAL, REGLAS), "consenso");
  assert.equal(f.rejectReason({ ...valida(), reparto_esperado: 80 }, MATERIAL, REGLAS), null);
  assert.equal(f.rejectReason({ ...valida(), reparto_esperado: undefined }, MATERIAL, REGLAS), "sin_reparto");
});

await test("candidata: 2–4 opciones de 40 caracteres como mucho", () => {
  const larga = "Millonarios gana por dos goles de diferencia o más";
  assert.ok(larga.length > f.MAX_OPCION);
  assert.equal(f.rejectReason({ ...valida(), opciones: [larga, "No"] }, MATERIAL, REGLAS), "opcion_larga");
  assert.equal(f.rejectReason({ ...valida(), opciones: ["A uno", "B dos", "C tres", "D cuatro", "E cinco"] }, MATERIAL, REGLAS), "opciones");
  assert.equal(f.rejectReason({ ...valida(), opciones: ["Equipo 1", "Equipo 2"] }, MATERIAL, REGLAS), "opciones_relleno");
});

await test("candidata: fuente y fecha de resultado obligatorias y coherentes", () => {
  assert.equal(f.rejectReason({ ...valida(), fuente_resolucion: "" }, MATERIAL, REGLAS), "sin_fuente");
  assert.equal(f.rejectReason({ ...valida(), fecha_resultado: "" }, MATERIAL, REGLAS), "sin_fecha_resultado");
  // antes del cierre
  assert.equal(f.rejectReason({ ...valida(), fecha_resultado: "2026-11-03T12:00" }, MATERIAL, REGLAS), "fecha_resultado");
  // más de 14 días después del cierre
  assert.equal(f.rejectReason({ ...valida(), fecha_resultado: "2026-12-01" }, MATERIAL, REGLAS), "fecha_resultado");
  // sin fecha en el material: el modelo no puede inventarla
  assert.equal(f.rejectReason(valida(), "Millonarios y América se ven las caras en El Campín", REGLAS), "sin_fecha");
});

await test("candidata: política sí; electoral solo bloquea en modo electoral", () => {
  const pol = {
    ...valida(),
    pregunta: "¿Aprueba el Senado la reforma pensional en la votación del 4 de noviembre?",
    opciones: ["Sí, la aprueba", "No la aprueba"],
    categoria: "otros",
    criterio_de_resolucion: "Cuenta el resultado de la votación en plenaria según el acta publicada por el Senado de la República.",
    fuente_resolucion: "Senado de la República (acta)",
    es_politica: true,
  };
  assert.equal(f.rejectReason(pol, MATERIAL, REGLAS), null);
  const elec = { ...pol, es_electoral: true };
  assert.equal(f.rejectReason(elec, MATERIAL, REGLAS), null);
  assert.equal(f.rejectReason(elec, MATERIAL, { ...REGLAS, electoral: true }), "electoral");
});

await test("nota: sin calor (F3) su peso se reparte; todo al máximo = 100", () => {
  const r = f.nota({ now: NOW, resolvesAt: NOW + 6 * 3600_000, reparto: 50, heat: null, tipoFuente: "proveedor_oficial", categoriaCorta: true });
  assert.equal(r.score, 100);
  assert.equal(r.breakdown.heat, null);
});

await test("nota: tabla de B.6 (pronto, divide, comprobable, mezcla)", () => {
  // reparto 80 → divide 0: (0,30 + 0 + 0,15 + 0,10) / 0,80 = 68,75
  assert.equal(f.nota({ now: NOW, resolvesAt: NOW + 3600_000, reparto: 80, tipoFuente: "proveedor_oficial", categoriaCorta: true }).score, 69);
  // 5 días (0,4) · prensa (0,5) · categoría ya cubierta (0,3): 0,475 / 0,80 = 59 → bajo el umbral de 60
  assert.equal(f.nota({ now: NOW, resolvesAt: NOW + 5 * 86400_000, reparto: 50, tipoFuente: "prensa", categoriaCorta: false }).score, 59);
  // con calor 50: (0,30 + 0,25 + 0,10 + 0,15 + 0,10) / 1 = 90
  assert.equal(f.nota({ now: NOW, resolvesAt: NOW + 3600_000, reparto: 50, heat: 50, tipoFuente: "proveedor_oficial", categoriaCorta: true }).score, 90);
});

await test("mezcla: categoría corta frente a su peso del día", () => {
  const pesos = { futbol: 0.35, reality: 0.30, musica_farandula: 0.20, otros: 0.15 };
  assert.equal(f.categoriaCorta("futbol", { futbol: 4, reality: 1 }, pesos), false);
  assert.equal(f.categoriaCorta("reality", { futbol: 4, reality: 1 }, pesos), true);
  assert.equal(f.categoriaCorta("musica_farandula", {}, pesos), true);
});

await test("entidad: casa por alias y no por palabras genéricas colombianas", () => {
  assert.equal(f.coincideEntidad("Millos remonta en la tabla antes del clásico", "Millonarios", ["Millonarios FC", "Millos"]), true);
  assert.equal(f.coincideEntidad("Colombia exporta más café en octubre", "Selección Colombia", ["Selección Colombia partido"]), false);
  assert.equal(f.coincideEntidad("La Selección Colombia anuncia su convocatoria para noviembre", "Selección Colombia", ["Selección Colombia partido"]), true);
  assert.equal(f.coincideEntidad("Dimayor cambia la fecha 18 de la Liga BetPlay", "Liga BetPlay", ["Liga BetPlay"]), true);
});

await test("duplicados: el mismo partido el mismo día (en Bogotá) es repetido", () => {
  const a = f.huella("¿Quién gana Millonarios vs América?", ["Millonarios", "Empate", "América de Cali"], "Millonarios", "2026-11-04T23:30:00.000Z", "America/Bogota");
  const b = f.huella("Clásico Millonarios América: ¿quién se lo lleva?", ["Millonarios", "América"], "Millonarios", "2026-11-04T23:00:00.000Z", "America/Bogota");
  assert.equal(f.esRepetida(b, [a]), true);
});
