// Filtros PUROS del agente de tendencias (v4, F1 del motor, 27-oct-2026). Sin
// I/O ni Deno: index.ts los importa y tests/unit/motor-filtros.test.mjs los
// ejecuta sobre titulares reales. Aquí vive todo lo que decide si una noticia
// puede ser predicción: léxico, cuotas, azar, seguridad, conflicto, MENORES,
// lo electoral, "ya ocurrió", fecha real, entidad, duplicados y la nota 0–100.
// v4: Colombia (zona del mercado, no Madrid) y la política entra (Nivel B).

export const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /betting/i, /\bwager\w*/i, /\bcuota\w*/i,
  /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i, /\bcasino\b/i,
  /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i, /\bslots?\b/i,
  /tragaperras/i, /ruleta/i,
];
export const ODDS = /(\bodds\b|\bcuota|\bspread\b|\bpayout\b|\bhandicap\b|\bmoneyline\b|over\/under|\bbookmaker|\btipster|\b[1-9]\.[0-9]{2}\b)/i;
export const UNSAFE = /(asesin|matar\b|mata\b|homicid|apu.alar|tiroteo|masacre|terror|atentad|suicid|autoles|descuartiz|linch|pederast|pedofil|abuso infantil|porno|pornograf|prostituci|zoofil|violaci|envenen|coca.na|hero.na|metanfetam|fentanil|narcotr|traficar|arma de fuego|explosiv|bomba|trata de personas|genocid|nazi|incita.*odio|violent|agred|reyerta|muerto|muere\b|fallec)/i;
// AZAR: loterías, sorteos y rifas salen en Google Trends Colombia y no son una
// predicción de habilidad ni algo que Vinko pueda tocar. Fuera siempre.
export const AZAR = /(\bloter[íi]as?\b|\bsorteos?\b|\bbaloto\b|\bchance\b|\brifas?\b|\bsuper ?astro\b|\bmilotto\b)/i;
// CONFLICTO armado y violencia política: fuera siempre (B.15). La política en
// sí ENTRA (decisión de Ricardo, 27-oct) en Nivel B, con revisión humana.
export const CONFLICTO = /(\bguerra\b|\bej[ée]rcito\b|militar|geopol[íi]tic|\bguerrilla|\bdisidencia|\beln\b|\bfarc\b|paramilitar|secuestr)/i;
// ELECTORAL: resultados de elecciones, encuestas, escrutinios. Solo se veta con
// markets.electoral_mode encendido.
export const ELECTORAL = /(elecci[óo]n|electoral|escrutinio|segunda vuelta|consulta popular|registradur[íi]a|\bcomicios|plebiscito|refer[ée]ndum|intenci[óo]n de voto)/i;
// POLÍTICA: no veta; marca la propuesta ('politica') para que el revisor la mire.
export const POLITICA = /(\bpetro\b|casa de nari[ñn]o|presidente de la rep[úu]blica|\bcongreso\b|\bsenado\b|c[áa]mara de representantes|\bministr[oa]s?\b|gobierno nacional|pacto hist[óo]rico|centro democr[áa]tico|partido (liberal|conservador|verde)|\balcald(e|esa|[íi]a)\b|\bgobernador|gobernaci[óo]n|proyecto de ley|moci[óo]n de censura|corte constitucional)/i;

// MENORES NUNCA como sujeto (§0). Cubre categorías de cantera (sub-16, juvenil,
// cadete, alevín, benjamín, infantil), "N años" con N<18 y centros escolares.
// El caso que se coló fue un jugador sub-18 del que hablaba una noticia de
// fichajes; el regex anterior solo cazaba "menor de edad", "niño", "colegio".
export const MENORES = /(\bmenor(es)? de edad\b|\bni[ñn][oa]s?\b|\badolescent|\binfantil(es)?\b|\bcolegio\b|\binstituto\b|\bsub[ -]?1[0-9]\b|\bjuvenil(es)?\b|\bcadetes?\b|\balev[ií]n(es)?\b|\bbenjam[ií]n(es)?\b)/i;
// "a sus 16 años", "de 17 años", "con 15 años" = edad del protagonista.
// Se excluyen duraciones ("hace 5 años", "tras 3 años", "16 años de carrera").
const EDAD = /(?<!(?:hace|tras|durante|cada|casi|[úu]ltimos|primeros|despu[ée]s de|luego de|m[áa]s de|menos de|desde hace)\s)\b(1[0-7]|[1-9]) a[ñn]os\b(?!\s+(?:despu[ée]s|m[áa]s tarde|de (?:carrera|historia|espera|relaci[óo]n|matrimonio|contrato|ausencia|sequ[íi]a|c[áa]rcel|prisi[óo]n|condena|reinado|dominio|trayectoria|vida)))/i;
export function esMenor(t: string): boolean {
  return MENORES.test(t) || EDAD.test(t);
}

