// Filtros PUROS del agente de tendencias (v3, 21-sep-2026). Sin I/O ni Deno:
// index.ts los importa y un test de Node los ejecuta sobre titulares reales.
// Aquí vive todo lo que decide si una noticia puede ser porra: léxico, cuotas,
// seguridad, política, MENORES, "ya ocurrió", fecha real, entidad y duplicados.

export const BANNED = [
  /apuest\w*/i, /apost\w*/i, /\bbet\b/i, /betting/i, /\bwager\w*/i, /\bcuota\w*/i,
  /\bodds?\b/i, /casa de apuestas/i, /\bjackpot\b/i, /\bbote\b/i, /\bcasino\b/i,
  /\bwallet\b/i, /\bcash\b/i, /ganar dinero/i, /dinero real/i, /\bslots?\b/i,
  /tragaperras/i, /ruleta/i,
];
export const ODDS = /(\bodds\b|\bcuota|\bspread\b|\bpayout\b|\bhandicap\b|\bmoneyline\b|over\/under|\bbookmaker|\btipster|\b[1-9]\.[0-9]{2}\b)/i;
export const UNSAFE = /(asesin|matar\b|mata\b|homicid|apu.alar|tiroteo|masacre|terror|atentad|suicid|autoles|descuartiz|linch|pederast|pedofil|abuso infantil|porno|pornograf|prostituci|zoofil|violaci|envenen|coca.na|hero.na|metanfetam|fentanil|narcotr|traficar|arma de fuego|explosiv|bomba|trata de personas|genocid|nazi|incita.*odio|violent|agred|reyerta|muerto|muere\b|fallec)/i;
// Política partidista FUERA (§0). Solo actualidad neutral y resoluble.
export const POLITICA = /(\bpsoe\b|\bpp\b|\bvox\b|\bsumar\b|\bpodemos\b|\berc\b|\bjunts\b|\bbildu\b|s[áa]nchez|feij[óo]o|abascal|ayuso|puigdemont|moncloa|congreso de los diputados|\bsenado\b|elecciones|ministr\w+|gobierno de espa[ñn]a|parlamento|consejo de europa|bruselas|comisi[óo]n europea|eurodiputad|investidura|moci[óo]n de censura|amnist[íi]a|refer[ée]ndum|migrante|inmigra|deportaci|geopol[íi]tic|\bguerra\b|\bej[ée]rcito\b|militar)/i;

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

// Hora de España para una fecha dada (+1 / +2 según horario de verano).
function offsetMadrid(d: Date): number {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
      .formatToParts(d).find((x) => x.type === "timeZoneName")?.value ?? "GMT+1";
    const m = p.match(/([+-]\d+)/);
    return m ? Number(m[1]) : 1;
  } catch { return 1; }
}
export function diaMadrid(iso: string): string | null {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
  } catch { return iso.slice(0, 10); }
}

// fecha_evento (ISO 8601 del modelo) → cierre. Con hora conocida, 1 h antes
// del inicio; solo con día, a las 00:00 (hora de España) de ese día. Nunca se
// estima nada: si la cadena no es una fecha válida, null.
export type Cierre = { closesAt: string; conHora: boolean; ts: number };
export function cierreDesde(fechaEvento: unknown): Cierre | null {
  if (typeof fechaEvento !== "string") return null;
  const s = fechaEvento.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (!m) return null;
  const [, y, mo, d, hh, mi, tz] = m;
  const conHora = hh !== undefined && !(hh === "00" && mi === "00");
  let ts: number;
  if (tz) {
    ts = Date.parse(`${y}-${mo}-${d}T${hh}:${mi}:00${tz.toUpperCase() === "Z" ? "Z" : tz.includes(":") ? tz : tz.slice(0, 3) + ":" + tz.slice(3)}`);
  } else {
    // sin zona: se interpreta en hora de España
    const aprox = Date.parse(`${y}-${mo}-${d}T${hh ?? "00"}:${mi ?? "00"}:00Z`);
    if (Number.isNaN(aprox)) return null;
    ts = aprox - offsetMadrid(new Date(aprox)) * 3600_000;
  }
  if (Number.isNaN(ts)) return null;
  if (conHora) ts -= 3600_000;
  return { closesAt: new Date(ts).toISOString(), conHora, ts };
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
export function huella(titulo: string, opciones: string[] = [], entidad?: string | null, closesAt?: string | null): Huella {
  return {
    tokens: tokensEvento(titulo, opciones),
    entidad: entidad ? norm(entidad) : null,
    dia: closesAt ? diaMadrid(closesAt) : null,
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
  "decision eliminado eliminada hoguera verano gordo navidad final semifinal espana real").split(" "));
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
  for (const w of n.split(" ")) if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) raices.add(stem(w));
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
export function vetoed(t: string): string | null {
  if (BANNED.some((r) => r.test(t))) return "lexico";
  if (ODDS.test(t)) return "cuotas";
  if (UNSAFE.test(t)) return "seguridad";
  if (POLITICA.test(t)) return "politica";
  if (esMenor(t)) return "menores";
  return null;
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
export type Candidata = {
  pregunta?: string; opciones?: string[]; criterio_de_resolucion?: string;
  fecha_evento?: string | null; ya_ocurrido?: boolean; categoria?: string; invalida?: boolean;
};
// Motivo por el que una candidata NO sirve. null = se puede encolar.
// `material` = titular + contexto de la noticia: la fecha tiene que estar ahí.
export function rejectReason(c: Candidata, material: string, now = Date.now()): string | null {
  if (c.invalida) return "invalida";
  if (c.ya_ocurrido === true) return "ya_ocurrido";
  const p = c.pregunta ?? "";
  const ops = Array.isArray(c.opciones) ? c.opciones.map((o) => String(o ?? "")) : [];
  const crit = c.criterio_de_resolucion ?? "";
  if (!p || p.length < 12 || p.length > 140) return "pregunta";
  if (PASADO.test(p)) return "ya_ocurrido"; // "¿Quién FUE el último expulsado?"
  if (ops.length < 2 || ops.length > 6) return "opciones";
  if (ops.some((o) => !o.trim() || PLACEHOLDER.test(o.trim()))) return "opciones_relleno";
  if (mismoPrefijo(ops)) return "opciones_relleno";
  if (new Set(ops.map(norm)).size !== ops.length) return "opciones_repetidas";
  if (!crit || crit.length < 25) return "sin_resolucion";
  if (!/(seg[uú]n|publica|anuncia|emite|declara|resultado oficial|acta|clasificaci[óo]n|web oficial|comunicado)/i.test(crit)) {
    return "criterio_generico";
  }
  // FECHA: la da el material, no el modelo. Sin fecha en el texto → fuera.
  if (!c.fecha_evento) return "sin_fecha";
  if (!tieneFechaEnTexto(material)) return "sin_fecha";
  const cierre = cierreDesde(c.fecha_evento);
  if (!cierre) return "sin_fecha";
  if (cierre.ts < now + 3 * 3600_000) return "fecha_pasada";
  if (cierre.ts > now + 60 * 86400_000) return "fecha_lejana";
  const v = vetoed([p, ...ops, crit].join(" "));
  if (v) return v;
  return null;
}
