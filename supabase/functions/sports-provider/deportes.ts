// Lógica PURA del proveedor deportivo (F2 del motor, 27-oct-2026). Sin I/O ni
// Deno: index.ts la importa y tests/unit/motor-deportes.test.mjs la ejecuta
// con partidos de ejemplo con la forma de API-Football v3.
//
// Qué decide: en qué estado está un partido, quién ganó en el tiempo
// reglamentario, qué hacer con sus predicciones (esperar, resolver, anular o
// ampliar el plazo), cuándo volver a mirarlo y cómo es la plantilla
// «¿Quién gana X vs Y?» (B.5, match_winner).

// Lo mínimo de un fixture de API-Football v3 que usamos.
export type Fixture = {
  fixture: { id: number; date: string; status: { short: string } };
  league?: { id?: number; name?: string; round?: string };
  teams: { home: { id?: number; name: string }; away: { id?: number; name: string } };
  goals?: { home: number | null; away: number | null };
  score?: { fulltime?: { home: number | null; away: number | null } };
};

export type EstadoEvento = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "abandoned";
export type Ganador = "home" | "draw" | "away";

const FINALES = new Set(["FT", "AET", "PEN"]);
// Ganado en los despachos o por incomparecencia: se anula y se avisa (§7.10).
const DESPACHOS = new Set(["AWD", "WO"]);

export function estadoDe(short: string): EstadoEvento {
  if (FINALES.has(short)) return "finished";
  if (short === "PST") return "postponed";
  if (short === "CANC") return "cancelled";
  if (short === "ABD" || DESPACHOS.has(short)) return "abandoned";
  if (short === "NS" || short === "TBD") return "scheduled";
  return "live"; // 1H, HT, 2H, ET, BT, P, SUSP, INT, LIVE
}

// Resultado al final del tiempo reglamentario (90' + añadido): score.fulltime.
// Con prórroga o penales, eso es lo que cuenta (criterio de la plantilla).
export function ganadorReglamentario(f: Fixture): { ganador: Ganador; home: number; away: number } | null {
  const ft = f.score?.fulltime;
  const home = ft?.home ?? (f.fixture.status.short === "FT" ? f.goals?.home : null);
  const away = ft?.away ?? (f.fixture.status.short === "FT" ? f.goals?.away : null);
  if (home == null || away == null) return null;
  return { ganador: home > away ? "home" : home < away ? "away" : "draw", home, away };
}

export type Decision =
  | { accion: "esperar"; motivo: string }
  | { accion: "resolver"; ganador: Ganador; home: number; away: number }
  | { accion: "anular"; motivo: string; avisar: boolean }
  | { accion: "ampliar"; nuevoInicio: string };

export type Contexto = {
  inicio: string;            // starts_at guardado (el previsto)
  finVisto: string | null;   // primera vez que lo vimos terminado
  ahora: number;
  esperaMin?: number;        // minutos tras el final antes de resolver (15)
};

const H = 3600_000;

export function decidir(f: Fixture, c: Contexto): Decision {
  const short = f.fixture.status.short;
  const espera = (c.esperaMin ?? 15) * 60_000;
  if (FINALES.has(short)) {
    if (!c.finVisto) return { accion: "esperar", motivo: "final_recien_visto" };
    if (c.ahora < Date.parse(c.finVisto) + espera) return { accion: "esperar", motivo: "margen_tras_final" };
    const g = ganadorReglamentario(f);
    if (!g) return { accion: "esperar", motivo: "sin_marcador" };
    return { accion: "resolver", ...g };
  }
  if (DESPACHOS.has(short)) return { accion: "anular", motivo: "resuelto_en_despachos", avisar: true };
  if (short === "CANC") return { accion: "anular", motivo: "cancelado", avisar: false };
  if (short === "ABD") return { accion: "anular", motivo: "suspendido", avisar: false };
  if (short === "PST") {
    const previsto = Date.parse(c.inicio);
    const nuevo = Date.parse(f.fixture.date);
    // Con nueva fecha dentro de 48 h: se amplía el plazo; más tarde: se anula.
    if (nuevo > previsto) {
      return nuevo - previsto <= 48 * H
        ? { accion: "ampliar", nuevoInicio: new Date(nuevo).toISOString() }
        : { accion: "anular", motivo: "aplazado", avisar: false };
    }
    // Sin fecha nueva todavía: se espera 6 h desde el inicio previsto.
    return c.ahora > previsto + 6 * H
      ? { accion: "anular", motivo: "aplazado_sin_fecha", avisar: false }
      : { accion: "esperar", motivo: "aplazado_sin_fecha" };
  }
  return { accion: "esperar", motivo: estadoDe(short) };
}

// Opción ganadora según la plantilla (índice de porra_options).
export function opcionDe(templateKey: string | null, g: Ganador): number | null {
  if (templateKey === "match_winner") return g === "home" ? 0 : g === "draw" ? 1 : 2;
  return null;
}

// ¿Toca preguntar por este partido ahora? En ventana (10 min antes a 4 h
// después del inicio), en cada pasada; fuera, como mucho una vez por hora.
export function tocaComprobar(inicio: string, ultimaComprobacion: string | null, ahora: number): boolean {
  const t = Date.parse(inicio);
  if (ahora >= t - 10 * 60_000 && ahora <= t + 4 * H) return true;
  return !ultimaComprobacion || ahora - Date.parse(ultimaComprobacion) >= H;
}

function sinTildes(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
// Clásico si los dos equipos casan con un par de la lista (en cualquier orden).
export function esClasico(home: string, away: string, pares: string[][] = []): boolean {
  const h = sinTildes(home), a = sinTildes(away);
  return pares.some(([x, y]) => {
    const X = sinTildes(x), Y = sinTildes(y);
    return (h.includes(X) && a.includes(Y)) || (h.includes(Y) && a.includes(X));
  });
}

// Plantilla match_winner (B.5): opciones Local · Empate · Visitante, cierre al
// empezar, resolución 2 h 15 min después (90' + descanso + añadido + margen).
export const MAX_OPCION = 40;
export function plantillaMatchWinner(ev: { home: string; away: string; starts_at: string; competition: string | null; external_id: string }) {
  const corta = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");
  const home = corta(ev.home.trim(), MAX_OPCION);
  const away = corta(ev.away.trim(), MAX_OPCION);
  let title = `¿Quién gana ${home} vs ${away}?`;
  if (title.length > 120) title = `¿Quién gana ${corta(home, 50)} vs ${corta(away, 50)}?`;
  const inicio = Date.parse(ev.starts_at);
  return {
    title,
    options: [home, "Empate", away],
    category: "futbol",
    resolution_criteria:
      `Gana la opción que coincida con el resultado oficial al final del tiempo reglamentario (90 minutos más el añadido), ` +
      `sin contar prórroga ni penales, según el acta del partido${ev.competition ? ` de ${ev.competition}` : ""}.`,
    resolution_source: `API-Football (partido ${ev.external_id})`,
    closes_at: new Date(inicio).toISOString(),
    resolves_at: new Date(inicio + 2 * H + 15 * 60_000).toISOString(),
  };
}