// YA OCURRIÓ: el titular/contexto cuenta el desenlace. Preguntar "¿quién será
// campeón?" sobre una final ya jugada fue el fallo más visible del agente
// (US Open, Vuelta, GP de España, Benidorm Fest).
// Fin de palabra que también vale tras vocal acentuada: el \b de JS es ASCII y
// "ganó\b" no casaba NUNCA (por eso pasaban "Sainz ganó el GP de España").
const FIN = "(?![a-z0-9áéíóúñü])";
const rx = (src: string) => new RegExp(src.replaceAll("¬", FIN), "i");
export const PASADO = rx(
  "(\\bgan[óo]¬|\\bperdi[óo]¬|\\btermin[óo]¬|\\bfinaliz[óo]¬|\\bacab[óo]¬|\\bse proclam[óo]¬|\\bse proclama\\b|\\bfue eliminad|\\bfue expulsad|" +
  "\\bfue (el|la) (ganador|ganadora|expulsad[oa]|eliminad[oa]|vencedor|vencedora|salvad[oa])\\b|\\bha sido (eliminad|expulsad|el expulsad|la expulsad|el ganador|la ganadora)|" +
  "\\bresultado\\b|\\bcr[óo]nica\\b|\\bas[íi] fue\\b|\\bas[íi] ha sido\\b|\\bya es campe[óo]n¬|\\bnuev[oa] campe[óo]n¬|\\bse coron[óo]¬|\\bse corona\\b|,\\s*campe[óo]n(a|es)?¬|\\bcampe[óo]n(a)? (del|de la|de los|de las) |" +
  "\\bvenci[óo]¬|\\bderrot[óo]¬|\\bconquist[óo]¬|\\blogr[óo]¬|\\bconsigui[óo]¬|\\bse llev[óo]¬|\\bse impuso\\b|\\bremont[óo]¬|\\bgole[óo]¬|\\bcay[óo] (ante|frente|eliminad|en)\\b|" +
  "\\bha (ganado|perdido|vencido|conquistado|logrado|conseguido|terminado|finalizado)\\b|\\bya tiene ganador|\\bya hay ganador|\\b(el|la) ganadora? (fue|ha sido|es)\\b|" +
  "\\bexpulsad[oa] de (la noche|la gala|anoche)\\b|\\b(el|la) expulsad[oa] (de la gala |de la noche |de anoche |)(fue|es|ha sido)\\b|" +
  "\\bqui[ée]n fue\\b|\\bqui[ée]n ha sido\\b|\\bqui[ée]n gan[óo]¬|\\bqu[ée] pas[óo]¬|\\bqu[ée] ocurri[óo]¬|\\bcelebrad[oa] (ayer|anoche|el pasado)\\b|\\banoche\\b|\\bayer\\b)",
);
// Presente periodístico de resultado ("Alcaraz gana el US Open", "vence 2-0").
const PRESENTE_RESULTADO = /(\b(gana|vence|conquista|derrota|golea|remonta|elimina|arrasa|se impone|se lleva|revalida)\b|\b\d{1,2}-\d{1,2}\b)/i;
const FUTURO = rx(
  "(\\b(ganar[áa]|jugar[áa]n?|se enfrenta|se enfrentan|busca|buscan|se juega|se disputa|disputar[áa]|podr[íi]a|puede|quiere|aspira|luchar[áa]|hoy|ma[ñn]ana|esta noche|esta tarde)¬|\\bpr[óo]xim|" +
  "\\b(este|el) (lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo|fin de semana)\\b|\\?)",
);
export function yaOcurrido(titular: string, contexto = ""): boolean {
  if (PASADO.test(titular) || PASADO.test(contexto)) return true;
  // El presente solo cuenta en el TITULAR y si no hay marcas de futuro.
  return PRESENTE_RESULTADO.test(titular) && !FUTURO.test(titular);
}

// FECHA REAL: el material tiene que decir CUÁNDO ocurre el desenlace. Si no
// hay ni día, ni "este domingo", ni hora, el modelo no puede sino estimar, y
// las estimaciones ("la próxima jornada") fueron otro de los fallos.
const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const DIAS = "lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo";
export const FECHA_EN_TEXTO = new RegExp(
  `(\\b\\d{1,2}\\s+de\\s+(?:${MESES})\\b|\\b(?:${DIAS})\\b|\\bhoy\\b|\\bma[ñn]ana\\b|\\besta (?:noche|tarde|madrugada)\\b|\\beste (?:fin de semana|finde)\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\bnochevieja\\b|\\bnochebuena\\b|\\ba las \\d{1,2}[:.]\\d{2}\\b|\\b\\d{1,2}[:.]\\d{2} ?h\\b)`,
  "i",
);
export function tieneFechaEnTexto(t: string): boolean {
  return FECHA_EN_TEXTO.test(t);
}

// Zona del mercado de lanzamiento. Cada llamada recibe la del mercado
// (markets.tz); esta es solo el valor por defecto.
export const TZ_DEFECTO = "America/Bogota";

// Desfase en horas de una zona IANA para una fecha dada (Bogotá: -5 fijo;
// las zonas con horario de verano lo resuelven solas).
function offsetHoras(d: Date, tz: string): number {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(d).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
    const m = p.match(/([+-])(\d+)(?::(\d{2}))?/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60) : 0;
  } catch { return 0; }
}
// Día local (YYYY-MM-DD) de un instante en la zona dada.
export function diaLocal(iso: string, tz = TZ_DEFECTO): string | null {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch { return iso.slice(0, 10); }
}

// "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM" (con zona opcional) → instante. Sin zona,
// se interpreta en la del mercado. Nunca se estima nada: si no es una fecha
// válida, null.
type FechaLocal = { ts: number; conHora: boolean };
export function parseFechaLocal(valor: unknown, tz = TZ_DEFECTO): FechaLocal | null {
  if (typeof valor !== "string") return null;
  const s = valor.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (!m) return null;
  const [, y, mo, d, hh, mi, zona] = m;
  const conHora = hh !== undefined && !(hh === "00" && mi === "00");
  let ts: number;
  if (zona) {
    ts = Date.parse(`${y}-${mo}-${d}T${hh}:${mi}:00${zona.toUpperCase() === "Z" ? "Z" : zona.includes(":") ? zona : zona.slice(0, 3) + ":" + zona.slice(3)}`);
  } else {
    const aprox = Date.parse(`${y}-${mo}-${d}T${hh ?? "00"}:${mi ?? "00"}:00Z`);
    if (Number.isNaN(aprox)) return null;
    ts = aprox - offsetHoras(new Date(aprox), tz) * 3600_000;
  }
  return Number.isNaN(ts) ? null : { ts, conHora };
}

// fecha_evento (del modelo) → cierre. Con hora conocida, 1 h antes del inicio;
// solo con día, a las 00:00 (hora del mercado) de ese día.
export type Cierre = { closesAt: string; conHora: boolean; ts: number };
export function cierreDesde(fechaEvento: unknown, tz = TZ_DEFECTO): Cierre | null {
  const f = parseFechaLocal(fechaEvento, tz);
  if (!f) return null;
  const ts = f.conHora ? f.ts - 3600_000 : f.ts;
  return { closesAt: new Date(ts).toISOString(), conHora: f.conHora, ts };
}

// fecha_resultado (del modelo: cuándo se sabe el desenlace) → resolves_at. Con
// hora, esa hora; solo con día, a las 23:59 (hora del mercado) de ese día.
export function resolucionDesde(fechaResultado: unknown, tz = TZ_DEFECTO): { resolvesAt: string; ts: number } | null {
  const f = parseFechaLocal(fechaResultado, tz);
  if (!f) return null;
  const ts = f.conHora ? f.ts : f.ts + 86400_000 - 60_000;
  return { resolvesAt: new Date(ts).toISOString(), ts };
}

// Avisos que NO descartan pero el revisor debe ver.
export function flagsSuaves(c: Cierre, now = Date.now()): string[] {
  const f: string[] = [];
  if (!c.conHora) f.push("sin_hora");
  if (c.ts > now + 21 * 86400_000) f.push("lejana");
  return f;
}

// ---------- normalización y tokens ----------
export function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const STOP = new Set(("el la los las un una unos unas de del al a en con sin por para y o u e que quien quienes " +
  "cual cuales como cuando donde este esta estos estas ese esa esos esas aquel aquella se su sus le les lo " +
  "mi mis tu tus nos ya no si es son sera seran ser fue han ha hay habra hubo esta estan estar entre sobre tras " +
  "hasta desde contra ante hacia mas menos muy tan todo toda todos todas otro otra otros otras primer primero " +
  "primera ultimo ultima proximo proxima nuevo nueva gana ganara ganar ganador ganadora vence vencera pasa " +
  "pasara llega llegara queda quedara sigue seguira consigue conseguira logra lograra habra sale saldra " +
  "antes despues durante cada segun porque para porra pique quien").split(" "));
// Solo se quita una "s" final: "fichajes"→"fichaje"; quitar "es" daba "fichaj".
function stem(w: string): string {
  return w.length >= 6 ? w.replace(/s$/, "") : w;
}
// Tokens que identifican un EVENTO: palabras ≥4 letras sin vacías (con raíz
// singular) + números de ≥3 cifras (UFC 331, gala 12) que no sean años.
export function tokensEvento(titulo: string, opciones: string[] = []): Set<string> {
  const out = new Set<string>();
  for (const w of norm([titulo, ...opciones].join(" ")).split(" ")) {
    if (!w) continue;
    if (/^\d+$/.test(w)) { if (w.length >= 3 && !/^(19|20)\d{2}$/.test(w)) out.add(w); continue; }
    if (w.length >= 4 && !STOP.has(w)) out.add(stem(w));
  }
  return out;
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Huella de un evento ya propuesto/abierto: tokens + entidad + día de cierre.
export type Huella = { tokens: Set<string>; entidad: string | null; dia: string | null };
export function huella(titulo: string, opciones: string[] = [], entidad?: string | null, closesAt?: string | null, tz = TZ_DEFECTO): Huella {
  return {
    tokens: tokensEvento(titulo, opciones),
    entidad: entidad ? norm(entidad) : null,
    dia: closesAt ? diaLocal(closesAt, tz) : null,
  };
}
// Repetida si Jaccard ≥ 0.5, o ≥ 0.25 cuando es la misma entidad el mismo día
// (los 3-4 "Kico"/"Velada" del mismo barrido compartían entidad y fecha).
export function esRepetida(h: Huella, previas: Huella[], umbral = 0.5): boolean {
  for (const p of previas) {
    const j = jaccard(h.tokens, p.tokens);
    if (j >= umbral) return true;
    if (h.entidad && p.entidad && h.entidad === p.entidad && h.dia && p.dia && h.dia === p.dia && j >= 0.25) return true;
  }
  return false;
}

// ---------- entidad ----------
// Palabras de las palabras clave que no identifican a nadie ("partido",
// "jornada", "expulsado"): sin esto, cualquier titular de fútbol "casaba".
const GENERICAS = new Set(("partido partidos jornada resultado resultados expulsado expulsada concursante nominados " +
  "nominado gala carrera combate estelar disco cancion concierto etapa equipos espanoles espanola espanol " +
  "seleccion mercado fichaje fichajes candidatura nominaciones presentadores numero streamer playoffs " +
  "decision eliminado eliminada hoguera verano gordo navidad final semifinal espana real " +
  "colombia colombiano colombiana colombianos fecha cuadrangulares liga").split(" "));
export function coincideEntidad(titular: string, nombre: string, claves: string[] = []): boolean {
  const t = " " + norm(titular) + " ";
  const n = norm(nombre);
  if (n && t.includes(" " + n + " ")) return true;
  for (const c of claves) {
    const k = norm(c);
    if (k && t.includes(" " + k + " ")) return true;
  }
  // Siglas ("OT", "UFC", "NBA", "GH") valen como palabra entera aunque sean cortas.
  const exactas = new Set(t.trim().split(" "));
  for (const w of [nombre, ...claves].join(" ").split(/\s+/)) {
    if (/^[A-Z]{2,4}$/.test(w) && exactas.has(w.toLowerCase())) return true;
  }
  const raices = new Set<string>();
  // Las genéricas tampoco cuentan en el nombre: con «Selección Colombia» casaba
  // cualquier titular que dijera «Colombia» (el nombre completo sí casa arriba).
  for (const w of n.split(" ")) if (w.length >= 4 && !STOP.has(w) && !GENERICAS.has(w) && !/^\d+$/.test(w)) raices.add(stem(w));
  for (const c of claves) {
    for (const w of norm(c).split(" ")) {
      if (w.length >= 4 && !STOP.has(w) && !GENERICAS.has(w) && !/^\d+$/.test(w)) raices.add(stem(w));
    }
  }
  const palabras = new Set(t.trim().split(" ").map(stem));
  for (const r of raices) if (palabras.has(r)) return true;
  return false;
}

// ---------- vetos y forma ----------
// La política ya no veta (Nivel B): solo lo electoral, y solo en modo electoral.
export type OpcionesVeto = { electoral?: boolean };
export function vetoed(t: string, o: OpcionesVeto = {}): string | null {
  if (BANNED.some((r) => r.test(t))) return "lexico";
  if (ODDS.test(t)) return "cuotas";
  if (AZAR.test(t)) return "azar";
  if (UNSAFE.test(t)) return "seguridad";
  if (CONFLICTO.test(t)) return "conflicto";
  if (esMenor(t)) return "menores";
  if (o.electoral && ELECTORAL.test(t)) return "electoral";
  return null;
}
export function esPolitica(t: string): boolean {
  return POLITICA.test(t);
}

// Titulares que jamás darán una porra resoluble: opinión, entrevistas,
// recopilatorios, explicativos… Filtrarlos ahorra llamadas al modelo.
const NO_EVENTO = /^(¿?por qué|así (es|fue)|todo lo que|las claves|qué se sabe|esto es lo que|cómo |quién es |el motivo|la razón|opinión|editorial|entrevista|análisis|repasamos|top \d|las \d+|los \d+|\d+ (cosas|claves|razones|motivos))/i;
const NO_EVENTO2 = /(entrevista|en directo|minuto a minuto|última hora|resumen|crónica|horóscopo|recetas?|consejos)/i;
export function looksLikeEvent(t: string): boolean {
  if (t.length < 25 || t.trim().split(/\s+/).length < 4) return false;
  if (NO_EVENTO.test(t.trim()) || NO_EVENTO2.test(t)) return false;
  return true;
}

// Opciones de relleno ("Equipo 1", "Participante A", "Opción II"…).
export const PLACEHOLDER = /^(equipo|opci[óo]n|jugador|pareja|concursante|candidat[oa]|persona|participante|team|player|contestant|nombre)\s*([a-z0-9]|[ivx]{1,3})$/i;
export function mismoPrefijo(ops: string[]): boolean {
  if (ops.length < 2) return false;
  const first = (s: string) => norm(s).split(" ")[0] ?? "";
  const p = first(ops[0]);
  return p.length > 2 && ops.every((o) => first(o) === p);
}

// ---------- veredicto sobre la candidata del modelo ----------
// Las opciones caben en porra_options.label (check de 0001: 1–40 caracteres).
export const MAX_OPCION = 40;
// Categorías de la mezcla del día (content_engine.defaults.category_weights).
export const CATEGORIAS = ["futbol", "reality", "musica_farandula", "otros"] as const;
export const TIPOS_FUENTE = ["proveedor_oficial", "web_oficial", "prensa"] as const;

export type Candidata = {
  pregunta?: string; opciones?: string[]; categoria?: string;
  fecha_evento?: string | null; fecha_resultado?: string | null; ya_ocurrido?: boolean;
  criterio_de_resolucion?: string; fuente_resolucion?: string; tipo_fuente?: string;
  reparto_esperado?: number; confianza?: number;
  es_politica?: boolean; es_electoral?: boolean; invalida?: boolean;
};
// Reglas del mercado con las que se juzga: ahora, zona horaria, modo electoral
// y el consenso máximo (content_engine.discard_consensus_over, 80 → 20–80).
export type Reglas = { now?: number; tz?: string; electoral?: boolean; consensoMax?: number };

// Motivo por el que una candidata NO sirve. null = se puede encolar.
// `material` = titular + contexto de la noticia: la fecha tiene que estar ahí.
export function rejectReason(c: Candidata, material: string, r: Reglas = {}): string | null {
  const now = r.now ?? Date.now();
  const tz = r.tz ?? TZ_DEFECTO;
  const max = r.consensoMax ?? 80;
  if (c.invalida) return "invalida";
  if (c.ya_ocurrido === true) return "ya_ocurrido";
  const p = (c.pregunta ?? "").trim();
  const ops = Array.isArray(c.opciones) ? c.opciones.map((o) => String(o ?? "").trim()) : [];
  const crit = c.criterio_de_resolucion ?? "";
  if (p.length < 8 || p.length > 120) return "pregunta";
  if (PASADO.test(p)) return "ya_ocurrido"; // "¿Quién FUE el último expulsado?"
  if (ops.length < 2 || ops.length > 4) return "opciones";
  if (ops.some((o) => !o || PLACEHOLDER.test(o))) return "opciones_relleno";
  if (ops.some((o) => o.length > MAX_OPCION)) return "opcion_larga";
  if (mismoPrefijo(ops)) return "opciones_relleno";
  if (new Set(ops.map(norm)).size !== ops.length) return "opciones_repetidas";
  if (!crit || crit.length < 25) return "sin_resolucion";
  if (!/(seg[uú]n|publica|anuncia|emite|declara|resultado oficial|acta|clasificaci[óo]n|web oficial|comunicado)/i.test(crit)) {
    return "criterio_generico";
  }
  if ((c.fuente_resolucion ?? "").trim().length < 4) return "sin_fuente";
  // FECHA: la da el material, no el modelo. Sin fecha en el texto → fuera.
  if (!c.fecha_evento) return "sin_fecha";
  if (!tieneFechaEnTexto(material)) return "sin_fecha";
  const cierre = cierreDesde(c.fecha_evento, tz);
  if (!cierre) return "sin_fecha";
  if (cierre.ts < now + 3 * 3600_000) return "fecha_pasada";
  if (cierre.ts > now + 60 * 86400_000) return "fecha_lejana";
  // Cuándo se sabe el desenlace: fecha real, no antes del cierre ni 14 días después.
  const res = resolucionDesde(c.fecha_resultado, tz);
  if (!res) return "sin_fecha_resultado";
  if (res.ts < cierre.ts || res.ts > cierre.ts + 14 * 86400_000) return "fecha_resultado";
  // Tiene que dividir: si se espera más del 80 % en una opción, no hay pique.
  const rep = c.reparto_esperado;
  if (typeof rep !== "number" || !Number.isFinite(rep)) return "sin_reparto";
  if (rep > max || rep < 100 - max) return "consenso";
  if (r.electoral && c.es_electoral === true) return "electoral";
  const v = vetoed([p, ...ops, crit].join(" "), { electoral: r.electoral });
  if (v) return v;
  return null;
}

// ---------- nota de calidad 0–100 (B.6) ----------
export type PesosNota = { resolves_soon: number; divides: number; heat: number; verifiable: number; mix: number };
export const PESOS_NOTA: PesosNota = { resolves_soon: 0.30, divides: 0.25, heat: 0.20, verifiable: 0.15, mix: 0.10 };
export type EntradaNota = {
  now: number; resolvesAt: number; reparto: number;
  heat?: number | null;      // calor 0–100 del radar (F3); sin dato, su peso se reparte
  tipoFuente?: string;       // proveedor_oficial | web_oficial | prensa
  categoriaCorta: boolean;   // su categoría va por debajo de su parte del día
};
export function nota(e: EntradaNota, pesos: PesosNota = PESOS_NOTA): { score: number; breakdown: Record<string, number | null> } {
  const horas = (e.resolvesAt - e.now) / 3600_000;
  const x: Record<keyof PesosNota, number | null> = {
    resolves_soon: horas <= 24 ? 1 : horas <= 72 ? 0.7 : horas <= 168 ? 0.4 : 0.1,
    divides: e.reparto < 20 || e.reparto > 80 ? 0 : 1 - Math.abs(e.reparto - 50) / 30,
    heat: e.heat == null ? null : Math.max(0, Math.min(1, e.heat / 100)),
    verifiable: e.tipoFuente === "proveedor_oficial" ? 1 : e.tipoFuente === "web_oficial" ? 0.8 : 0.5,
    mix: e.categoriaCorta ? 1 : 0.3,
  };
  let num = 0, den = 0;
  for (const k of Object.keys(pesos) as (keyof PesosNota)[]) {
    const v = x[k];
    if (v == null) continue;
    num += pesos[k] * v;
    den += pesos[k];
  }
  const breakdown: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(x)) breakdown[k] = v == null ? null : Math.round(v * 100) / 100;
  return { score: den ? Math.round((100 * num) / den) : 0, breakdown };
}

// ¿La categoría va por debajo de su parte del día? `conteos` = propuestas de
// hoy por categoría en el mercado; `pesos` = category_weights. Sin nada hoy,
// todas van cortas.
export function categoriaCorta(cat: string, conteos: Record<string, number>, pesos: Record<string, number>): boolean {
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  if (!total) return true;
  return (conteos[cat] ?? 0) / total < (pesos[cat] ?? 0);
}
